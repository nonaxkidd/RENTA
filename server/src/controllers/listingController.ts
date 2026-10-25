import { Request, Response } from "express";
import { Listing } from "../models/Listing";

export async function getListings(_req: Request, res: Response) {
  try {
    const listings = await Listing.find().sort({ updatedAt: -1 }).limit(20);
    res.json({ listings });
  } catch (error) {
    console.error("Failed to fetch listings:", error);
    res.status(500).json({ message: "Failed to fetch listings." });
  }
}

export async function getListingById(req: Request, res: Response) {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
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
    const listings = await Listing.find({ ownerId: req.auth?.userId }).sort({ updatedAt: -1 });
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
      barangay,
      price,
      lat,
      lng,
      description,
      amenities,
      houseRules,
      capacity,
      ownerName,
      imageUrl,
    } = req.body;

    if (!title || !type || !barangay || !price || !lat || !lng || !description || !capacity || !ownerName) {
      return res.status(400).json({ message: "Missing required listing fields." });
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
      imageUrl: imageUrl || undefined,
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
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({ message: "Listing not found." });
    }

    if (listing.ownerId?.toString() !== req.auth?.userId) {
      return res.status(403).json({ message: "You do not own this listing." });
    }

    const allowedFields = [
      "title", "type", "barangay", "price", "lat", "lng",
      "description", "amenities", "houseRules", "capacity", "available", "imageUrl",
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        (listing as any)[field] = req.body[field];
      }
    }

    await listing.save();
    res.json({ listing });
  } catch (error) {
    console.error("Failed to update listing:", error);
    res.status(500).json({ message: "Failed to update listing." });
  }
}