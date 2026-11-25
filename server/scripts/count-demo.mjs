import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const emails = [
  "superadmin@renta.local",
  "admin@renta.local",
  "owner@gmail.com",
  "tenant@gmail.com",
  "demo.pending.owner@gmail.com",
];

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const listings = await db.collection("listings").countDocuments({ title: /^Demo ·/ });
const reservations = await db.collection("reservations").countDocuments({ notes: /^demo-seed:/ });
const users = await db.collection("users").countDocuments({ email: { $in: emails } });
const notifications = await db.collection("notifications").countDocuments({ title: /^Demo / });
console.log(JSON.stringify({ listings, reservations, users, notifications }));
await mongoose.disconnect();
