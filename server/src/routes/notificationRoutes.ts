import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "../controllers/notificationController";

const router = Router();

router.get("/", authenticate, getNotifications);
router.patch("/read-all", authenticate, markAllNotificationsRead);
router.patch("/:id/read", authenticate, markNotificationRead);

export default router;
