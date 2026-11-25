import { createHash, randomInt, timingSafeEqual } from "crypto";
import { EmailOtp } from "../models/EmailOtp";
import { sendGmail } from "./mailer";

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

type OtpPurpose = "register" | "reset";

function hashCode(code: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is missing from .env");
  }
  return createHash("sha256").update(`${secret}:${code}`).digest("hex");
}

function codesMatch(storedHash: string, code: string): boolean {
  const actual = Buffer.from(hashCode(code));
  const expected = Buffer.from(storedHash);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

async function issueEmailOtp(email: string, purpose: OtpPurpose, subject: string, textFor: (code: string) => string): Promise<void> {
  const latest = await EmailOtp.findOne({ email, purpose }).sort({ createdAt: -1 });

  if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    const error = new Error("Wait a minute before requesting another code.");
    error.name = "OtpCooldown";
    throw error;
  }

  const code = String(randomInt(100000, 1000000));

  await EmailOtp.deleteMany({ email, purpose });
  await EmailOtp.create({
    email,
    purpose,
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    attempts: 0,
  });

  try {
    await sendGmail(email, subject, textFor(code));
  } catch (error) {
    const notConfigured = error instanceof Error && error.name === "GmailNotConfigured";
    const devFallback = process.env.NODE_ENV !== "production" && process.env.OTP_LOG_CODE === "true";
    if (notConfigured && devFallback) {
      console.log(`[RENTA] Gmail is not configured. OTP for ${email}: ${code}`);
      return;
    }
    await EmailOtp.deleteMany({ email, purpose });
    throw error;
  }
}

export function issueRegistrationOtp(email: string): Promise<void> {
  return issueEmailOtp(
    email,
    "register",
    "Your RENTA verification code",
    (code) => `Your RENTA verification code is ${code}. It expires in 10 minutes. If you did not create an account, ignore this email.`
  );
}

export function issuePasswordResetOtp(email: string): Promise<void> {
  return issueEmailOtp(
    email,
    "reset",
    "Reset your RENTA password",
    (code) => `Your RENTA password reset code is ${code}. It expires in 10 minutes. If you did not ask to reset your password, ignore this email.`
  );
}

export async function verifyEmailOtp(email: string, code: string, purpose: OtpPurpose): Promise<"ok" | "missing" | "expired" | "invalid"> {
  const entry = await EmailOtp.findOne({ email, purpose }).sort({ createdAt: -1 });

  if (!entry) return "missing";
  if (entry.expiresAt.getTime() < Date.now()) {
    await EmailOtp.deleteMany({ email, purpose });
    return "expired";
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    await EmailOtp.deleteMany({ email, purpose });
    return "expired";
  }

  if (!codesMatch(entry.codeHash, code)) {
    entry.attempts += 1;
    await entry.save();
    return "invalid";
  }

  await EmailOtp.deleteMany({ email, purpose });
  return "ok";
}

export function verifyRegistrationOtp(email: string, code: string) {
  return verifyEmailOtp(email, code, "register");
}
