import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { checkRateLimit, getClientIp, sendOtpLimiter } from "@/lib/rate-limit";

// Prisma needs the Node.js runtime; if this route ever inherits an
// Edge runtime default (from a root config, middleware matcher, etc.)
// it will crash before any of the try/catch below ever runs, and the
// client just sees a failed fetch with no JSON body. Pin it here.
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

    const result = forgotPasswordSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid email",
          errors: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { email } = result.data;

    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(sendOtpLimiter, email, ip);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          code: "RATE_LIMITED",
          message: "Too many requests. Please try again later.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

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

    await auth.api.requestPasswordResetEmailOTP({
      body: {
        email,
      },
      headers: request.headers,
    });

    return NextResponse.json({
      success: true,
      message: "A reset code has been sent to your email.",
    });
  } catch (error) {
    console.error("Forgot password OTP error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Something went wrong",
      },
      { status: 500 }
    );
  }
}
