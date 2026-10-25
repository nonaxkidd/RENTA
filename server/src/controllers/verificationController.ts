import { Request, Response } from "express";
import { User } from "../models/User";

// Only plain http(s) links are accepted. A "javascript:" link would run
// inside the administrator's browser when they click it to review.
function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function getMyVerification(req: Request, res: Response) {
  try {
    const user = await User.findById(req.auth?.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json({ status: user.status, verification: user.verification ?? null });
  } catch (error) {
    console.error("Failed to fetch verification:", error);
    res.status(500).json({ message: "Failed to fetch verification." });
  }
}

export async function submitVerification(req: Request, res: Response) {
  try {
    const { idDocumentUrl, authorityDocumentUrl } = req.body;

    if (!isSafeHttpUrl(idDocumentUrl) || !isSafeHttpUrl(authorityDocumentUrl)) {
      return res
        .status(400)
        .json({ message: "Both document links must be valid http(s) URLs." });
    }

    const user = await User.findById(req.auth?.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.status === "active") {
      return res.status(400).json({ message: "Your account is already verified." });
    }

    if (user.status === "suspended") {
      return res
        .status(403)
        .json({ message: "Your account is suspended. Please contact an administrator." });
    }

    // Replaces any earlier submission (also clears an old revision request)
    user.verification = {
      idDocumentUrl,
      authorityDocumentUrl,
      submittedAt: new Date(),
      revisionRequested: false,
    };
    user.status = "pending";

    await user.save();

    res.json({ status: user.status, verification: user.verification });
  } catch (error) {
    console.error("Failed to submit verification:", error);
    res.status(500).json({ message: "Failed to submit verification." });
  }
}