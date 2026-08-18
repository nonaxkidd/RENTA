import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes";
import dashboardRoutes from "./routes/dashboardRoutes";

import { connectDB } from "./config/db";

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json());
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);

app.get("/", (_req, res) => {
  res.send("RENTA Backend is running!");
});

app.get("/api/v1/health", (_req, res) => {
  res.json({
    status: "ok",
    application: "RENTA API",
    database: "connected",
    message: "Backend server is working successfully",
  });
});

async function startServer() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`RENTA server running at http://localhost:${PORT}`);
  });
}

startServer();