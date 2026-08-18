import { Router } from "express";

import {
  authenticate,
  requireRole,
} from "../middleware/authMiddleware";

const router = Router();

router.get(
  "/tenant",
  authenticate,
  requireRole("tenant"),
  (req, res) => {
    res.json({
      message: "Welcome to the Tenant Dashboard",
      user: req.auth,
    });
  }
);

router.get(
  "/owner",
  authenticate,
  requireRole("owner"),
  (req, res) => {
    res.json({
      message: "Welcome to the Property Owner Dashboard",
      user: req.auth,
    });
  }
);

router.get(
  "/admin",
  authenticate,
  requireRole("admin"),
  (req, res) => {
    res.json({
      message: "Welcome to the Administrator Dashboard",
      user: req.auth,
    });
  }
);

export default router;