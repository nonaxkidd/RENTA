
import mongoose, { Document, Schema } from "mongoose";

export type ReservationStatus =
  | "queued"
  | "payment_pending"
  | "confirmed"
  | "rejected"
  | "expired"
  | "cancelled"
  | "conflict";

export type OwnerDecision = "approved" | "rejected";

export interface IReservation extends Document {
  tenantId: mongoose.Types.ObjectId;
  unitId: mongoose.Types.ObjectId;
  intendedMoveIn: Date;
  occupants: number;
  expectedLengthOfStay?: string;
  requestedMoveOut?: Date;
  notes?: string;
  serverTimestamp: Date;
  queueStatus: ReservationStatus;
  isActive: boolean;
  ownerDecision?: OwnerDecision;
  ownerDecisionAt?: Date;
  ownerResponse?: string;
  paymentDeadlineAt?: Date;
  cancellationReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const reservationSchema = new Schema<IReservation>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    unitId: {
      type: Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true,
    },
    intendedMoveIn: {
      type: Date,
      required: true,
    },
    occupants: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Occupants must be a whole number.",
      },
    },
    expectedLengthOfStay: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    requestedMoveOut: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    serverTimestamp: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    queueStatus: {
      type: String,
      enum: [
        "queued",
        "payment_pending",
        "confirmed",
        "rejected",
        "expired",
        "cancelled",
        "conflict",
      ],
      default: "queued",
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
      index: true,
    },
    ownerDecision: {
      type: String,
      enum: ["approved", "rejected"],
    },
    ownerDecisionAt: {
      type: Date,
    },
    ownerResponse: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    paymentDeadlineAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

// One active reservation per tenant per listing.
reservationSchema.index(
  { tenantId: 1, unitId: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
    name: "one_active_reservation_per_tenant_listing",
  }
);

reservationSchema.index({
  unitId: 1,
  isActive: 1,
  serverTimestamp: 1,
});

export const Reservation = mongoose.model<IReservation>(
  "Reservation",
  reservationSchema
);
