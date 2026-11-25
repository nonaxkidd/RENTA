import { Router } from "express";
import { authenticate, requireRole } from "../middleware/authMiddleware";
import { createListingReview, getListingReviews } from "../controllers/reviewController";

const router = Router();

router.get("/listing/:listingId", getListingReviews);
router.post("/listing/:listingId", authenticate, requireRole("tenant"), createListingReview);

export default router;
