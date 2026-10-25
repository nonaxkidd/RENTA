import { Router } from "express";
import {
  getListings,
  getListingById,
  getMyListings,
  createListing,
  updateListing,
} from "../controllers/listingController";
import { authenticate, requireRole } from "../middleware/authMiddleware";

const router = Router();

// IMPORTANT: "/mine" must be registered before "/:id",
// otherwise Express treats "mine" as an :id value.
router.get("/mine", authenticate, requireRole("owner"), getMyListings);

router.get("/", getListings);
router.get("/:id", getListingById);

router.post("/", authenticate, requireRole("owner"), createListing);
router.put("/:id", authenticate, requireRole("owner"), updateListing);

export default router;