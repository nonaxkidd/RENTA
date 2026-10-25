import { Request, Response } from "express";
import mongoose from "mongoose";
import { User } from "../models/User";
import type { IVerification } from "../models/User";
import { Listing } from "../models/Listing";
import { AuditLog } from "../models/AuditLog";

type OwnerDecision = "approve" | "revision" | "reject" | "suspend" | "reactivate";

type OwnerState =
  | "awaiting_review"
  | "revision_requested"
  | "not_submitted"
  | "approved"
  | "rejected"
  | "suspended";

// Decisions that must carry a recorded reason (FR-A02)
const NOTE_REQUIRED: OwnerDecision[] = ["revision", "reject", "suspend"];

// Which account statuses each decision may start from
const ALLOWED_FROM: Record<OwnerDecision, string[]> = {
  approve: ["pending", "rejected"],
  revision: ["pending"],
  reject: ["pending"],
  suspend: ["active"],
  reactivate: ["suspended"],
};

const AUDIT_LABELS: Record<OwnerDecision, string> = {
  approve: "Approved owner",
  revision: "Requested revision from owner",
  reject: "Rejected owner",
  suspend: "Suspended owner",
  reactivate: "Reactivated owner",
};

function hasBothDocs(verification?: IVerification | null) {
  return Boolean(verification?.idDocumentUrl && verification?.authorityDocumentUrl);
}

function ownerState(owner: {
  status: string;
  verification?: IVerification | null;
}): OwnerState {
  if (owner.status === "active") return "approved";
  if (owner.status === "suspended") return "suspended";
  if (owner.status === "rejected") return "rejected";
  if (owner.verification?.revisionRequested) return "revision_requested";
  if (hasBothDocs(owner.verification)) return "awaiting_review";
  return "not_submitted";
}

async function recordAudit(
  req: Request,
  action: string,
  targetType: "owner" | "listing",
  targetId: mongoose.Types.ObjectId,
  targetLabel: string,
  note?: string
) {
  const actor = await User.findById(req.auth?.userId);

  await AuditLog.create({
    actorId: req.auth?.userId,
    actorName: actor ? `${actor.firstName} ${actor.lastName}` : "Administrator",
    action,
    targetType,
    targetId,
    targetLabel,
    note: note || undefined,
  });
}

export async function getStats(_req: Request, res: Response) {
  try {
    const owners = await User.find({ defaultRole: "owner" })
      .select("status verification")
      .lean();

    const ownerCounts: Record<OwnerState, number> = {
      awaiting_review: 0,
      revision_requested: 0,
      not_submitted: 0,
      approved: 0,
      rejected: 0,
      suspended: 0,
    };

    owners.forEach((owner) => {
      ownerCounts[ownerState(owner)] += 1;
    });

    const [tenants, admins, totalListings, verifiedListings] = await Promise.all([
      User.countDocuments({ defaultRole: "tenant" }),
      User.countDocuments({ defaultRole: "admin" }),
      Listing.countDocuments(),
      Listing.countDocuments({ verified: true }),
    ]);

    res.json({
      users: { tenants, owners: owners.length, admins },
      owners: ownerCounts,
      listings: {
        total: totalListings,
        verified: verifiedListings,
        unverified: totalListings - verifiedListings,
      },
    });
  } catch (error) {
    console.error("Failed to fetch stats:", error);
    res.status(500).json({ message: "Failed to fetch stats." });
  }
}

export async function getOwners(_req: Request, res: Response) {
  try {
    const owners = await User.find({ defaultRole: "owner" })
      .select("firstName lastName email status verification createdAt")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      owners: owners.map((owner) => ({ ...owner, state: ownerState(owner) })),
    });
  } catch (error) {
    console.error("Failed to fetch owners:", error);
    res.status(500).json({ message: "Failed to fetch owners." });
  }
}

export async function reviewOwner(req: Request, res: Response) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid owner id." });
    }

    const { decision, note } = req.body as { decision?: OwnerDecision; note?: string };

    if (!decision || !(decision in ALLOWED_FROM)) {
      return res.status(400).json({ message: "Invalid decision." });
    }

    const trimmedNote = typeof note === "string" ? note.trim() : "";

    if (NOTE_REQUIRED.includes(decision) && !trimmedNote) {
      return res.status(400).json({ message: "A reason is required for this decision." });
    }

    const owner = await User.findOne({ _id: req.params.id, defaultRole: "owner" });

    if (!owner) {
      return res.status(404).json({ message: "Owner not found." });
    }

    if (!ALLOWED_FROM[decision].includes(owner.status)) {
      return res
        .status(400)
        .json({ message: `Can't apply "${decision}" to an owner whose status is ${owner.status}.` });
    }

    // Approving, rejecting, or requesting a revision all need documents to review
    if (["approve", "revision", "reject"].includes(decision) && !hasBothDocs(owner.verification)) {
      return res
        .status(400)
        .json({ message: "This owner hasn't submitted both documents yet." });
    }

    if (decision === "approve" || decision === "reactivate") owner.status = "active";
    if (decision === "reject") owner.status = "rejected";
    if (decision === "suspend") owner.status = "suspended";
    // "revision" leaves the status as pending and flags the submission

    if (owner.verification) {
      owner.verification.reviewedAt = new Date();
      owner.verification.reviewNote = trimmedNote || undefined;
      owner.verification.revisionRequested = decision === "revision";
    }

    await owner.save();

    await recordAudit(
      req,
      AUDIT_LABELS[decision],
      "owner",
      owner._id,
      `${owner.firstName} ${owner.lastName} (${owner.email})`,
      trimmedNote
    );

    res.json({ message: "Decision saved.", status: owner.status });
  } catch (error) {
    console.error("Failed to review owner:", error);
    res.status(500).json({ message: "Failed to save decision." });
  }
}

export async function getAdminListings(_req: Request, res: Response) {
  try {
    const listings = await Listing.find().sort({ createdAt: -1 }).limit(300).lean();
    res.json({ listings });
  } catch (error) {
    console.error("Failed to fetch listings:", error);
    res.status(500).json({ message: "Failed to fetch listings." });
  }
}

export async function reviewListing(req: Request, res: Response) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid listing id." });
    }

    const { decision, note } = req.body as { decision?: "approve" | "revoke"; note?: string };

    if (decision !== "approve" && decision !== "revoke") {
      return res.status(400).json({ message: "Invalid decision." });
    }

    const trimmedNote = typeof note === "string" ? note.trim() : "";

    if (decision === "revoke" && !trimmedNote) {
      return res.status(400).json({ message: "A reason is required to revoke approval." });
    }

    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({ message: "Listing not found." });
    }

    if (decision === "approve") {
      // Listings created by an owner can only be approved after that owner is verified
      if (listing.ownerId) {
        const owner = await User.findById(listing.ownerId).select("status");

        if (!owner || owner.status !== "active") {
          return res.status(400).json({
            message: "Verify the owner's documents before approving their listings.",
          });
        }
      }

      listing.verified = true;
    } else {
      listing.verified = false;
    }

    await listing.save();

    await recordAudit(
      req,
      decision === "approve" ? "Approved listing" : "Revoked listing approval",
      "listing",
      listing._id,
      `${listing.title} (${listing.barangay})`,
      trimmedNote
    );

    res.json({ message: "Decision saved.", verified: listing.verified });
  } catch (error) {
    console.error("Failed to review listing:", error);
    res.status(500).json({ message: "Failed to save decision." });
  }
}

export async function getUsers(_req: Request, res: Response) {
  try {
    const users = await User.find()
      .select("firstName lastName email defaultRole status createdAt")
      .sort({ createdAt: -1 })
      .limit(300)
      .lean();

    res.json({ users });
  } catch (error) {
    console.error("Failed to fetch users:", error);
    res.status(500).json({ message: "Failed to fetch users." });
  }
}

export async function getReports(_req: Request, res: Response) {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [listingsByType, listingsByBarangay, priceStats, availability, usersByRole, staleListings] =
      await Promise.all([
        Listing.aggregate([
          { $group: { _id: "$type", count: { $sum: 1 }, avgPrice: { $avg: "$price" } } },
          { $sort: { count: -1 } },
        ]),
        Listing.aggregate([
          { $group: { _id: "$barangay", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 8 },
        ]),
        Listing.aggregate([
          {
            $group: {
              _id: null,
              avg: { $avg: "$price" },
              min: { $min: "$price" },
              max: { $max: "$price" },
              avgTransparency: { $avg: "$transparency" },
            },
          },
        ]),
        Listing.aggregate([{ $group: { _id: "$available", count: { $sum: 1 } } }]),
        User.aggregate([{ $group: { _id: "$defaultRole", count: { $sum: 1 } } }]),
        Listing.countDocuments({ updatedAt: { $lt: thirtyDaysAgo } }),
      ]);

    res.json({
      listingsByType,
      listingsByBarangay,
      priceStats: priceStats[0] ?? null,
      availability,
      usersByRole,
      staleListings,
    });
  } catch (error) {
    console.error("Failed to build reports:", error);
    res.status(500).json({ message: "Failed to build reports." });
  }
}

export async function getAuditLog(_req: Request, res: Response) {
  try {
    const entries = await AuditLog.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json({ entries });
  } catch (error) {
    console.error("Failed to fetch audit log:", error);
    res.status(500).json({ message: "Failed to fetch audit log." });
  }
}