import { Request, Response } from "express";
import { User } from "../models/User";
import { Listing } from "../models/Listing";

export async function getFavorites(req: Request, res: Response) {
  try {
    const user = await User.findById(req.auth?.userId).populate("favorites");

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json({ favorites: user.favorites });
  } catch (error) {
    console.error("Failed to fetch favorites:", error);
    res.status(500).json({ message: "Failed to fetch favorites." });
  }
}

export async function addFavorite(req: Request, res: Response) {
  try {
    const { listingId } = req.params;

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ message: "Listing not found." });
    }

    const user = await User.findById(req.auth?.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const alreadySaved = user.favorites.some((id) => id.toString() === listingId);
    if (!alreadySaved) {
      user.favorites.push(listing._id);
      await user.save();
    }

    res.status(200).json({ message: "Added to favorites.", favorites: user.favorites });
  } catch (error) {
    console.error("Failed to add favorite:", error);
    res.status(500).json({ message: "Failed to add favorite." });
  }
}

export async function removeFavorite(req: Request, res: Response) {
  try {
    const { listingId } = req.params;

    const user = await User.findById(req.auth?.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.favorites = user.favorites.filter((id) => id.toString() !== listingId);
    await user.save();

    res.status(200).json({ message: "Removed from favorites.", favorites: user.favorites });
  } catch (error) {
    console.error("Failed to remove favorite:", error);
    res.status(500).json({ message: "Failed to remove favorite." });
  }
}