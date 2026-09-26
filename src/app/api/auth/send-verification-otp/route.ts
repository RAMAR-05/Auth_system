import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendVerificationOtpSchema } from "@/lib/validations/auth";
import { checkRateLimit, getClientIp, sendOtpLimiter } from "@/lib/rate-limit";

// Prisma needs the Node.js runtime; without this, an inherited Edge
// runtime default would crash the route before any try/catch runs.
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

    const result = sendVerificationOtpSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
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
    });

    // Same response whether the account exists or not.
    if (!user || user.emailVerified) {
      return NextResponse.json({
        success: true,
        message:
          "If the account exists and needs verification, a verification OTP has been sent.",
      });
    }

    await auth.api.sendVerificationOTP({
      body: {
        email,
        type: "email-verification",
      },
      headers: request.headers,
    });

    return NextResponse.json({
      success: true,
      message:
        "If the account exists and needs verification, a verification OTP has been sent.",
    });
  } catch (error) {
    console.error("Send verification OTP error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Something went wrong",
      },
      { status: 500 }
    );
  }
}
