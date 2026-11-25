import mongoose from "mongoose";
import { Notification, NotificationKind } from "../models/Notification";

export async function notify(userId: unknown, kind: NotificationKind, title: string, body: string) {
  if (!userId) return;
  try {
    await Notification.create({
      userId: new mongoose.Types.ObjectId(String(userId)),
      kind,
      title,
      body,
      read: false,
    });
  } catch (error) {
    console.error("Failed to save notification:", error);
  }
}
