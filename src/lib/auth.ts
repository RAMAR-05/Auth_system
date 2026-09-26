import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";
import { username } from "better-auth/plugins/username";
import { emailOTP } from "better-auth/plugins";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
  },

  emailVerification: {
    sendOnSignUp: false,
    autoSignInAfterVerification: true,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  // Only protects requests that go through Better Auth's own HTTP
  // handler directly (sign-in, sign-up, OAuth, etc.) — your custom
  // OTP/reset routes are covered separately by lib/rate-limit.ts,
  // since Better Auth explicitly does NOT rate-limit auth.api calls.
  rateLimit: {
    enabled: true, // off by default outside production — this makes it explicit and consistent across environments
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 900, max: 5 }, // 5 attempts / 15 min
      "/sign-up/email": { window: 3600, max: 10 }, // 10 attempts / 60 min
    },
  },

  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          const maxSessions = 4;

          const sessionsToDelete = await prisma.session.findMany({
            where: {
              userId: session.userId,
              expiresAt: {
                gt: new Date(),
              },
            },
            orderBy: {
              createdAt: "desc",
            },
            skip: maxSessions,
            select: {
              id: true,
            },
          });

          if (sessionsToDelete.length === 0) {
            return;
          }

          await prisma.session.deleteMany({
            where: {
              id: {
                in: sessionsToDelete.map((s) => s.id),
              },
            },
          });
        },
      },
    },
  },

  plugins: [
    username(),

    emailOTP({
      expiresIn: 300,
      allowedAttempts: 5,
      otpLength: 6,
      resendStrategy: "rotate",
      storeOTP: "hashed",
      async sendVerificationOTP({ email, otp, type }) {
        const subject =
          type === "email-verification"
            ? "Verify your email"
            : type === "forget-password"
              ? "Reset your password"
              : "Your sign-in code";

        // Fire-and-forget on purpose (per Better Auth's own docs):
        // don't await the send, to avoid a timing side-channel that
        // could leak whether an email exists based on response
        // latency. On serverless (Vercel), wrap it in waitUntil so
        // the function doesn't get frozen/killed before the send
        // completes.
        const send = resend.emails.send({
          from: "Your App <noreply@yourdomain.com>", // TODO: replace with your actual Resend-verified domain
          to: email,
          subject,
          text: `Your code is ${otp}. It expires in 5 minutes.`,
        });

        // If deployed on Vercel:
        // import { waitUntil } from "@vercel/functions";
        // waitUntil(send);

        // Otherwise, at minimum log failures so a broken email
        // integration doesn't fail silently:
        send.catch((error) => {
          console.error("Failed to send OTP email:", error);
        });
      },
    }),
  ],
});
