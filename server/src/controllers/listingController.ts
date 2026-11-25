import { Request, Response } from "express";
import { Listing } from "../models/Listing";
import { Payment } from "../models/Payment";
import { Reservation } from "../models/Reservation";
import { User } from "../models/User";
import { geocodeInCalapan } from "../utils/geocode";
import { isSafeHttpUrl } from "../utils/httpUrl";
import { CALAPAN_BARANGAYS, canonicalBarangay, isInsideCalapan } from "../data/calapanBarangays";
import { saveListingPhoto, sniffFile } from "../utils/files";
import { requireObjectId } from "../utils/params";
import { notify } from "../services/notify";

function readCoordinate(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function activeOwnerIds() {
  const owners = await User.find({ status: "active" }).select("_id");
  return owners.map((owner) => owner._id);
}

export async function uploadListingPhoto(req: Request, res: Response) {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "Choose a photo to upload." });
    const mime = sniffFile(file.buffer);
    if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") {
      return res.status(400).json({ message: "Photos must be JPEG, PNG, or WebP." });
    }
    const name = await saveListingPhoto(file.buffer, mime);
    const base = `${req.protocol}://${req.get("host")}`;
    res.status(201).json({ imageUrl: `${base}/api/v1/media/listings/${name}` });
  } catch (error) {
    console.error("Failed to store listing photo:", error);
    res.status(500).json({ message: "Failed to store the photo." });
  }
}

export async function getBarangays(_req: Request, res: Response) {
  res.json({ barangays: CALAPAN_BARANGAYS });
}

export async function getBarangayCenter(req: Request, res: Response) {
  const name = canonicalBarangay(req.query.name);
  if (!name) {
    return res.status(400).json({ message: "Choose a barangay in Calapan City." });
  }

  try {
    const point = await geocodeInCalapan(name);
    if (!point || !isInsideCalapan(point.lat, point.lng)) {
      return res.status(404).json({ message: "That barangay could not be placed on the map. Click the map instead." });
    }
    res.json({ barangay: name, lat: point.lat, lng: point.lng });
  } catch (error) {
    console.error("Geocoding failed:", error);
    res.status(503).json({ message: "The map search is busy. Click the map to place the pin." });
  }
}

export async function getListings(req: Request, res: Response) {
  try {
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const limit = Math.min(50, Math.max(1, Math.floor(Number(req.query.limit) || 20)));
    const sort: Record<string, 1 | -1> = req.query.sort === "price" ? { price: 1 } : { createdAt: -1 };
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
    const filter: Record<string, unknown> = {
      available: true,
      verified: true,
      archivedAt: null,
      ownerId: { $in: await activeOwnerIds() },
    };
    if (q) {
      const pattern = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ title: pattern }, { barangay: pattern }, { type: pattern }];
    }
    const [listings, total] = await Promise.all([
      Listing.find(filter).select("-reviewNote").sort(sort).skip((page - 1) * limit).limit(limit),
      Listing.countDocuments(filter),
    ]);
    res.json({ listings, page, limit, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Failed to fetch listings:", error);
    res.status(500).json({ message: "Failed to fetch listings." });
  }
}

export async function getListingById(req: Request, res: Response) {
  try {
    const id = requireObjectId(req, res, "id");
    if (!id) return;
    const listing = await Listing.findOne({ _id: id, archivedAt: null, verified: true }).select("-reviewNote");
    const owner = listing ? await User.findById(listing.ownerId).select("status") : null;

    if (!listing || !owner || owner.status !== "active") {
      return res.status(404).json({ message: "Listing not found." });
    }

    res.json({ listing });
  } catch (error) {
    console.error("Failed to fetch listing:", error);
    res.status(500).json({ message: "Failed to fetch listing." });
  }
}

export async function getMyListings(req: Request, res: Response) {
  try {
    const listings = await Listing.find({ ownerId: req.auth?.userId, archivedAt: null }).sort({ updatedAt: -1 });
    res.json({ listings });
  } catch (error) {
    console.error("Failed to fetch your listings:", error);
    res.status(500).json({ message: "Failed to fetch your listings." });
  }
}

export async function createListing(req: Request, res: Response) {
  try {
    const {
      title,
      type,
      price,
      description,
      amenities,
      houseRules,
      capacity,
      ownerName,
      imageUrl,
    } = req.body;
    const barangay = canonicalBarangay(req.body.barangay);
    const lat = readCoordinate(req.body.lat);
    const lng = readCoordinate(req.body.lng);

    if (!title || !type || !barangay || !price || !description || !capacity || !ownerName) {
      return res.status(400).json({ message: "Missing required listing fields." });
    }

    if (!isSafeHttpUrl(imageUrl)) {
      return res.status(400).json({ message: "A photo link (http or https) is required." });
    }

    if (lat == null || lng == null || !isInsideCalapan(lat, lng)) {
      return res.status(400).json({ message: "Click the map to place the pin inside Calapan City." });
    }

    const listing = await Listing.create({
      title,
      type,
      barangay,
      price,
      lat,
      lng,
      description,
      amenities: amenities ?? [],
      houseRules: houseRules ?? [],
      capacity,
      ownerName,
      ownerId: req.auth?.userId,
      imageUrl,
      verified: false,
      available: true,
      transparency: 0,
    });

    res.status(201).json({ listing });
  } catch (error) {
    console.error("Failed to create listing:", error);
    res.status(500).json({ message: "Failed to create listing." });
  }
}

export async function updateListing(req: Request, res: Response) {
  try {
    const id = requireObjectId(req, res, "id");
    if (!id) return;
    const listing = await Listing.findOne({ _id: id, archivedAt: null });

    if (!listing) {
      return res.status(404).json({ message: "Listing not found." });
    }

    if (listing.ownerId?.toString() !== req.auth?.userId) {
      return res.status(403).json({ message: "You do not own this listing." });
    }

    const allowedFields = [
      "title", "type", "price",
      "description", "amenities", "houseRules", "capacity", "imageUrl",
    ];

    if (req.body.imageUrl !== undefined && !isSafeHttpUrl(req.body.imageUrl)) {
      return res.status(400).json({ message: "A photo link (http or https) is required." });
    }

    const nextBarangay = req.body.barangay === undefined ? null : canonicalBarangay(req.body.barangay);
    if (req.body.barangay !== undefined && !nextBarangay) {
      return res.status(400).json({ message: "Choose a barangay in Calapan City." });
    }

    const nextLat = req.body.lat === undefined ? null : readCoordinate(req.body.lat);
    const nextLng = req.body.lng === undefined ? null : readCoordinate(req.body.lng);
    if ((req.body.lat !== undefined || req.body.lng !== undefined) && (nextLat == null || nextLng == null || !isInsideCalapan(nextLat, nextLng))) {
      return res.status(400).json({ message: "Click the map to place the pin inside Calapan City." });
    }

    const priceChanged = req.body.price !== undefined && Number(req.body.price) !== listing.price;
    const titleChanged = req.body.title !== undefined && req.body.title !== listing.title;
    const descriptionChanged = req.body.description !== undefined && req.body.description !== listing.description;
    const barangayChanged = Boolean(nextBarangay && nextBarangay !== listing.barangay);
    const pinChanged = nextLat != null && nextLng != null && (nextLat !== listing.lat || nextLng !== listing.lng);
    const photoChanged = req.body.imageUrl !== undefined && req.body.imageUrl !== listing.imageUrl;
    const returnToReview = listing.verified && (priceChanged || titleChanged || descriptionChanged || barangayChanged || pinChanged || photoChanged);

    if (nextBarangay) listing.barangay = nextBarangay;
    if (nextLat != null && nextLng != null) {
      listing.lat = nextLat;
      listing.lng = nextLng;
    }

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        (listing as any)[field] = req.body[field];
      }
    }

    if (returnToReview) {
      listing.verified = false;
      listing.reviewNote = undefined;
      listing.reviewedAt = undefined;
    }

    await listing.save();

    if (returnToReview) {
      const admins = await User.find({
        defaultRole: { $in: ["admin", "superadmin"] },
        status: "active",
      }).select("_id");
      await Promise.all(admins.map((admin) => notify(
        admin._id,
        "listing_pending_review",
        "Listing needs review",
        `${listing.title} was edited and is waiting for approval again.`
      )));
    }

    res.json({
      listing,
      message: returnToReview
        ? "Saved. Title, description, price, location, or photo changes send an approved listing back to pending review."
        : "Listing updated.",
    });
  } catch (error) {
    console.error("Failed to update listing:", error);
    res.status(500).json({ message: "Failed to update listing." });
  }
}

export async function archiveListing(req: Request, res: Response) {
  try {
    const id = requireObjectId(req, res, "id");
    if (!id) return;
    const listing = await Listing.findOne({ _id: id, ownerId: req.auth?.userId, archivedAt: null });
    if (!listing) return res.status(404).json({ message: "Listing not found." });

    const paidReservation = await Reservation.exists({ unitId: listing._id, queueStatus: "confirmed" });
    if (paidReservation) {
      return res.status(409).json({
        message: "This listing has a paid reservation. It stays listed until that reservation is resolved.",
      });
    }

    listing.archivedAt = new Date();
    await listing.save();

    const openReservations = await Reservation.find({
      unitId: listing._id,
      isActive: true,
      queueStatus: { $in: ["queued", "payment_pending"] },
    });

    for (const reservation of openReservations) {
      reservation.queueStatus = "cancelled";
      reservation.isActive = false;
      reservation.cancellationReason = "The owner removed this listing.";
      await reservation.save();
      await Payment.updateMany(
        { reservationId: reservation._id, status: "pending" },
        { $set: { status: "cancelled" } }
      );
      await notify(
        reservation.tenantId,
        "listing_removed",
        "Listing removed",
        `${listing.title} was removed. Your reservation was cancelled.`
      );
    }

    res.json({ message: "Listing removed." });
  } catch (error) {
    console.error("Failed to remove listing:", error);
    res.status(500).json({ message: "Failed to remove listing." });
  }
}