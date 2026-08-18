import mongoose, { Schema } from "mongoose";

export type UserRole = "tenant" | "owner" | "admin";

export interface IUser {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  defaultRole: UserRole;
  status: "pending" | "active" | "suspended" | "rejected";
}

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
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.model<IUser>("User", userSchema);