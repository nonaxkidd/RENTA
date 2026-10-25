import mongoose, { Schema } from "mongoose";

export type UserRole = "tenant" | "owner" | "admin";

export interface IVerification {
  idDocumentUrl?: string;
  authorityDocumentUrl?: string;
  submittedAt?: Date;
  reviewedAt?: Date;
  reviewNote?: string;
  revisionRequested?: boolean;
}

export interface IUser {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  defaultRole: UserRole;
  status: "pending" | "active" | "suspended" | "rejected";
  favorites: mongoose.Types.ObjectId[];
  history: { listing: mongoose.Types.ObjectId; viewedAt: Date }[];
  verification?: IVerification;
}

const verificationSchema = new Schema<IVerification>(
  {
    idDocumentUrl: { type: String },
    authorityDocumentUrl: { type: String },
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
    reviewNote: { type: String },
    revisionRequested: { type: Boolean },
  },
  { _id: false }
);

const userSchema = new Schema<IUser>(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    defaultRole: {
      type: String,
      enum: ["tenant", "owner", "admin"],
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "active", "suspended", "rejected"],
      default: "active",
    },

    favorites: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Listing" }],
      default: [],
    },

    history: {
      type: [
        {
          listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing" },
          viewedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    verification: { type: verificationSchema },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.model<IUser>("User", userSchema);