import { Router } from "express";
import {
  getStats,
  getOwners,
  reviewOwner,
  getAdminListings,
  reviewListing,
  getUsers,
  getReports,
  getAuditLog,
} from "../controllers/adminController";
import { authenticate, requireRole } from "../middleware/authMiddleware";

const router = Router();

// Every route in this file is administrator-only
router.use(authenticate, requireRole("admin"));

router.get("/stats", getStats);
router.get("/owners", getOwners);
router.patch("/owners/:id/review", reviewOwner);
router.get("/listings", getAdminListings);
router.patch("/listings/:id/review", reviewListing);
router.get("/users", getUsers);
router.get("/reports", getReports);
router.get("/audit", getAuditLog);

export default router;