import { Router } from "express";
import {
  getListings,
  getListingById,
  getMyListings,
  getBarangays,
  getBarangayCenter,
  createListing,
  updateListing,
  archiveListing,
  uploadListingPhoto,
} from "../controllers/listingController";
import { authenticate, requireRole } from "../middleware/authMiddleware";
import { upload } from "../utils/files";

const router = Router();

// IMPORTANT: "/mine" must be registered before "/:id",
// otherwise Express treats "mine" as an :id value.
router.get("/mine", authenticate, requireRole("owner"), getMyListings);
router.get("/barangays", getBarangays);
router.get("/barangay-center", getBarangayCenter);

router.get("/", getListings);
router.get("/:id", getListingById);

router.post("/photo", authenticate, requireRole("owner"), upload.single("photo"), uploadListingPhoto);
router.post("/", authenticate, requireRole("owner"), createListing);
router.put("/:id", authenticate, requireRole("owner"), updateListing);
router.delete("/:id", authenticate, requireRole("owner"), archiveListing);

export default router;