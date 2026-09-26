import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validations/auth";
import {
  checkRateLimit,
  getClientIp,
  verifyOtpLimiter,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid JSON",
        },
        { status: 400 }
      );
    }

    const result = resetPasswordSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid reset password data",
          errors: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { email, otp, newPassword } = result.data;

    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(verifyOtpLimiter, email, ip);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          code: "RATE_LIMITED",
          message: "Too many attempts. Please try again later.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    // Defense in depth: the forgot-password step already refuses to
    // send a code to an unverified account, but if this route is
    // somehow reached directly for one anyway, reject it here too
    // rather than letting Better Auth's generic OTP error surface.
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        emailVerified: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          code: "USER_NOT_FOUND",
          message: "No account found with this email address.",
        },
        { status: 404 }
      );
    }

    if (!user.emailVerified) {
      return NextResponse.json(
        {
          success: false,
          code: "EMAIL_NOT_VERIFIED",
          message: "Please verify your email before resetting your password.",
          email,
        },
        { status: 403 }
      );
    }

    const response = await auth.api.resetPasswordEmailOTP({
      body: {
        email,
        otp,
        password: newPassword,
      },
      headers: request.headers,
      asResponse: true,
    });

    if (!response.ok) {
      const clone = response.clone();
      clone
        .text()
        .then((text) => {
          console.error(
            "resetPasswordEmailOTP rejected:",
            response.status,
            text
          );
        })
        .catch(() => {});
    }

    return response;
  } catch (error) {
    console.error("Reset password error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Something went wrong",
      },
      { status: 500 }
    );
  }
}
