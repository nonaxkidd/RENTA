import { Router } from "express";
import { getMyVerification, readMyDocument, submitVerification } from "../controllers/verificationController";
import { authenticate, requireRole } from "../middleware/authMiddleware";
import { upload } from "../utils/files";

const router = Router();

router.get("/me", authenticate, requireRole("owner"), getMyVerification);
router.get("/files/me/:kind", authenticate, requireRole("owner"), readMyDocument);
router.post(
  "/",
  authenticate,
  requireRole("owner"),
  upload.fields([
    { name: "idDocument", maxCount: 1 },
    { name: "authorityDocument", maxCount: 1 },
  ]),
  submitVerification
);

export default router;
