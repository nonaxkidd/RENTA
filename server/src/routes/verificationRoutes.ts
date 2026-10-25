import { Router } from "express";
import { getMyVerification, submitVerification } from "../controllers/verificationController";
import { authenticate, requireRole } from "../middleware/authMiddleware";

const router = Router();

router.get("/me", authenticate, requireRole("owner"), getMyVerification);
router.post("/", authenticate, requireRole("owner"), submitVerification);

export default router;