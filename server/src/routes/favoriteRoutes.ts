import { Router } from "express";
import { getFavorites, addFavorite, removeFavorite } from "../controllers/favoriteController";
import { authenticate, requireRole } from "../middleware/authMiddleware";

const router = Router();

router.get("/", authenticate, requireRole("tenant"), getFavorites);
router.post("/:listingId", authenticate, requireRole("tenant"), addFavorite);
router.delete("/:listingId", authenticate, requireRole("tenant"), removeFavorite);

export default router;