import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";
import { username } from "better-auth/plugins/username";
import { emailOTP } from "better-auth/plugins";
import nodemailer from "nodemailer";

// ============================================================
// Gmail configuration
// ============================================================

const gmailUser = process.env.GMAIL_USER;
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

if (!gmailUser) {
  throw new Error("GMAIL_USER is missing in environment variables");
}

if (!gmailAppPassword) {
  throw new Error("GMAIL_APP_PASSWORD is missing in environment variables");
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: gmailUser,
    pass: gmailAppPassword,
  },
});

// ============================================================
// Test Gmail SMTP connection
// ============================================================

transporter.verify((error, success) => {
  if (error) {
    console.error("================================");
    console.error("❌ GMAIL SMTP CONNECTION FAILED");
    console.error(error);
    console.error("================================");
  } else {
    console.log("================================");
    console.log("✅ GMAIL SMTP CONNECTION READY");
    console.log(success);
    console.log("================================");
  }
});

// ============================================================
// Better Auth
// ============================================================

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  // ==========================================================
  // Email + Password
  // ==========================================================

  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
  },

  // ==========================================================
  // Email verification
  // ==========================================================

  emailVerification: {
    sendOnSignUp: false,
    autoSignInAfterVerification: true,
  },

  // ==========================================================
  // Google OAuth
  // ==========================================================

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  // ==========================================================
  // Better Auth HTTP rate limiting
  // ==========================================================

  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,

    customRules: {
      "/sign-in/email": {
        window: 900,
        max: 5,
      },

      "/sign-up/email": {
        window: 3600,
        max: 10,
      },
    },
  },

  // ==========================================================
  // Maximum 4 active sessions per user
  // ==========================================================

  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          const maxSessions = 4;

          const sessionsToDelete = await prisma.session.findMany({
            where: {
              userId: session.userId,

              // Only count sessions that are still active.
              expiresAt: {
                gt: new Date(),
              },
            },

            // Newest sessions first.
            orderBy: {
              createdAt: "desc",
            },

            // Keep newest 4.
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

          console.log(
            `🗑️ Removed ${sessionsToDelete.length} old session(s) for user ${session.userId}`
          );
        },
      },
    },
  },

  // ==========================================================
  // Plugins
  // ==========================================================

  plugins: [
    username(),

    emailOTP({
      // OTP valid for 5 minutes
      expiresIn: 300,

      // Maximum verification attempts
      allowedAttempts: 5,

      // 6 digit OTP
      otpLength: 6,

      // New OTP invalidates/rotates the previous one
      resendStrategy: "rotate",

      // OTP is stored hashed
      storeOTP: "hashed",

      // ========================================================
      // Send OTP through Gmail using Nodemailer
      // ========================================================

      async sendVerificationOTP({ email, otp, type }) {
        console.log("================================");
        console.log("📨 OTP EMAIL REQUEST");
        console.log("Recipient:", email);
        console.log("Type:", type);

        // DEVELOPMENT ONLY
        if (process.env.NODE_ENV !== "production") {
          console.log("🔐 OTP:", otp);
        }

        console.log("================================");

        const subject =
          type === "email-verification"
            ? "Verify your email"
            : type === "forget-password"
              ? "Reset your password"
              : "Your sign-in code";

        const send = transporter.sendMail({
          from: `Your App <${gmailUser}>`,
          to: email,
          subject,
          text: `Your code is ${otp}. It expires in 5 minutes.`,
        });

        // Log successful email sending
        send
          .then((info) => {
            console.log("================================");
            console.log("✅ OTP EMAIL SENT");
            console.log("Message ID:", info.messageId);
            console.log("To:", email);
            console.log("================================");
          })
          .catch((error) => {
            console.error("================================");
            console.error("❌ FAILED TO SEND OTP EMAIL");
            console.error("Recipient:", email);
            console.error(error);
            console.error("================================");
          });
      },
    }),
  ],
});
