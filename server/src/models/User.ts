import mongoose, { Schema } from "mongoose";

export type UserRole = "tenant" | "owner" | "admin" | "superadmin";
export type UserStatus = "pending" | "active" | "suspended" | "rejected" | "archived";

export interface IVerification {
  idDocumentUrl?: string;
  authorityDocumentUrl?: string;
  idDocumentKey?: string;
  idDocumentMime?: string;
  authorityDocumentKey?: string;
  authorityDocumentMime?: string;
  submittedAt?: Date;
  reviewedAt?: Date;
  reviewNote?: string;
  revisionRequested?: boolean;
}

export interface IUser {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  passwordHash: string;
  defaultRole: UserRole;
  emailVerified: boolean;
  status: UserStatus;
  statusBeforeDeactivation?: UserStatus;
  statusBeforeArchive?: UserStatus;
  archivedAt?: Date;
  favorites: mongoose.Types.ObjectId[];
  history: { listing: mongoose.Types.ObjectId; viewedAt: Date }[];
  verification?: IVerification;
}

const verificationSchema = new Schema<IVerification>(
  {
    idDocumentUrl: { type: String },
    authorityDocumentUrl: { type: String },
    idDocumentKey: { type: String },
    idDocumentMime: { type: String },
    authorityDocumentKey: { type: String },
    authorityDocumentMime: { type: String },
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

    phone: {
      type: String,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    defaultRole: {
      type: String,
      enum: ["tenant", "owner", "admin", "superadmin"],
      required: true,
    },

    emailVerified: {
      type: Boolean,
      default: true,
    },

    status: {
      type: String,
      enum: ["pending", "active", "suspended", "rejected", "archived"],
      default: "active",
    },

    statusBeforeDeactivation: {
      type: String,
      enum: ["pending", "active", "suspended", "rejected", "archived"],
    },

    statusBeforeArchive: {
      type: String,
      enum: ["pending", "active", "suspended", "rejected", "archived"],
    },

    archivedAt: { type: Date },

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