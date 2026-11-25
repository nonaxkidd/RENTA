import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { User } from "../models/User";
import { gmailSchema, phoneSchema } from "../utils/contact";
import { issuePasswordResetOtp, issueRegistrationOtp, verifyEmailOtp, verifyRegistrationOtp } from "../services/otpService";

// register logic
const registerSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: gmailSchema,
  phone: phoneSchema,
  password: z.string().min(8),
  role: z.enum(["tenant", "owner"]),
});

const otpSchema = z.object({
  email: gmailSchema,
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from Gmail."),
});

export async function register(req: Request, res: Response) {
  try {
    const result = registerSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Invalid registration information",
        errors: result.error.flatten(),
      });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      role,
    } = result.data;

    const existingUser = await User.findOne({ email });
    const passwordHash = await bcrypt.hash(password, 12);

    if (existingUser?.emailVerified !== false && existingUser) {
      return res.status(409).json({
        message: "Email is already registered",
      });
    }

    const user = existingUser
      ? existingUser
      : new User({ email, defaultRole: role });

    user.firstName = firstName;
    user.lastName = lastName;
    user.phone = phone;
    user.passwordHash = passwordHash;
    user.defaultRole = role;
    user.emailVerified = false;
    // Both roles stay pending until the Gmail code is confirmed.
    // Owners stay pending after that until document review.
    user.status = "pending";
    await user.save();

    try {
      await issueRegistrationOtp(email);
    } catch (error) {
      const cooldown = error instanceof Error && error.name === "OtpCooldown";
      return res.status(cooldown ? 429 : 502).json({
        message: error instanceof Error ? error.message : "Could not send the Gmail verification code.",
        needsOtp: true,
        email,
      });
    }

    return res.status(201).json({
      message: "Check your Gmail for a 6-digit verification code.",
      needsOtp: true,
      email,
    });
  } catch (error) {
    console.error("Registration error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
}

// login logic
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(req: Request, res: Response) {
  try {
    const result = loginSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Invalid login information",
      });
    }

    const { email, password } = result.data;

    // Find the user and include passwordHash
    const user = await User.findOne({
      email: email.toLowerCase(),
    }).select("+passwordHash");

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // Compare entered password with hashed password
    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    if (user.emailVerified === false) {
      return res.status(403).json({
        message: "Verify the code sent to your Gmail before logging in.",
        needsOtp: true,
      });
    }

    // Block suspended, rejected, and archived accounts
    if (
      user.status === "suspended" ||
      user.status === "rejected" ||
      user.status === "archived"
    ) {
      return res.status(403).json({
        message: "Account is not allowed to log in",
        code: "ACCOUNT_BLOCKED",
      });
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error("JWT_SECRET is missing from .env");
    }

    // Create JWT token
    const token = jwt.sign(
      {
        userId: user._id.toString(),
        role: user.defaultRole,
        status: user.status,
      },
      secret,
      {
        expiresIn: "7d",
      }
    );

    return res.status(200).json({
      message: "Login successful",

      token,

      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.defaultRole,
        status: user.status,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
}

function signIn(user: {
  _id: { toString(): string };
  defaultRole: string;
  status: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is missing from .env");
  }

  const token = jwt.sign(
    {
      userId: user._id.toString(),
      role: user.defaultRole,
      status: user.status,
    },
    secret,
    { expiresIn: "7d" }
  );

  return {
    token,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.defaultRole,
      status: user.status,
    },
  };
}

export async function verifyOtp(req: Request, res: Response) {
  try {
    const result = otpSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: result.error.issues[0]?.message ?? "Invalid verification code.",
      });
    }

    const { email, code } = result.data;
    const outcome = await verifyRegistrationOtp(email, code);

    if (outcome === "missing" || outcome === "expired") {
      return res.status(400).json({ message: "That code has expired. Request a new one." });
    }
    if (outcome === "invalid") {
      return res.status(400).json({ message: "That code is incorrect." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "Account not found." });
    }

    user.emailVerified = true;
    // Tenants become active. Owners stay pending until an administrator checks their papers.
    if (user.defaultRole === "tenant") {
      user.status = "active";
    }
    await user.save();

    return res.json({
      message: user.defaultRole === "owner"
        ? "Gmail verified. Submit your documents so an administrator can confirm you own or manage the property."
        : "Gmail verified. You can now sign in.",
      ...signIn(user),
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

export async function resendOtp(req: Request, res: Response) {
  try {
    const result = z.object({ email: gmailSchema }).safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ message: "Enter the Gmail address you registered with." });
    }

    const user = await User.findOne({ email: result.data.email });
    if (!user || user.emailVerified !== false) {
      return res.json({ message: "If that Gmail address is waiting for a code, a new one has been sent." });
    }

    await issueRegistrationOtp(user.email);
    return res.json({ message: "A new code was sent to your Gmail." });
  } catch (error) {
    const cooldown = error instanceof Error && error.name === "OtpCooldown";
    console.error("OTP resend error:", error);
    return res.status(cooldown ? 429 : 502).json({
      message: error instanceof Error ? error.message : "Could not send the code.",
    });
  }
}

const RESET_MESSAGE = "If that email is registered, we sent a 6-digit code. It expires in 10 minutes.";

export async function forgotPassword(req: Request, res: Response) {
  try {
    const result = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address.") }).safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }

    const user = await User.findOne({ email: result.data.email });
    if (user) {
      try {
        await issuePasswordResetOtp(user.email);
      } catch (error) {
        const cooldown = error instanceof Error && error.name === "OtpCooldown";
        if (!cooldown) console.error("Password reset email failed:", error);
      }
    }

    return res.json({ message: RESET_MESSAGE });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

export async function resetPassword(req: Request, res: Response) {
  try {
    const result = z.object({
      email: z.string().trim().toLowerCase().email("Enter a valid email address."),
      code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
      password: z.string().min(8, "Password must be at least 8 characters.").max(72),
    }).safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({ message: result.error.issues[0]?.message ?? "Invalid reset request." });
    }

    const { email, code, password } = result.data;
    const outcome = await verifyEmailOtp(email, code, "reset");
    if (outcome !== "ok") {
      return res.status(400).json({ message: "That code is incorrect or has expired." });
    }

    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user) {
      return res.status(400).json({ message: "That code is incorrect or has expired." });
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    await user.save();
    return res.json({ message: "If the code was correct, your password was updated." });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

export async function updateProfile(req: Request, res: Response) {
  try {
    const parsed = z.object({
      firstName: z.string().trim().min(1, "First name is required.").max(60),
      lastName: z.string().trim().min(1, "Last name is required.").max(60),
      phone: phoneSchema,
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid profile." });
    }

    const user = await User.findById(req.auth?.userId);
    if (!user) return res.status(401).json({ message: "Authentication required" });

    user.firstName = parsed.data.firstName;
    user.lastName = parsed.data.lastName;
    user.phone = parsed.data.phone;
    await user.save();

    res.json({
      message: "Profile updated.",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.defaultRole,
        status: user.status,
      },
    });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ message: "Server error" });
  }
}

export async function changePassword(req: Request, res: Response) {
  try {
    const parsed = z.object({
      currentPassword: z.string().min(1, "Enter your current password."),
      newPassword: z.string().min(8, "Password must be at least 8 characters.").max(72),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid password change." });
    }

    const user = await User.findById(req.auth?.userId).select("+passwordHash");
    if (!user) return res.status(401).json({ message: "Authentication required" });

    const matches = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!matches) return res.status(403).json({ message: "The current password is incorrect." });

    user.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await user.save();
    res.json({ message: "Password updated." });
  } catch (error) {
    console.error("Password change error:", error);
    res.status(500).json({ message: "Server error" });
  }
}