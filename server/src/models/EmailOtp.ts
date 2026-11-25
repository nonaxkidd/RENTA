import mongoose, { Schema } from "mongoose";

export interface IEmailOtp {
  email: string;
  purpose: "register" | "reset";
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
}

const emailOtpSchema = new Schema<IEmailOtp>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    purpose: { type: String, enum: ["register", "reset"], required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const EmailOtp = mongoose.model<IEmailOtp>("EmailOtp", emailOtpSchema);
