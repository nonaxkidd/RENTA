import { Router } from "express";
import { authenticate, requireRole } from "../middleware/authMiddleware";
import {
  createReservation,
  getMyReservations,
  getOwnerReservations,
  decideReservation,
  cancelReservation,
} from "../controllers/reservationController";

const router = Router();

router.get("/mine", authenticate, requireRole("tenant"), getMyReservations);
router.post("/listings/:listingId", authenticate, requireRole("tenant"), createReservation);
router.patch("/:id/cancel", authenticate, requireRole("tenant"), cancelReservation);
router.get("/owner", authenticate, requireRole("owner"), getOwnerReservations);
router.patch("/:id/decision", authenticate, requireRole("owner"), decideReservation);

export default router;
