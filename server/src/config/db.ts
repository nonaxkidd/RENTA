import dns from "dns";
import mongoose from "mongoose";

// Some home networks refuse MongoDB SRV lookups. Public DNS still reaches Atlas.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is missing from .env");
  }

  try {
    await mongoose.connect(uri);
    console.log("MongoDB connected successfully!");
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
}