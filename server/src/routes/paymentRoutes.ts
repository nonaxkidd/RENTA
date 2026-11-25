import { Router } from "express";
import { authenticate, requireRole } from "../middleware/authMiddleware";
import { cancelMockPayment, createCheckout, getMockPayment, payMockPayment, syncPayment } from "../controllers/paymentController";

const router = Router();

router.post("/checkout", authenticate, requireRole("tenant"), createCheckout);
router.post("/sync", authenticate, requireRole("tenant"), syncPayment);
router.get("/mock/:id", authenticate, requireRole("tenant"), getMockPayment);
router.post("/mock/:id/pay", authenticate, requireRole("tenant"), payMockPayment);
router.post("/mock/:id/cancel", authenticate, requireRole("tenant"), cancelMockPayment);

export default router;
