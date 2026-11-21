import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { z } from "zod";
import { User } from "../models/User";
import type { IVerification, UserRole, UserStatus } from "../models/User";
import { Listing } from "../models/Listing";
import { AuditLog } from "../models/AuditLog";

type OwnerDecision = "approve" | "revision" | "reject";
type UserAction = "deactivate" | "reactivate" | "archive" | "restore";
type AuditTarget = "owner" | "listing" | "user";

type OwnerState =
  | "awaiting_review"
  | "revision_requested"
  | "not_submitted"
  | "approved"
  | "rejected"
  | "suspended"
  | "archived";

/* ---------- OWNER VERIFICATION RULES ---------- */

// Decisions that must carry a recorded reason (FR-A02)
const NOTE_REQUIRED: OwnerDecision[] = ["revision", "reject"];

// Which account statuses each decision may start from
const ALLOWED_FROM: Record<OwnerDecision, string[]> = {
  approve: ["pending", "rejected"],
  revision: ["pending"],
  reject: ["pending"],
};

const AUDIT_LABELS: Record<OwnerDecision, string> = {
  approve: "Approved owner",
  revision: "Requested revision from owner",
  reject: "Rejected owner",
};

/* ---------- USER ACCOUNT RULES ---------- */

const USER_ACTION_NOTE_REQUIRED: UserAction[] = ["deactivate", "archive"];

const USER_ACTION_ALLOWED_FROM: Record<UserAction, string[]> = {
  deactivate: ["active", "pending", "rejected"],
  reactivate: ["suspended"],
  archive: ["active", "pending", "rejected", "suspended"],
  restore: ["archived"],
};

const USER_ACTION_LABELS: Record<UserAction, string> = {
  deactivate: "Deactivated user",
  reactivate: "Reactivated user",
  archive: "Archived user",
  restore: "Restored user",
};

const createUserSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(60, "First name is too long."),
  lastName: z.string().trim().min(1, "Last name is required.").max(60, "Last name is too long."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role: z.enum(["tenant", "owner", "admin"], { message: "Choose a role." }),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password can be at most 72 characters."),
  adminPassword: z.string().min(1, "Confirm with your own password."),
});

const updateUserSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(60, "First name is too long."),
  lastName: z.string().trim().min(1, "Last name is required.").max(60, "Last name is too long."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password can be at most 72 characters."),
  adminPassword: z.string().min(1, "Confirm with your own password."),
});

/* ---------- HELPERS ---------- */

function hasBothDocs(verification?: IVerification | null) {
  return Boolean(verification?.idDocumentUrl && verification?.authorityDocumentUrl);
}

function ownerState(owner: {
  status: string;
  verification?: IVerification | null;
}): OwnerState {
  if (owner.status === "archived") return "archived";
  if (owner.status === "active") return "approved";
  if (owner.status === "suspended") return "suspended";
  if (owner.status === "rejected") return "rejected";
  if (owner.verification?.revisionRequested) return "revision_requested";
  if (hasBothDocs(owner.verification)) return "awaiting_review";
  return "not_submitted";
}

function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Invalid input.";
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function userLabel(user: { firstName: string; lastName: string; email: string; defaultRole: string }) {
  return `${user.firstName} ${user.lastName} (${user.email}) — ${user.defaultRole}`;
}

// Where an account goes back to if we have no record of its earlier status.
// Owners fall back to "pending" so they're re-reviewed, never auto-verified.
function fallbackStatus(role: UserRole): UserStatus {
  return role === "owner" ? "pending" : "active";
}

async function confirmAdminPassword(req: Request, adminPassword: string) {
  const actor = await User.findById(req.auth?.userId).select("+passwordHash");

  if (!actor) return false;

  return bcrypt.compare(adminPassword, actor.passwordHash);
}

// Stops an admin from locking themselves (or everyone) out
async function guardAdminLockout(
  req: Request,
  target: { _id: unknown; defaultRole: string; status: string }
): Promise<string | null> {
  if (String(target._id) === req.auth?.userId) {
    return "You can't deactivate or archive your own account.";
  }

  if (target.defaultRole === "admin" && target.status === "active") {
    const otherActiveAdmins = await User.countDocuments({
      defaultRole: "admin",
      status: "active",
      _id: { $ne: target._id },
    });

    if (otherActiveAdmins === 0) {
      return "This is the only active administrator. Create another one first.";
    }
  }

  return null;
}

async function recordAudit(
  req: Request,
  action: string,
  targetType: AuditTarget,
  targetId: mongoose.Types.ObjectId | string,
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

/* ---------- STATS ---------- */

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
      archived: 0,
    };

    owners.forEach((owner) => {
      ownerCounts[ownerState(owner)] += 1;
    });

    const [tenants, admins, totalListings, verifiedListings] = await Promise.all([
      User.countDocuments({ defaultRole: "tenant", status: { $ne: "archived" } }),
      User.countDocuments({ defaultRole: "admin", status: { $ne: "archived" } }),
      Listing.countDocuments(),
      Listing.countDocuments({ verified: true }),
    ]);

    res.json({
      users: {
        tenants,
        owners: owners.filter((owner) => owner.status !== "archived").length,
        admins,
      },
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

/* ---------- OWNER VERIFICATION ---------- */

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

    if (!decision || !Object.keys(ALLOWED_FROM).includes(decision)) {
      return res.status(400).json({ message: "Invalid decision." });
    }

    const trimmedNote = typeof note === "string" ? note.trim().slice(0, 500) : "";

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

    if (!hasBothDocs(owner.verification)) {
      return res
        .status(400)
        .json({ message: "This owner hasn't submitted both documents yet." });
    }

    if (decision === "approve") owner.status = "active";
    if (decision === "reject") owner.status = "rejected";
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

/* ---------- LISTING APPROVALS ---------- */

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

    const trimmedNote = typeof note === "string" ? note.trim().slice(0, 500) : "";

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

/* ---------- USER MANAGEMENT ---------- */

export async function getUsers(_req: Request, res: Response) {
  try {
    const users = await User.find()
      .select("firstName lastName email defaultRole status createdAt archivedAt")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    res.json({ users });
  } catch (error) {
    console.error("Failed to fetch users:", error);
    res.status(500).json({ message: "Failed to fetch users." });
  }
}

export async function createUser(req: Request, res: Response) {
  try {
    const parsed = createUserSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ message: firstIssue(parsed.error) });
    }

    const { firstName, lastName, email, role, password, adminPassword } = parsed.data;

    if (!(await confirmAdminPassword(req, adminPassword))) {
      return res.status(403).json({ message: "Your password is incorrect." });
    }

    const existing = await User.findOne({ email });

    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const created = await User.create({
      firstName,
      lastName,
      email,
      passwordHash,
      defaultRole: role,
      // New owners still have to submit documents and be verified
      status: role === "owner" ? "pending" : "active",
    });

    await recordAudit(req, "Created user account", "user", created._id, userLabel(created));

    res.status(201).json({ message: "User created." });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }
    console.error("Failed to create user:", error);
    res.status(500).json({ message: "Failed to create user." });
  }
}

export async function updateUser(req: Request, res: Response) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    const parsed = updateUserSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ message: firstIssue(parsed.error) });
    }

    const { firstName, lastName, email } = parsed.data;

    const target = await User.findById(req.params.id);

    if (!target) {
      return res.status(404).json({ message: "User not found." });
    }

    if (target.status === "archived") {
      return res.status(400).json({ message: "Restore this account before editing it." });
    }

    if (email !== target.email) {
      const taken = await User.findOne({ email, _id: { $ne: target._id } });

      if (taken) {
        return res.status(409).json({ message: "Another account already uses this email." });
      }
    }

    const changes: string[] = [];

    if (firstName !== target.firstName || lastName !== target.lastName) {
      changes.push(`Name: ${target.firstName} ${target.lastName} → ${firstName} ${lastName}`);
    }
    if (email !== target.email) {
      changes.push(`Email: ${target.email} → ${email}`);
    }

    if (changes.length === 0) {
      return res.json({ message: "Nothing to change." });
    }

    target.firstName = firstName;
    target.lastName = lastName;
    target.email = email;

    await target.save();

    await recordAudit(req, "Edited user account", "user", target._id, userLabel(target), changes.join("; "));

    res.json({ message: "User updated." });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Another account already uses this email." });
    }
    console.error("Failed to update user:", error);
    res.status(500).json({ message: "Failed to update user." });
  }
}

export async function setUserStatus(req: Request, res: Response) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    const { action, note } = req.body as { action?: UserAction; note?: string };

    if (!action || !Object.keys(USER_ACTION_ALLOWED_FROM).includes(action)) {
      return res.status(400).json({ message: "Invalid action." });
    }

    const trimmedNote = typeof note === "string" ? note.trim().slice(0, 500) : "";

    if (USER_ACTION_NOTE_REQUIRED.includes(action) && !trimmedNote) {
      return res.status(400).json({ message: "A reason is required for this action." });
    }

    const target = await User.findById(req.params.id);

    if (!target) {
      return res.status(404).json({ message: "User not found." });
    }

    if (!USER_ACTION_ALLOWED_FROM[action].includes(target.status)) {
      return res
        .status(400)
        .json({ message: `Can't ${action} an account whose status is ${target.status}.` });
    }

    if (action === "deactivate" || action === "archive") {
      const blocked = await guardAdminLockout(req, target);

      if (blocked) {
        return res.status(400).json({ message: blocked });
      }
    }

    if (action === "deactivate") {
      target.statusBeforeDeactivation = target.status;
      target.status = "suspended";
    } else if (action === "reactivate") {
      target.status = target.statusBeforeDeactivation ?? fallbackStatus(target.defaultRole);
      target.statusBeforeDeactivation = undefined;
    } else if (action === "archive") {
      target.statusBeforeArchive = target.status;
      target.status = "archived";
      target.archivedAt = new Date();
    } else {
      target.status = target.statusBeforeArchive ?? fallbackStatus(target.defaultRole);
      target.statusBeforeArchive = undefined;
      target.archivedAt = undefined;
    }

    await target.save();

    await recordAudit(req, USER_ACTION_LABELS[action], "user", target._id, userLabel(target), trimmedNote);

    res.json({ message: "Account updated.", status: target.status });
  } catch (error) {
    console.error("Failed to change user status:", error);
    res.status(500).json({ message: "Failed to update this account." });
  }
}

export async function resetUserPassword(req: Request, res: Response) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    const parsed = resetPasswordSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ message: firstIssue(parsed.error) });
    }

    const { newPassword, adminPassword } = parsed.data;

    if (!(await confirmAdminPassword(req, adminPassword))) {
      return res.status(403).json({ message: "Your password is incorrect." });
    }

    const target = await User.findById(req.params.id);

    if (!target) {
      return res.status(404).json({ message: "User not found." });
    }

    if (target.status === "archived") {
      return res.status(400).json({ message: "Restore this account before resetting its password." });
    }

    target.passwordHash = await bcrypt.hash(newPassword, 12);
    await target.save();

    // The password itself is never written to the log
    await recordAudit(req, "Reset user password", "user", target._id, userLabel(target));

    res.json({ message: "Password updated." });
  } catch (error) {
    console.error("Failed to reset password:", error);
    res.status(500).json({ message: "Failed to reset password." });
  }
}

/* ---------- REPORTS ---------- */

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
        User.aggregate([
          { $match: { status: { $ne: "archived" } } },
          { $group: { _id: "$defaultRole", count: { $sum: 1 } } },
        ]),
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

/* ---------- ACTIVITY LOG (filterable) ---------- */

export async function getAuditLog(req: Request, res: Response) {
  try {
    const search = asString(req.query.search)?.slice(0, 100);
    const action = asString(req.query.action);
    const targetType = asString(req.query.targetType);
    const actor = asString(req.query.actor);
    const from = asString(req.query.from);
    const to = asString(req.query.to);

    const filter: Record<string, unknown> = {};

    if (action) filter.action = action;
    if (actor) filter.actorName = actor;
    if (targetType && ["owner", "listing", "user"].includes(targetType)) {
      filter.targetType = targetType;
    }

    const range: Record<string, Date> = {};

    if (from) {
      const start = new Date(`${from}T00:00:00`);
      if (!isNaN(start.getTime())) range.$gte = start;
    }
    if (to) {
      const end = new Date(`${to}T23:59:59.999`);
      if (!isNaN(end.getTime())) range.$lte = end;
    }
    if (Object.keys(range).length > 0) filter.createdAt = range;

    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      filter.$or = [
        { targetLabel: pattern },
        { note: pattern },
        { action: pattern },
        { actorName: pattern },
      ];
    }

    const [entries, total, actions, actors] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).limit(300).lean(),
      AuditLog.countDocuments(filter),
      AuditLog.distinct("action"),
      AuditLog.distinct("actorName"),
    ]);

    res.json({ entries, total, actions: actions.sort(), actors: actors.sort() });
  } catch (error) {
    console.error("Failed to fetch audit log:", error);
    res.status(500).json({ message: "Failed to fetch audit log." });
  }
}