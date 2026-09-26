// lib/validations/auth.ts
import { z } from "zod";

/* ---------- Shared building blocks ---------- */

// Normalize first (trim + lowercase), THEN validate.
// Order matters: piping ensures the email check runs on the cleaned value.
const emailField = z
  .string({ error: "Email is required" })
  .trim()
  .toLowerCase()
  .max(254, "Email is too long") // RFC 5321 limit
  .pipe(z.email("Please enter a valid email address"));

const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "root",
  "support",
  "help",
  "system",
  "moderator",
  "mod",
  "staff",
  "official",
  "security",
  "api",
  "null",
  "undefined",
  "me",
  "user",
  "test",
]);

const usernameField = z
  .string({ error: "Username is required" })
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be at most 30 characters")
  .regex(
    /^[a-z0-9_]+$/,
    "Username can only contain letters, numbers, and underscores"
  )
  .regex(/^[a-z0-9]/, "Username must start with a letter or number")
  .regex(/[a-z0-9]$/, "Username must end with a letter or number")
  .refine(
    (v) => !v.includes("__"),
    "Username cannot contain consecutive underscores"
  )
  .refine((v) => !RESERVED_USERNAMES.has(v), "This username is not available");

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "qwerty123",
  "iloveyou",
  "admin123",
  "welcome1",
  "letmein123",
]);

// Do NOT trim passwords: spaces can be intentional.
const passwordField = z
  .string({ error: "Password is required" })
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character")
  .refine(
    (v) => !COMMON_PASSWORDS.has(v.toLowerCase()),
    "This password is too common"
  );

/* ---------- Schemas ---------- */

export const signupSchema = z
  .object({
    username: usernameField,
    email: emailField,
    password: passwordField,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((d) => !d.password.toLowerCase().includes(d.username), {
    message: "Password must not contain your username",
    path: ["password"],
  })
  .refine((d) => !d.password.toLowerCase().includes(d.email.split("@")[0]), {
    message: "Password must not contain your email name",
    path: ["password"],
  });

export const loginSchema = z.object({
  email: emailField,
  // Don't enforce strength rules on login (reveals policy, breaks old accounts),
  // but DO cap length so nobody can send a 10 MB "password" to your hasher.
  password: z
    .string({ error: "Password is required" })
    .min(1, "Password is required")
    .max(128, "Invalid email or password"),
});

export const verifyEmailSchema = z.object({
  email: emailField,
  otp: z
    .string({ error: "OTP is required" })
    .trim()
    .regex(/^\d{6}$/, "OTP must be a 6-digit code"),
});
export const resetPasswordSchema = z
  .object({
    email: emailField,
    otp: z
      .string({ error: "OTP is required" })
      .trim()
      .regex(/^\d{6}$/, "OTP must be a 6-digit code"),
    newPassword: passwordField,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
// Replaces the manual body.email?.trim() check in your send-OTP route
export const sendVerificationOtpSchema = z.object({
  email: emailField,
});
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Email must be at most 254 characters")
    .email("Invalid email address"),
});
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type SendVerificationOtpInput = z.infer<
  typeof sendVerificationOtpSchema
>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
