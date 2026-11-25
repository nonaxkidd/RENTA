import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { Listing } from "../models/Listing";
import { Notification } from "../models/Notification";
import { Reservation } from "../models/Reservation";
import { User } from "../models/User";
import { saveEncryptedDoc, saveListingPhoto } from "../utils/files";

dotenv.config();

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const accounts = [
  { firstName: "RENTA", lastName: "Superadmin", email: "superadmin@renta.local", password: "SuperAdmin12345!", role: "superadmin" as const, phone: "09170000001" },
  { firstName: "RENTA", lastName: "Administrator", email: "admin@renta.local", password: "Admin12345!", role: "admin" as const, phone: "09170000002" },
  { firstName: "Maria", lastName: "Santos", email: "owner@gmail.com", password: "Owner12345!", role: "owner" as const, phone: "09170000003" },
  { firstName: "Juan", lastName: "Dela Cruz", email: "tenant@gmail.com", password: "Tenant12345!", role: "tenant" as const, phone: "09181234567" },
  { firstName: "Pedro", lastName: "Pending", email: "demo.pending.owner@gmail.com", password: "Owner12345!", role: "owner" as const, phone: "09170000004", pending: true },
];

const approved = [
  ["Demo · Bayanan room", "Private room", "Bayanan I", 4200],
  ["Demo · Balite studio", "Studio unit", "Balite", 6800],
  ["Demo · Ilaya bedspace", "Bedspace", "Ilaya", 2200],
  ["Demo · Lazareto 1BR", "1BR unit", "Lazareto", 9100],
  ["Demo · Guinobatan 2BR", "2BR unit", "Guinobatan", 12500],
  ["Demo · Gutad room", "Private room", "Gutad", 4500],
  ["Demo · Camilmil studio", "Studio unit", "Camilmil", 7300],
  ["Demo · Masipit bedspace", "Bedspace", "Masipit", 1800],
  ["Demo · Suqui 1BR", "1BR unit", "Suqui", 8600],
  ["Demo · Wawa 2BR", "2BR unit", "Wawa", 11000],
  ["Demo · Salong room", "Private room", "Salong", 3900],
  ["Demo · Tibag studio", "Studio unit", "Tibag", 6400],
] as const;

const reservationPlan = [
  "queued",
  "payment_pending",
  "confirmed",
  "rejected",
  "expired",
  "cancelled",
  "conflict",
] as const;

async function ensureAccount(account: (typeof accounts)[number]) {
  const existing = await User.findOne({ email: account.email });
  if (existing) return existing;
  return User.create({
    firstName: account.firstName,
    lastName: account.lastName,
    email: account.email,
    phone: account.phone,
    passwordHash: await bcrypt.hash(account.password, 12),
    defaultRole: account.role,
    emailVerified: true,
    status: "pending" in account && account.pending ? "pending" : "active",
  });
}

async function placeholderUrl() {
  const name = await saveListingPhoto(PNG, "image/png");
  return `http://localhost:5000/api/v1/media/listings/${name}`;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is missing from .env");
  await mongoose.connect(process.env.MONGODB_URI);

  const users = [];
  for (const account of accounts) users.push(await ensureAccount(account));
  const owner = users.find((user) => user.email === "owner@gmail.com");
  const tenant = users.find((user) => user.email === "tenant@gmail.com");
  const admin = users.find((user) => user.email === "admin@renta.local");
  const pending = users.find((user) => user.email === "demo.pending.owner@gmail.com");
  if (!owner || !tenant || !admin || !pending) throw new Error("Demo accounts were not created.");

  if (!pending.verification?.idDocumentKey || !pending.verification.authorityDocumentKey) {
    pending.status = "pending";
    pending.verification = {
      idDocumentKey: await saveEncryptedDoc(PNG),
      idDocumentMime: "image/png",
      authorityDocumentKey: await saveEncryptedDoc(PNG),
      authorityDocumentMime: "image/png",
      submittedAt: new Date(),
    };
    await pending.save();
  }

  const listings = [];
  for (let index = 0; index < approved.length; index += 1) {
    const [title, type, barangay, price] = approved[index];
    let listing = await Listing.findOne({ title, ownerId: owner._id });
    if (!listing) {
      listing = await Listing.create({
        title,
        type,
        barangay,
        price,
        transparency: 80 + (index % 15),
        verified: true,
        lat: 13.36 + index * 0.004,
        lng: 121.16 + (index % 4) * 0.01,
        description: `${type} in ${barangay} for the local RENTA demo.`,
        amenities: ["Wi-Fi", "Shared kitchen"],
        houseRules: ["Quiet hours after 10 PM"],
        capacity: type === "2BR unit" ? 4 : type === "1BR unit" ? 3 : 2,
        available: true,
        ownerName: "Maria Santos",
        ownerId: owner._id,
        imageUrl: await placeholderUrl(),
        reviewedAt: new Date(),
      });
    }
    listings.push(listing);
  }

  let disapproved = await Listing.findOne({ title: "Demo · Disapproved room", ownerId: owner._id });
  if (!disapproved) {
    disapproved = await Listing.create({
      title: "Demo · Disapproved room",
      type: "Private room",
      barangay: "Balingayan",
      price: 3000,
      transparency: 40,
      verified: false,
      lat: 13.4,
      lng: 121.19,
      description: "This demo listing was disapproved and stays hidden from the public.",
      amenities: [],
      houseRules: [],
      capacity: 1,
      available: true,
      ownerName: "Maria Santos",
      ownerId: owner._id,
      imageUrl: await placeholderUrl(),
      reviewNote: "The photo does not show the room. Upload a clearer picture.",
      reviewedAt: new Date(),
    });
  }

  for (let index = 0; index < reservationPlan.length; index += 1) {
    const queueStatus = reservationPlan[index];
    const listing = listings[index];
    const existing = await Reservation.findOne({ tenantId: tenant._id, unitId: listing._id, notes: `demo-seed:${queueStatus}` });
    if (existing) continue;
    const active = queueStatus === "queued" || queueStatus === "payment_pending" || queueStatus === "confirmed";
    await Reservation.create({
      tenantId: tenant._id,
      unitId: listing._id,
      intendedMoveIn: new Date(Date.now() + (index + 3) * 24 * 60 * 60 * 1000),
      occupants: 1,
      notes: `demo-seed:${queueStatus}`,
      serverTimestamp: new Date(Date.now() - index * 60000),
      queueStatus,
      isActive: active,
      ownerDecision: queueStatus === "rejected" ? "rejected" : queueStatus === "queued" ? undefined : "approved",
      downPaymentAmount: queueStatus === "queued" || queueStatus === "rejected" ? undefined : listing.price,
      cancellationReason: active ? undefined : `Demo reservation is ${queueStatus}.`,
    });
  }

  const notes = [
    [tenant._id, "reservation_approved", "Demo reservation approved", "A demo reservation is waiting for the one-month down payment."],
    [owner._id, "reservation_requested", "Demo reservation request", "A tenant requested a demo listing."],
    [admin._id, "listing_pending_review", "Demo listing needs review", "A demo listing is waiting for an admin decision."],
  ] as const;

  for (const [userId, kind, title, body] of notes) {
    const found = await Notification.findOne({ userId, title });
    if (!found) await Notification.create({ userId, kind, title, body, read: false });
  }

  console.log(`Demo data ready. Approved listings: ${listings.length}. Disapproved: ${disapproved.title}. Pending owner: ${pending.email}.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Demo seed failed.");
  process.exit(1);
});
