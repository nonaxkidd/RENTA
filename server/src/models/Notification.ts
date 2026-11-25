import mongoose, { Schema } from "mongoose";

export type NotificationKind =
  | "reservation_requested"
  | "reservation_approved"
  | "reservation_rejected"
  | "payment_confirmed"
  | "owner_verified"
  | "listing_approved"
  | "listing_disapproved"
  | "listing_pending_review"
  | "listing_removed";

export interface INotification {
  userId: mongoose.Types.ObjectId;
  kind: NotificationKind;
  title: string;
  body: string;
  read: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: {
      type: String,
      required: true,
      enum: [
        "reservation_requested",
        "reservation_approved",
        "reservation_rejected",
        "payment_confirmed",
        "owner_verified",
        "listing_approved",
        "listing_disapproved",
        "listing_pending_review",
        "listing_removed",
      ],
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    read: { type: Boolean, default: false, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Notification = mongoose.model<INotification>("Notification", notificationSchema);
