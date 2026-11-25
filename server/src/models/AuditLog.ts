import mongoose, { Schema } from "mongoose";

export interface IAuditLog {
  actorId: mongoose.Types.ObjectId;
  actorName: string;
  action: string;
  targetType: "owner" | "listing" | "user";
  targetId: mongoose.Types.ObjectId;
  targetLabel: string;
  note?: string;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorName: { type: String, required: true },
    action: { type: String, required: true },
    targetType: { type: String, enum: ["owner", "listing", "user"], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    targetLabel: { type: String, required: true },
    note: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AuditLog = mongoose.model<IAuditLog>("AuditLog", auditLogSchema);