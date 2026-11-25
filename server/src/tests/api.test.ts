import bcrypt from "bcryptjs";
import type { Express } from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { User } from "../models/User";
import { Payment } from "../models/Payment";
import { Listing } from "../models/Listing";

let mongo: MongoMemoryServer;
let app: Express;

const password = "Verify12345!";
const moveIn = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

async function hash(value: string) {
  return bcrypt.hash(value, 4);
}

async function makeUser(email: string, role: "tenant" | "owner" | "admin" | "superadmin", phone: string) {
  return User.create({
    firstName: "Test",
    lastName: role,
    email,
    phone,
    passwordHash: await hash(password),
    defaultRole: role,
    emailVerified: true,
    status: "active",
  });
}

async function login(email: string) {
  const response = await request(app).post("/api/v1/auth/login").send({ email, password });
  return response.body.token as string;
}

async function listingFor(ownerToken: string, title: string, price: number) {
  const created = await request(app).post("/api/v1/listings").set("Authorization", `Bearer ${ownerToken}`).send({
    title,
    type: "Private room",
    barangay: "Ilaya",
    price,
    description: "Test listing for the suite.",
    capacity: 2,
    ownerName: "Test owner",
    imageUrl: "https://example.com/renta-photo.jpg",
    lat: 13.36,
    lng: 121.18,
  });
  return created.body.listing._id as string;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const loaded = await import("../server.js");
  app = loaded.app;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("RENTA API", () => {
  it("registers a tenant, blocks login until the OTP is confirmed, then signs in", async () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    const email = "otp.tenant@gmail.com";
    const registered = await request(app).post("/api/v1/auth/register").send({
      firstName: "Otp",
      lastName: "Tenant",
      email,
      phone: "09170001121",
      password,
      role: "tenant",
    });
    console.log = original;
    const code = lines.join("\n").match(/OTP for .+: (\d{6})/)?.[1];
    expect(registered.status).toBe(201);
    expect(code).toMatch(/^\d{6}$/);

    const blocked = await request(app).post("/api/v1/auth/login").send({ email, password });
    expect(blocked.status).toBe(403);
    expect(blocked.body.needsOtp).toBe(true);

    const verified = await request(app).post("/api/v1/auth/verify-otp").send({ email, code });
    expect(verified.status).toBe(200);
    expect(verified.body.token).toBeTruthy();
  });

  it("rejects a token after the account is deactivated", async () => {
    const tenant = await makeUser("deactivated.tenant@gmail.com", "tenant", "09170001122");
    const admin = await makeUser("deactivated.admin@renta.local", "admin", "09170001123");
    const tenantToken = await login(tenant.email);
    const adminToken = await login(admin.email);
    const before = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${tenantToken}`);
    expect(before.status).toBe(200);

    const deactivated = await request(app)
      .patch(`/api/v1/admin/users/${tenant._id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "deactivate", note: "Test deactivation." });
    expect(deactivated.status).toBe(200);

    const after = await request(app).get("/api/v1/notifications").set("Authorization", `Bearer ${tenantToken}`);
    expect(after.status).toBe(403);
    expect(after.body.code).toBe("ACCOUNT_BLOCKED");
  });

  it("approves a reservation, takes the mock payment, and marks the listing unavailable", async () => {
    const owner = await makeUser("pay.owner@gmail.com", "owner", "09170001124");
    const tenant = await makeUser("pay.tenant@gmail.com", "tenant", "09170001125");
    const admin = await makeUser("pay.admin@renta.local", "admin", "09170001126");
    const ownerToken = await login(owner.email);
    const tenantToken = await login(tenant.email);
    const adminToken = await login(admin.email);
    const listingId = await listingFor(ownerToken, "Payable room", 3000);
    const approvedListing = await request(app)
      .patch(`/api/v1/admin/listings/${listingId}/review`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "approve" });
    expect(approvedListing.status).toBe(200);

    const earlyReview = await request(app)
      .post(`/api/v1/reviews/listing/${listingId}`)
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ rating: 5, comment: "Too early." });
    expect(earlyReview.status).toBe(403);

    const reserved = await request(app)
      .post(`/api/v1/reservations/listings/${listingId}`)
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ intendedMoveIn: moveIn, occupants: 1 });
    expect(reserved.status).toBe(201);
    const reservationId = reserved.body.reservation._id as string;

    const approved = await request(app)
      .patch(`/api/v1/reservations/${reservationId}/decision`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ decision: "approve" });
    expect(approved.status).toBe(200);
    expect(approved.body.reservation.downPaymentAmount).toBe(3000);

    const checkout = await request(app)
      .post("/api/v1/payments/checkout")
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ reservationId });
    expect(checkout.status).toBe(200);
    expect(checkout.body.amount).toBe(3000);
    const paymentId = String(checkout.body.checkoutUrl).split("/").pop();

    const paid = await request(app).post(`/api/v1/payments/mock/${paymentId}/pay`).set("Authorization", `Bearer ${tenantToken}`);
    expect(paid.status).toBe(200);
    const listing = await Listing.findById(listingId);
    expect(listing?.available).toBe(false);

    const review = await request(app)
      .post(`/api/v1/reviews/listing/${listingId}`)
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ rating: 5, comment: "Quiet and clean." });
    expect(review.status).toBe(201);
  });

  it("marks a second paid reservation as needing a refund when the listing is already taken", async () => {
    const owner = await makeUser("refund.owner@gmail.com", "owner", "09170001127");
    const first = await makeUser("refund.one@gmail.com", "tenant", "09170001128");
    const second = await makeUser("refund.two@gmail.com", "tenant", "09170001129");
    const admin = await makeUser("refund.admin@renta.local", "admin", "09170001130");
    const ownerToken = await login(owner.email);
    const firstToken = await login(first.email);
    const secondToken = await login(second.email);
    const adminToken = await login(admin.email);
    const listingId = await listingFor(ownerToken, "Refund room", 2800);
    await request(app).patch(`/api/v1/admin/listings/${listingId}/review`).set("Authorization", `Bearer ${adminToken}`).send({ decision: "approve" });

    const firstReserve = await request(app).post(`/api/v1/reservations/listings/${listingId}`).set("Authorization", `Bearer ${firstToken}`).send({ intendedMoveIn: moveIn, occupants: 1 });
    const secondReserve = await request(app).post(`/api/v1/reservations/listings/${listingId}`).set("Authorization", `Bearer ${secondToken}`).send({ intendedMoveIn: moveIn, occupants: 1 });
    const firstId = firstReserve.body.reservation._id as string;
    const secondId = secondReserve.body.reservation._id as string;

    await request(app).patch(`/api/v1/reservations/${firstId}/decision`).set("Authorization", `Bearer ${ownerToken}`).send({ decision: "approve" });
    const firstCheckout = await request(app).post("/api/v1/payments/checkout").set("Authorization", `Bearer ${firstToken}`).send({ reservationId: firstId });
    const firstPayment = String(firstCheckout.body.checkoutUrl).split("/").pop();
    await request(app).patch(`/api/v1/reservations/${firstId}/cancel`).set("Authorization", `Bearer ${firstToken}`);

    await request(app).patch(`/api/v1/reservations/${secondId}/decision`).set("Authorization", `Bearer ${ownerToken}`).send({ decision: "approve" });
    const secondCheckout = await request(app).post("/api/v1/payments/checkout").set("Authorization", `Bearer ${secondToken}`).send({ reservationId: secondId });
    const secondPayment = String(secondCheckout.body.checkoutUrl).split("/").pop();
    const secondPay = await request(app).post(`/api/v1/payments/mock/${secondPayment}/pay`).set("Authorization", `Bearer ${secondToken}`);
    expect(secondPay.status).toBe(200);

    const late = await request(app).post(`/api/v1/payments/mock/${firstPayment}/pay`).set("Authorization", `Bearer ${firstToken}`);
    expect(late.status).toBe(409);
    const payment = await Payment.findById(firstPayment);
    expect(payment?.status).toBe("needs_refund");
  });

  it("rejects a review before a confirmed reservation and accepts it after", async () => {
    const owner = await makeUser("review.owner@gmail.com", "owner", "09170001201");
    const tenant = await makeUser("review.tenant@gmail.com", "tenant", "09170001202");
    const admin = await makeUser("review.admin@renta.local", "admin", "09170001203");
    const ownerToken = await login(owner.email);
    const tenantToken = await login(tenant.email);
    const adminToken = await login(admin.email);
    const listingId = await listingFor(ownerToken, "Review room", 2600);
    await request(app).patch(`/api/v1/admin/listings/${listingId}/review`).set("Authorization", `Bearer ${adminToken}`).send({ decision: "approve" });

    const before = await request(app)
      .post(`/api/v1/reviews/listing/${listingId}`)
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ rating: 4, comment: "Not yet." });
    expect(before.status).toBe(403);

    const reserved = await request(app)
      .post(`/api/v1/reservations/listings/${listingId}`)
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ intendedMoveIn: moveIn, occupants: 1 });
    const reservationId = reserved.body.reservation._id as string;
    await request(app).patch(`/api/v1/reservations/${reservationId}/decision`).set("Authorization", `Bearer ${ownerToken}`).send({ decision: "approve" });
    const checkout = await request(app).post("/api/v1/payments/checkout").set("Authorization", `Bearer ${tenantToken}`).send({ reservationId });
    const paymentId = String(checkout.body.checkoutUrl).split("/").pop();
    await request(app).post(`/api/v1/payments/mock/${paymentId}/pay`).set("Authorization", `Bearer ${tenantToken}`);

    const after = await request(app)
      .post(`/api/v1/reviews/listing/${listingId}`)
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ rating: 4, comment: "Quiet stay." });
    expect(after.status).toBe(201);
  });

  it("ignores verified, available, ownerId, and archivedAt on listing update", async () => {
    const owner = await makeUser("fields.owner@gmail.com", "owner", "09170001204");
    const other = await makeUser("fields.other@gmail.com", "owner", "09170001205");
    const admin = await makeUser("fields.admin@renta.local", "admin", "09170001206");
    const ownerToken = await login(owner.email);
    const adminToken = await login(admin.email);
    const listingId = await listingFor(ownerToken, "Field guard", 2500);
    await request(app).patch(`/api/v1/admin/listings/${listingId}/review`).set("Authorization", `Bearer ${adminToken}`).send({ decision: "approve" });

    const updated = await request(app).put(`/api/v1/listings/${listingId}`).set("Authorization", `Bearer ${ownerToken}`).send({
      verified: false,
      available: false,
      ownerId: String(other._id),
      archivedAt: new Date().toISOString(),
    });
    expect(updated.status).toBe(200);
    const stored = await Listing.findById(listingId);
    expect(stored?.verified).toBe(true);
    expect(stored?.available).toBe(true);
    expect(String(stored?.ownerId)).toBe(String(owner._id));
    expect(stored?.archivedAt ?? null).toBeNull();
  });

  it("hides unverified and pending-owner listings and rejects a reservation", async () => {
    const owner = await makeUser("hidden.owner@gmail.com", "owner", "09170001207");
    const tenant = await makeUser("hidden.tenant@gmail.com", "tenant", "09170001208");
    const pending = await makeUser("hidden.pending@gmail.com", "owner", "09170001210");
    pending.status = "pending";
    await pending.save();
    const ownerToken = await login(owner.email);
    const tenantToken = await login(tenant.email);
    const pendingToken = await login(pending.email);

    const unverifiedId = await listingFor(ownerToken, "Hidden room", 1800);
    const pendingId = await listingFor(pendingToken, "Pending owner room", 1900);
    await Listing.findByIdAndUpdate(pendingId, { verified: true });

    const list = await request(app).get("/api/v1/listings?limit=50");
    const ids = (list.body.listings as { _id: string }[]).map((item) => item._id);
    expect(ids).not.toContain(unverifiedId);
    expect(ids).not.toContain(pendingId);
    expect((await request(app).get(`/api/v1/listings/${unverifiedId}`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/listings/${pendingId}`)).status).toBe(404);

    const reserveUnverified = await request(app)
      .post(`/api/v1/reservations/listings/${unverifiedId}`)
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ intendedMoveIn: moveIn, occupants: 1 });
    const reservePending = await request(app)
      .post(`/api/v1/reservations/listings/${pendingId}`)
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ intendedMoveIn: moveIn, occupants: 1 });
    expect(reserveUnverified.status).toBe(409);
    expect(reservePending.status).toBe(409);
  });

  it("charges the snapshotted down payment after the owner raises or lowers the price", async () => {
    const owner = await makeUser("snap.owner@gmail.com", "owner", "09170001211");
    const tenant = await makeUser("snap.tenant@gmail.com", "tenant", "09170001212");
    const admin = await makeUser("snap.admin@renta.local", "admin", "09170001213");
    const ownerToken = await login(owner.email);
    const tenantToken = await login(tenant.email);
    const adminToken = await login(admin.email);
    const listingId = await listingFor(ownerToken, "Snapshot room", 4000);
    await request(app).patch(`/api/v1/admin/listings/${listingId}/review`).set("Authorization", `Bearer ${adminToken}`).send({ decision: "approve" });
    const reserved = await request(app)
      .post(`/api/v1/reservations/listings/${listingId}`)
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ intendedMoveIn: moveIn, occupants: 1 });
    const reservationId = reserved.body.reservation._id as string;
    const approved = await request(app)
      .patch(`/api/v1/reservations/${reservationId}/decision`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ decision: "approve" });
    expect(approved.body.reservation.downPaymentAmount).toBe(4000);

    await request(app).put(`/api/v1/listings/${listingId}`).set("Authorization", `Bearer ${ownerToken}`).send({ price: 9000 });
    const raised = await request(app).post("/api/v1/payments/checkout").set("Authorization", `Bearer ${tenantToken}`).send({ reservationId });
    expect(raised.status).toBe(200);
    expect(raised.body.amount).toBe(4000);

    await request(app).put(`/api/v1/listings/${listingId}`).set("Authorization", `Bearer ${ownerToken}`).send({ price: 1500 });
    const lowered = await request(app).post("/api/v1/payments/checkout").set("Authorization", `Bearer ${tenantToken}`).send({ reservationId });
    expect(lowered.status).toBe(200);
    expect(lowered.body.amount).toBe(4000);
  });

  it("refuses to remove a listing that has a confirmed reservation", async () => {
    const owner = await makeUser("keep.owner@gmail.com", "owner", "09170001214");
    const tenant = await makeUser("keep.tenant@gmail.com", "tenant", "09170001215");
    const admin = await makeUser("keep.admin@renta.local", "admin", "09170001216");
    const ownerToken = await login(owner.email);
    const tenantToken = await login(tenant.email);
    const adminToken = await login(admin.email);
    const listingId = await listingFor(ownerToken, "Keep room", 3100);
    await request(app).patch(`/api/v1/admin/listings/${listingId}/review`).set("Authorization", `Bearer ${adminToken}`).send({ decision: "approve" });
    const reserved = await request(app)
      .post(`/api/v1/reservations/listings/${listingId}`)
      .set("Authorization", `Bearer ${tenantToken}`)
      .send({ intendedMoveIn: moveIn, occupants: 1 });
    const reservationId = reserved.body.reservation._id as string;
    await request(app).patch(`/api/v1/reservations/${reservationId}/decision`).set("Authorization", `Bearer ${ownerToken}`).send({ decision: "approve" });
    const checkout = await request(app).post("/api/v1/payments/checkout").set("Authorization", `Bearer ${tenantToken}`).send({ reservationId });
    const paymentId = String(checkout.body.checkoutUrl).split("/").pop();
    await request(app).post(`/api/v1/payments/mock/${paymentId}/pay`).set("Authorization", `Bearer ${tenantToken}`);

    const removed = await request(app).delete(`/api/v1/listings/${listingId}`).set("Authorization", `Bearer ${ownerToken}`);
    expect(removed.status).toBe(409);
    const stored = await Listing.findById(listingId);
    expect(stored?.archivedAt ?? null).toBeNull();
    const payment = await Payment.findById(paymentId);
    expect(payment?.status).toBe("paid");
  });

  it("stops a normal admin from deactivating a superadmin", async () => {
    const admin = await makeUser("guard.admin@renta.local", "admin", "09170001131");
    const superadmin = await makeUser("guard.super@renta.local", "superadmin", "09170001132");
    const adminToken = await login(admin.email);
    const response = await request(app)
      .patch(`/api/v1/admin/users/${superadmin._id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "deactivate", note: "Should fail." });
    expect(response.status).toBe(403);
    const stored = await User.findById(superadmin._id);
    expect(stored?.status).toBe("active");
  });
});
