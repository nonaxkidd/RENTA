import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  register,
  login,
  verifyOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
  updateProfile,
  changePassword,
} from "../controllers/authControllers";
import { authenticate, requireRole } from "../middleware/authMiddleware";

const router = Router();

function limitMax(name: string, productionDefault: number, devDefault: number) {
  const configured = Number(process.env[name]);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return process.env.NODE_ENV === "production" ? productionDefault : devDefault;
}

function limit(name: string, productionDefault: number, devDefault: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: limitMax(name, productionDefault, devDefault),
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many attempts. Wait a few minutes and try again." },
  });
}

router.post("/register", limit("RATE_LIMIT_REGISTER", 8, 100), register);
router.post("/login", limit("RATE_LIMIT_LOGIN", 10, 100), login);
router.post("/verify-otp", limit("RATE_LIMIT_VERIFY_OTP", 10, 100), verifyOtp);
router.post("/resend-otp", limit("RATE_LIMIT_RESEND_OTP", 5, 100), resendOtp);
router.post("/forgot-password", limit("RATE_LIMIT_FORGOT_PASSWORD", 5, 100), forgotPassword);
router.post("/reset-password", limit("RATE_LIMIT_RESET_PASSWORD", 8, 100), resetPassword);
router.patch("/me", authenticate, requireRole("tenant"), updateProfile);
router.patch("/password", authenticate, requireRole("tenant"), changePassword);

export default router;
