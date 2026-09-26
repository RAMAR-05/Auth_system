"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/lib/validations/auth";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

type ApiResponse = {
  success?: boolean;
  message?: string;
  code?: string;
};

// Single source of truth for which screen is showing.
type Step = "email" | "reset";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    defaultValues: {
      email: "",
      otp: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const [step, setStep] = useState<Step>("email");

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));

  const [serverError, setServerError] = useState("");

  const [sendLoading, setSendLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const [resendTimer, setResendTimer] = useState(0);

  const [resetSuccess, setResetSuccess] = useState(false);

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const isBusy = sendLoading || resetLoading || resendLoading || resetSuccess;

  /*
   * Resend countdown
   */
  useEffect(() => {
    if (step !== "reset" || resendTimer <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setResendTimer((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [step, resendTimer]);

  /*
   * Send reset code
   */
  async function sendResetCode() {
    const isEmailValid = await trigger("email");

    if (!isEmailValid) {
      return;
    }

    const cleanEmail = getValues("email").trim().toLowerCase();

    setServerError("");
    setSendLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: cleanEmail,
        }),
      });

      let result: ApiResponse = {};

      try {
        result = await response.json();
      } catch {
        result = {};
      }

      if (!response.ok) {
        if (result.code === "EMAIL_NOT_VERIFIED") {
          router.replace(
            `/verify-email?email=${encodeURIComponent(cleanEmail)}`
          );
          return;
        }

        setServerError(
          result.message || "Unable to send the reset code. Please try again."
        );
        return;
      }

      /*
       * Reset code was actually sent (the backend now only reaches
       * here for a verified, existing account).
       */
      setValue("email", cleanEmail, {
        shouldValidate: false,
        shouldDirty: true,
      });

      setOtp(Array(OTP_LENGTH).fill(""));

      setValue("otp", "", {
        shouldValidate: false,
        shouldDirty: true,
      });

      setStep("reset");
      setResendTimer(RESEND_SECONDS);

      window.setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 50);
    } catch {
      setServerError("Unable to connect to the server. Please try again.");
    } finally {
      setSendLoading(false);
    }
  }

  /*
   * Resend reset code
   */
  async function handleResend() {
    if (isBusy || resendTimer > 0) {
      return;
    }

    setResendLoading(true);

    try {
      await sendResetCode();
    } finally {
      setResendLoading(false);
    }
  }

  /*
   * Reset password
   */
  async function handleReset(data: ResetPasswordInput) {
    if (isBusy || step !== "reset") {
      return;
    }

    // Backstop: never let an incomplete form reach the server, no
    // matter what triggered this call.
    if (!/^\d{6}$/.test(data.otp)) {
      setServerError("Please enter the full 6-digit code.");
      return;
    }

    if (!data.newPassword || !data.confirmPassword) {
      setServerError("Please enter and confirm your new password.");
      return;
    }

    if (data.newPassword !== data.confirmPassword) {
      setServerError("Passwords do not match.");
      return;
    }

    setServerError("");
    setResetLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: data.email,
          otp: data.otp,
          newPassword: data.newPassword,
          confirmPassword: data.confirmPassword,
        }),
      });

      let result: ApiResponse = {};

      try {
        result = await response.json();
      } catch {
        result = {};
      }

      if (!response.ok) {
        setServerError(
          result.message || "Invalid or expired verification code."
        );

        setOtp(Array(OTP_LENGTH).fill(""));

        setValue("otp", "", {
          shouldValidate: false,
          shouldDirty: true,
        });

        inputRefs.current[0]?.focus();

        return;
      }

      /*
       * Password reset successful.
       */
      setResetSuccess(true);

      window.setTimeout(() => {
        router.replace("/login");
      }, 1800);
    } catch {
      setServerError("Unable to connect to the server. Please try again.");
    } finally {
      setResetLoading(false);
    }
  }

  /*
   * Reset button wrapper
   */
  function handleResetClick() {
    void handleSubmit(handleReset)();
  }

  /*
   * OTP input change
   */
  function handleOtpChange(index: number, value: string) {
    if (isBusy || step !== "reset") {
      return;
    }

    const digit = value.replace(/\D/g, "").slice(-1);

    const next = [...otp];

    next[index] = digit;

    setOtp(next);

    setValue("otp", next.join(""), {
      shouldValidate: false,
      shouldDirty: true,
    });

    setServerError("");

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  /*
   * OTP keyboard navigation
   */
  function handleOtpKeyDown(
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (isBusy || step !== "reset") {
      return;
    }

    if (event.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }

    if (event.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }

    if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  /*
   * OTP paste
   */
  function handleOtpPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    if (isBusy || step !== "reset") {
      return;
    }

    event.preventDefault();

    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);

    if (!pasted) {
      return;
    }

    const next = Array(OTP_LENGTH).fill("");

    pasted.split("").forEach((digit, index) => {
      next[index] = digit;
    });

    setOtp(next);

    setValue("otp", pasted, {
      shouldValidate: false,
      shouldDirty: true,
    });

    setServerError("");

    const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);

    inputRefs.current[focusIndex]?.focus();
  }

  const displayEmail = getValues("email") || "your email address";

  return (
    <main className="min-h-screen bg-[#f7faf8] px-4 py-10 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-7xl items-center justify-center">
        <div className="w-full max-w-md">
          {/* Brand */}
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-bold text-white shadow-sm shadow-emerald-200">
              A
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Forgot password
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              {step === "reset"
                ? "Enter the 6-digit code and choose a new password."
                : "Enter your email address to receive a reset code."}
            </p>
          </div>

          {/* Card */}
          <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)] sm:p-8">
            {/* Reset success toast */}
            {resetSuccess && (
              <div
                role="status"
                className="fixed right-4 top-4 z-20 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    ✓
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-emerald-800">
                      Password reset
                    </p>

                    <p className="text-xs text-emerald-700">
                      Redirecting you to login...
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Server error */}
            {serverError && !resetSuccess && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-bold">
                  !
                </div>

                <span>{serverError}</span>
              </div>
            )}

            {/* EMAIL */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Email address
              </label>

              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                disabled={isBusy || step === "reset"}
                {...register("email")}
                aria-invalid={Boolean(errors.email)}
                className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
                  errors.email
                    ? "border-red-300 focus:border-red-500 focus:ring-red-500/10"
                    : "border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/10"
                } disabled:cursor-not-allowed disabled:bg-slate-50`}
              />

              {errors.email && (
                <p className="mt-1.5 text-xs font-medium text-red-600">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* SEND CODE */}
            {step === "email" && (
              <button
                type="button"
                onClick={() => {
                  void sendResetCode();
                }}
                disabled={sendLoading}
                className="mt-6 flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sendLoading ? (
                  <>
                    <span
                      className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                      aria-hidden="true"
                    />
                    Sending code...
                  </>
                ) : (
                  "Send reset code"
                )}
              </button>
            )}

            {/* OTP + NEW PASSWORD */}
            {step === "reset" && (
              <>
                <div className="mt-6">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700">
                      Reset code
                    </label>

                    <span className="text-xs text-slate-400">6 digits</span>
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    We sent a reset code to{" "}
                    <span className="font-medium text-slate-700">
                      {displayEmail}
                    </span>
                  </p>

                  <div className="mt-3 flex justify-between gap-2">
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        ref={(element) => {
                          inputRefs.current[index] = element;
                        }}
                        type="text"
                        inputMode="numeric"
                        autoComplete={index === 0 ? "one-time-code" : "off"}
                        maxLength={1}
                        value={digit}
                        disabled={isBusy}
                        onChange={(event) => {
                          handleOtpChange(index, event.target.value);
                        }}
                        onKeyDown={(event) => {
                          handleOtpKeyDown(index, event);
                        }}
                        onPaste={handleOtpPaste}
                        aria-label={`Reset code digit ${index + 1}`}
                        aria-invalid={Boolean(errors.otp)}
                        className={`h-12 w-full rounded-xl border bg-white text-center text-lg font-semibold text-slate-900 outline-none transition focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50 sm:h-14 ${
                          errors.otp
                            ? "border-red-300 focus:border-red-500 focus:ring-red-500/10"
                            : "border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/10"
                        }`}
                      />
                    ))}
                  </div>

                  {errors.otp && (
                    <p className="mt-1.5 text-xs font-medium text-red-600">
                      {errors.otp.message}
                    </p>
                  )}
                </div>

                {/* New password */}
                <div className="mt-5">
                  <label
                    htmlFor="newPassword"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    New password
                  </label>

                  <input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    disabled={isBusy}
                    {...register("newPassword")}
                    aria-invalid={Boolean(errors.newPassword)}
                    className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
                      errors.newPassword
                        ? "border-red-300 focus:border-red-500 focus:ring-red-500/10"
                        : "border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/10"
                    } disabled:cursor-not-allowed disabled:bg-slate-50`}
                  />

                  {errors.newPassword && (
                    <p className="mt-1.5 text-xs font-medium text-red-600">
                      {errors.newPassword.message}
                    </p>
                  )}
                </div>

                {/* Confirm password */}
                <div className="mt-4">
                  <label
                    htmlFor="confirmPassword"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Confirm new password
                  </label>

                  <input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    disabled={isBusy}
                    {...register("confirmPassword")}
                    aria-invalid={Boolean(errors.confirmPassword)}
                    className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
                      errors.confirmPassword
                        ? "border-red-300 focus:border-red-500 focus:ring-red-500/10"
                        : "border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/10"
                    } disabled:cursor-not-allowed disabled:bg-slate-50`}
                  />

                  {errors.confirmPassword && (
                    <p className="mt-1.5 text-xs font-medium text-red-600">
                      {errors.confirmPassword.message}
                    </p>
                  )}
                </div>

                {/* Reset */}
                <button
                  type="button"
                  onClick={handleResetClick}
                  disabled={isBusy}
                  className="mt-6 flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resetLoading ? (
                    <>
                      <span
                        className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                        aria-hidden="true"
                      />
                      Resetting...
                    </>
                  ) : (
                    "Reset password"
                  )}
                </button>

                {/* Resend */}
                <div className="mt-5 text-center">
                  <p className="text-sm text-slate-500">
                    Didn&apos;t receive the code?
                  </p>

                  <button
                    type="button"
                    disabled={isBusy || resendTimer > 0}
                    onClick={() => {
                      void handleResend();
                    }}
                    className="mt-2 text-sm font-semibold text-emerald-600 transition hover:text-emerald-700 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    {resendLoading ? (
                      <span className="inline-flex items-center">
                        <span
                          className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
                          aria-hidden="true"
                        />
                        Sending...
                      </span>
                    ) : resendTimer > 0 ? (
                      `Resend code in ${resendTimer}s`
                    ) : (
                      "Resend code"
                    )}
                  </button>
                </div>
              </>
            )}

            {/* Back */}
            <div className="mt-6 border-t border-slate-100 pt-5 text-center">
              <Link
                href="/login"
                className="text-sm font-semibold text-slate-500 transition hover:text-emerald-600"
              >
                ← Back to login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
