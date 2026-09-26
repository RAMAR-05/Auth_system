import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth"; // path to your auth file
import { toNextJsHandler } from "better-auth/next-js";

const { POST: betterAuthPost, GET: betterAuthGet } = toNextJsHandler(auth);

/*
 * Only these Better Auth sub-paths (the part after /api/auth/) may be
 * reached through this catch-all route. Everything else is blocked
 * with a 404, most importantly Better Auth's own built-in email-OTP
 * and password-reset endpoints — those are intentionally NOT allowed
 * here because your own wrapper routes
 * (/api/auth/send-verification-otp, /api/auth/verify-email,
 * /api/auth/forgot-password/send-otp, /api/auth/forgot-password/reset)
 * already cover those flows with Zod validation and anti-enumeration
 * protections that calling Better Auth directly would bypass.
 *
 * "sign-in/social" is the single endpoint for ALL social providers
 * (Google, GitHub, etc.) — the provider is in the request body, not
 * the path. "callback" covers the OAuth redirect back for every
 * provider (callback/google, callback/github, ...).
 */
const ALLOWED_PREFIXES = [
  "sign-in/email",
  "sign-in/social",
  "callback",
  "sign-up/email",
  "sign-out",
  "get-session",
  "session",
  "list-sessions",
  "revoke-session",
  "revoke-sessions",
  "update-user",
  "change-password",
  "delete-user",
];

function getSubPath(request: NextRequest): string {
  const { pathname } = new URL(request.url);
  return pathname.replace(/^\/api\/auth\/?/, "").replace(/\/+$/, "");
}

function isAllowed(subPath: string): boolean {
  return ALLOWED_PREFIXES.some(
    (prefix) => subPath === prefix || subPath.startsWith(`${prefix}/`)
  );
}

function blocked() {
  return NextResponse.json(
    {
      success: false,
      message: "Not found",
    },
    { status: 404 }
  );
}

export async function POST(request: NextRequest) {
  const subPath = getSubPath(request);

  if (!isAllowed(subPath)) {
    return blocked();
  }

  return betterAuthPost(request);
}

export async function GET(request: NextRequest) {
  const subPath = getSubPath(request);

  if (!isAllowed(subPath)) {
    return blocked();
  }

  return betterAuthGet(request);
}
