"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  verifyEmailSchema,
  type VerifyEmailInput,
} from "@/lib/validations/auth";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

type ApiResponse = {
  success?: boolean;
  message?: string;
  code?: string;
};

// Single source of truth for which screen is showing.
// This replaces the old `Boolean(emailFromUrl) || codeSentManually`
// derivation, which was two independent flags standing in for one
// piece of state and was the source of the bug.
type Step = "email" | "otp";

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const emailFromUrl = searchParams.get("email")?.trim().toLowerCase() ?? "";

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    trigger,
    control,
    formState: { errors },
  } = useForm<VerifyEmailInput>({
    resolver: zodResolver(verifyEmailSchema),
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    defaultValues: {
      email: emailFromUrl,
      otp: "",
    },
  });

  const email =
    useWatch({
      control,
      name: "email",
    }) ?? "";

  /*
   * Always start on "email". We do NOT assume signup already sent an
   * OTP just because ?email= is on the URL — that assumption was the
   * bug: it skipped the actual API call, so the first code never
   * really went out (only "Resend" worked, since that's the first
   * time sendVerificationCode() ever ran).
   *
   * Instead, when a URL email is present we auto-trigger the same
   * send flow the "Send verification code" button uses, right below.
   */
  const [step, setStep] = useState<Step>("email");

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));

  const [serverError, setServerError] = useState("");

  const [sendLoading, setSendLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const [resendTimer, setResendTimer] = useState(0);

  const [alreadyVerified, setAlreadyVerified] = useState(false);

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const hasAutoSentRef = useRef(false);

  const normalizedEmail = email.trim().toLowerCase();

  const codeSent = step === "otp";

  const isBusy =
    sendLoading || verifyLoading || resendLoading || alreadyVerified;

  /*
   * Resend countdown
   */
  useEffect(() => {
    if (step !== "otp" || resendTimer <= 0) {
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
   * If we arrived with ?email= on the URL, actually send the code
   * once on mount instead of assuming it was already sent. The ref
   * guard keeps this from firing twice under React 18 StrictMode's
   * dev double-invoke, and from re-firing on any re-render.
   */
  useEffect(() => {
    if (emailFromUrl.length > 0 && !hasAutoSentRef.current) {
      hasAutoSentRef.current = true;
      void sendVerificationCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Send verification code
   */
  async function sendVerificationCode() {
    const isEmailValid = await trigger("email");

    if (!isEmailValid) {
      return;
    }

    const cleanEmail = getValues("email").trim().toLowerCase();

    setServerError("");
    setSendLoading(true);

    try {
      const response = await fetch("/api/auth/send-verification-otp", {
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
        if (result.code === "EMAIL_ALREADY_VERIFIED") {
          setAlreadyVerified(true);

          window.setTimeout(() => {
            router.replace("/login");
          }, 1800);

          return;
        }

        setServerError(
          result.message ||
            "Unable to send the verification code. Please try again."
        );
        return;
      }

      /*
       * OTP was successfully sent (or, per the backend's design, the
       * request was accepted — the same response is returned whether
       * or not the account exists/needs verification).
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

      setStep("otp");
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
   * Resend verification code
   */
  async function handleResend() {
    if (isBusy || resendTimer > 0) {
      return;
    }

    setResendLoading(true);

    try {
      await sendVerificationCode();
    } finally {
      setResendLoading(false);
    }
  }

  /*
   * Verify OTP
   */
  async function handleVerify(data: VerifyEmailInput) {
    if (isBusy || step !== "otp") {
      return;
    }

    setServerError("");
    setVerifyLoading(true);

    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: data.email,
          otp: data.otp,
        }),
      });

      let result: ApiResponse = {};

      try {
        result = await response.json();
      } catch {
        result = {};
      }

      /*
       * Already verified
       */
      if (!response.ok) {
        if (result.code === "EMAIL_ALREADY_VERIFIED") {
          setAlreadyVerified(true);

          window.setTimeout(() => {
            router.replace("/login");
          }, 1800);

          return;
        }

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
       * Verification successful
       */
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setServerError("Unable to connect to the server. Please try again.");
    } finally {
      setVerifyLoading(false);
    }
  }

  /*
   * Verify button wrapper
   */
  function handleVerifyClick() {
    void handleSubmit(handleVerify)();
  }

  /*
   * OTP input change
   */
  function handleOtpChange(index: number, value: string) {
    if (isBusy || step !== "otp") {
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
    if (isBusy || step !== "otp") {
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
    if (isBusy || step !== "otp") {
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

  const displayEmail = normalizedEmail || "your email address";

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
              Verify your email
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              {codeSent
                ? "Enter the 6-digit code sent to your email address."
                : "Enter your email address to receive a verification code."}
            </p>
          </div>

          {/* Card */}
          <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)] sm:p-8">
            {/* Already verified popup */}
            {alreadyVerified && (
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
                      Already verified
                    </p>

                    <p className="text-xs text-emerald-700">
                      Redirecting you to login...
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Server error */}
            {serverError && !alreadyVerified && (
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
                disabled={isBusy || codeSent}
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
                  void sendVerificationCode();
                }}
                disabled={sendLoading || alreadyVerified}
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
                  "Send verification code"
                )}
              </button>
            )}

            {/* OTP */}
            {step === "otp" && (
              <>
                <div className="mt-6">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700">
                      Verification code
                    </label>

                    <span className="text-xs text-slate-400">6 digits</span>
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    We sent a verification code to{" "}
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
                        aria-label={`Verification digit ${index + 1}`}
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

                {/* Verify */}
                <button
                  type="button"
                  onClick={handleVerifyClick}
                  disabled={isBusy}
                  className="mt-6 flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {verifyLoading ? (
                    <>
                      <span
                        className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                        aria-hidden="true"
                      />
                      Verifying...
                    </>
                  ) : (
                    "Verify email"
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
                href="/signup"
                className="text-sm font-semibold text-slate-500 transition hover:text-emerald-600"
              >
                ← Back to signup
              </Link>
            </div>
          </div>

          {/* Email */}
          {codeSent && (
            <p className="mt-5 text-center text-xs text-slate-400">
              Verification code requested for{" "}
              <span className="font-medium text-slate-500">{displayEmail}</span>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
