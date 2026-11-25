import mongoose, { Schema } from "mongoose";

export interface IOwnerReview {
  listingId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  tenantName: string;
  rating: number;
  comment: string;
  createdAt?: Date;
}

const ownerReviewSchema = new Schema<IOwnerReview>(
  {
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tenantName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

ownerReviewSchema.index({ listingId: 1, tenantId: 1 }, { unique: true });

export const OwnerReview = mongoose.model<IOwnerReview>("OwnerReview", ownerReviewSchema);
