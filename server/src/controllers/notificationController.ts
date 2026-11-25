import { Request, Response } from "express";
import { Notification } from "../models/Notification";
import { requireObjectId } from "../utils/params";

export async function getNotifications(req: Request, res: Response) {
  try {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ message: "Authentication required." });
    const notifications = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
    const unread = notifications.filter((item) => !item.read).length;
    res.json({ notifications, unread });
  } catch (error) {
    console.error("Failed to fetch notifications:", error);
    res.status(500).json({ message: "Failed to fetch notifications." });
  }
}

export async function markNotificationRead(req: Request, res: Response) {
  try {
    const id = requireObjectId(req, res, "id");
    if (!id) return;
    const updated = await Notification.findOneAndUpdate(
      { _id: id, userId: req.auth?.userId },
      { $set: { read: true } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Notification not found." });
    res.json({ notification: updated });
  } catch (error) {
    console.error("Failed to update notification:", error);
    res.status(500).json({ message: "Failed to update notification." });
  }
}

export async function markAllNotificationsRead(req: Request, res: Response) {
  try {
    await Notification.updateMany({ userId: req.auth?.userId, read: false }, { $set: { read: true } });
    res.json({ message: "Notifications marked read." });
  } catch (error) {
    console.error("Failed to update notifications:", error);
    res.status(500).json({ message: "Failed to update notifications." });
  }
}
