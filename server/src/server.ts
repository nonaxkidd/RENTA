import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import authRoutes from "./routes/authRoutes";
import dashboardRoutes from "./routes/dashboardRoutes";
import listingRoutes from "./routes/listingRoutes";
import favoriteRoutes from "./routes/favoriteRoutes";
import historyRoutes from "./routes/historyRoutes";
import verificationRoutes from "./routes/verificationRoutes";
import adminRoutes from "./routes/adminRoutes";
import reservationRoutes from "./routes/reservationRoutes";
import reviewRoutes from "./routes/reviewRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import { LISTING_DIR } from "./utils/files";
import { paymongoWebhook } from "./controllers/paymentController";

import { connectDB } from "./config/db";

dotenv.config();

const app = express();

const trustProxy = Number(process.env.TRUST_PROXY);
if (Number.isFinite(trustProxy) && trustProxy > 0) {
  app.set("trust proxy", trustProxy);
}

const PORT = Number(process.env.PORT) || 5000;

const devOrigins = ["http://127.0.0.1:5173", "http://localhost:5173"];
const allowedOrigins = new Set<string>();
if (process.env.CLIENT_ORIGIN) allowedOrigins.add(process.env.CLIENT_ORIGIN);
if (process.env.NODE_ENV !== "production") {
  for (const origin of devOrigins) allowedOrigins.add(origin);
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
}));
app.post(
  "/api/v1/payments/webhook",
  express.raw({ type: "application/json" }),
  paymongoWebhook
);
app.use(express.json());
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/listings", listingRoutes);
app.use("/api/v1/favorites", favoriteRoutes);
app.use("/api/v1/history", historyRoutes);
app.use("/api/v1/verification", verificationRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/reservations", reservationRoutes);
app.use("/api/v1/reviews", reviewRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/media/listings", express.static(LISTING_DIR, { index: false, dotfiles: "deny" }));

app.get("/", (_req, res) => {
  res.send("RENTA Backend is running!");
});

app.get("/api/v1/health", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "degraded",
    application: "RENTA API",
    database: connected ? "connected" : "disconnected",
    readyState: mongoose.connection.readyState,
    message: connected ? "Backend server is working successfully" : "Database is not connected",
  });
});

function refuseUnsafeProductionConfig() {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.OTP_LOG_CODE === "true") {
    console.error("Refusing to start: OTP_LOG_CODE must not be true in production.");
    process.exit(1);
  }
  if (!process.env.DOCUMENT_ENCRYPTION_KEY) {
    console.error("Refusing to start: DOCUMENT_ENCRYPTION_KEY is required in production.");
    process.exit(1);
  }
  if (process.env.PAYMONGO_MOCK === "true") {
    console.error("Refusing to start: PAYMONGO_MOCK cannot be used in production.");
    process.exit(1);
  }
}

async function startServer() {
  refuseUnsafeProductionConfig();
  await connectDB();

  app.listen(PORT, () => {
    console.log(`RENTA server running at http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== "test") {
  startServer();
}

export { app };