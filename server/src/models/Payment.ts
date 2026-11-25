import mongoose, { Schema } from "mongoose";

export type PaymentStatus = "pending" | "paid" | "cancelled" | "needs_refund" | "refunded";

export interface IPayment {
  reservationId: mongoose.Types.ObjectId;
  listingId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  amount: number;
  currency: "PHP";
  provider: "paymongo";
  providerSessionId: string;
  checkoutUrl?: string;
  status: PaymentStatus;
  paidAt?: Date;
  note?: string;
}

const paymentSchema = new Schema<IPayment>(
  {
    reservationId: { type: Schema.Types.ObjectId, ref: "Reservation", required: true, index: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ["PHP"], default: "PHP", required: true },
    provider: { type: String, enum: ["paymongo"], default: "paymongo", required: true },
    providerSessionId: { type: String, required: true },
    checkoutUrl: { type: String },
    status: {
      type: String,
      enum: ["pending", "paid", "cancelled", "needs_refund", "refunded"],
      default: "pending",
      required: true,
    },
    paidAt: { type: Date },
    note: { type: String },
  },
  { timestamps: true }
);

export const Payment = mongoose.model<IPayment>("Payment", paymentSchema);
