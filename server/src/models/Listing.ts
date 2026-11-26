import mongoose, { Schema, Document } from "mongoose";

export interface IListing extends Document {
  title: string;
  type: string;
  barangay: string;
  price: number;
  transparency: number;
  verified: boolean;
  lat: number;
  lng: number;
  description: string;
  amenities: string[];
  houseRules: string[];
  capacity: number;
  available: boolean;
  ownerName: string;
  ownerId?: mongoose.Types.ObjectId;
  imageUrl?: string;
  panoramaUrl?: string;
  reviewNote?: string;
  reviewedAt?: Date;
  archivedAt?: Date;
}

const listingSchema = new Schema<IListing>(
  {
    title: { type: String, required: true },
    type: { type: String, required: true },
    barangay: { type: String, required: true },
    price: { type: Number, required: true },
    transparency: { type: Number, required: true, min: 0, max: 100 },
    verified: { type: Boolean, default: false },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    description: { type: String, required: true },
    amenities: { type: [String], default: [] },
    houseRules: { type: [String], default: [] },
    capacity: { type: Number, required: true },
    available: { type: Boolean, default: true },
    ownerName: { type: String, required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    imageUrl: { type: String },
    panoramaUrl: { type: String },
    reviewNote: { type: String, maxlength: 500 },
    reviewedAt: { type: Date },
    archivedAt: { type: Date },
  },
  { timestamps: true }
);

export const Listing = mongoose.model<IListing>("Listing", listingSchema);