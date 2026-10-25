import { Request, Response } from "express";
import { User } from "../models/User";

const MAX_HISTORY_ENTRIES = 50;

export async function recordView(req: Request, res: Response) {
  try {
    const { listingId } = req.params;

    const user = await User.findById(req.auth?.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Some accounts were created before the "history" field existed on the
    // schema — Mongoose doesn't backfill defaults onto already-existing
    // documents, so guard against it being undefined here.
    if (!user.history) {
      user.history = [];
    }

    // Remove any existing entry for this listing, then add a fresh one at
    // the front — keeps the list deduplicated and always most-recent-first.
    user.history = user.history.filter((entry) => entry.listing.toString() !== listingId);
    user.history.unshift({ listing: listingId as any, viewedAt: new Date() });
    user.history = user.history.slice(0, MAX_HISTORY_ENTRIES);

    await user.save();
    res.status(200).json({ message: "View recorded." });
  } catch (error) {
    console.error("Failed to record view:", error);
    res.status(500).json({ message: "Failed to record view." });
  }
}

export async function getHistory(req: Request, res: Response) {
  try {
    const user = await User.findById(req.auth?.userId).populate("history.listing");

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json({ history: user.history || [] });
  } catch (error) {
    console.error("Failed to fetch history:", error);
    res.status(500).json({ message: "Failed to fetch history." });
  }
}