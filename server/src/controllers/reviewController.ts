import { Request, Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Listing } from "../models/Listing";
import { OwnerReview } from "../models/OwnerReview";
import { Reservation } from "../models/Reservation";
import { User } from "../models/User";
import { requireObjectId } from "../utils/params";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(2, "Write a short comment.").max(500, "Comment can be at most 500 characters."),
});

export async function getListingReviews(req: Request, res: Response) {
  try {
    const listingId = requireObjectId(req, res, "listingId");
    if (!listingId) return;

    const reviews = await OwnerReview.find({ listingId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const count = reviews.length;
    const average =
      count === 0 ? 0 : Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / count) * 10) / 10;

    res.json({
      reviews: reviews.map((review) => ({
        id: review._id,
        tenantName: review.tenantName,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
      })),
      count,
      average,
    });
  } catch (error) {
    console.error("Failed to fetch reviews:", error);
    res.status(500).json({ message: "Failed to fetch reviews." });
  }
}

export async function createListingReview(req: Request, res: Response) {
  try {
    const listingId = requireObjectId(req, res, "listingId");
    if (!listingId) return;
    const tenantId = req.auth?.userId;

    if (!tenantId || !mongoose.isValidObjectId(tenantId)) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid review." });
    }

    const listing = await Listing.findById(listingId).select("ownerId title");
    if (!listing) {
      return res.status(404).json({ message: "Listing not found." });
    }
    if (!listing.ownerId) {
      return res.status(400).json({ message: "This listing has no owner account to rate." });
    }
    if (String(listing.ownerId) === tenantId) {
      return res.status(403).json({ message: "You cannot rate your own listing." });
    }

    const stayed = await Reservation.exists({
      tenantId,
      unitId: listingId,
      queueStatus: "confirmed",
    });

    if (!stayed) {
      return res.status(403).json({
        message: "You can rate the owner after your down payment for this listing is confirmed.",
      });
    }

    const tenant = await User.findById(tenantId).select("firstName lastName");
    if (!tenant) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const review = await OwnerReview.create({
      listingId,
      ownerId: listing.ownerId,
      tenantId,
      tenantName: `${tenant.firstName} ${tenant.lastName}`.trim(),
      rating: parsed.data.rating,
      comment: parsed.data.comment,
    });

    res.status(201).json({
      review: {
        id: review._id,
        tenantName: review.tenantName,
        rating: review.rating,
        comment: review.comment,
      },
    });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return res.status(409).json({ message: "You already rated this owner for this listing." });
    }
    console.error("Failed to save review:", error);
    res.status(500).json({ message: "Failed to save review." });
  }
}
