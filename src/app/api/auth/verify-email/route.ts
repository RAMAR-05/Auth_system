import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyEmailSchema } from "@/lib/validations/auth";
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

    const result = verifyEmailSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          errors: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { email, otp } = result.data;

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

    // Check the actual user record first
    const user = await prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        emailVerified: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid or expired verification code.",
        },
        { status: 400 }
      );
    }

    // Already verified
    if (user.emailVerified) {
      return NextResponse.json(
        {
          success: false,
          code: "EMAIL_ALREADY_VERIFIED",
          message: "Your account has already been verified.",
        },
        { status: 409 }
      );
    }

    // Verify OTP through Better Auth
    const response = await auth.api.verifyEmailOTP({
      body: {
        email,
        otp,
      },
      headers: request.headers,
      asResponse: true,
    });

    return response;
  } catch (error) {
    console.error("Verify email error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Something went wrong",
      },
      { status: 500 }
    );
  }
}
