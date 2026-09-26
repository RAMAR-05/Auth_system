import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Requires two env vars from your Upstash Redis dashboard:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
const redis = Redis.fromEnv();

/*
 * One limiter instance per use case, since each needs its own
 * window/max and its own Redis key prefix (so they don't collide).
 */
export const sendOtpLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "15 m"),
  prefix: "ratelimit:send-otp",
});

export const verifyOtpLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  prefix: "ratelimit:verify-otp",
});

/**
 * Best-effort client IP extraction. Trusts x-forwarded-for, which is
 * fine behind Vercel's proxy; if you're behind a different reverse
 * proxy, adjust to whatever header it actually sets.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

/**
 * Checks the limit for a combined "email+ip" key. Combining both
 * closes the two easy bypasses of keying by just one: rotating IPs
 * against a single victim email, or spraying many emails from one
 * shared IP.
 */
export async function checkRateLimit(
  limiter: Ratelimit,
  email: string,
  ip: string
): Promise<RateLimitResult> {
  const key = `${email.toLowerCase()}:${ip}`;

  const result = await limiter.limit(key);

  if (result.success) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const retryAfterSeconds = Math.max(
    0,
    Math.ceil((result.reset - Date.now()) / 1000)
  );

  return { allowed: false, retryAfterSeconds };
}
