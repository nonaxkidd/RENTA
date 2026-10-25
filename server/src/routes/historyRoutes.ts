import { Router } from "express";
import { recordView, getHistory } from "../controllers/historyController";
import { authenticate, requireRole } from "../middleware/authMiddleware";

const router = Router();

router.get("/", authenticate, requireRole("tenant"), getHistory);
router.post("/:listingId", authenticate, requireRole("tenant"), recordView);

export default router;