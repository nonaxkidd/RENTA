import { createHmac, timingSafeEqual } from "crypto";
import { Request, Response } from "express";
import mongoose from "mongoose";
import { Listing } from "../models/Listing";
import { Payment } from "../models/Payment";
import { Reservation } from "../models/Reservation";
import { User } from "../models/User";
import { notify } from "../services/notify";
import { requireObjectId } from "../utils/params";

function paymongoAuthHeader(secret: string) {
  return `Basic ${Buffer.from(`${secret}:`).toString("base64")}`;
}

async function markReservationPaid(reservationId: string, paymentId: string) {
  const reservation = await Reservation.findById(reservationId);
  if (!reservation) return { ok: false as const, message: "Reservation not found." };
  if (reservation.queueStatus === "confirmed") return { ok: true as const, already: true };

  const claimed = await Listing.findOneAndUpdate(
    { _id: reservation.unitId, available: true },
    { $set: { available: false } }
  );

  if (!claimed) {
    reservation.queueStatus = "conflict";
    reservation.isActive = false;
    reservation.cancellationReason = "The listing was already reserved by a paid down payment.";
    await reservation.save();
    await Payment.findByIdAndUpdate(paymentId, {
      status: "needs_refund",
      paidAt: new Date(),
      note: "Paid after the listing was taken.",
    });
    return {
      ok: false as const,
      message: "Payment was received, but this listing was just reserved. Contact RENTA for a refund.",
    };
  }

  reservation.queueStatus = "confirmed";
  reservation.isActive = true;
  await reservation.save();

  await Payment.findByIdAndUpdate(paymentId, { status: "paid", paidAt: new Date() });
  await notify(reservation.tenantId, "payment_confirmed", "Down payment confirmed", "Your down payment was confirmed and the listing is now reserved.");
  if (claimed.ownerId) {
    await notify(claimed.ownerId, "payment_confirmed", "Down payment confirmed", `${claimed.title} is now reserved.`);
  }

  await Reservation.updateMany(
    {
      unitId: reservation.unitId,
      _id: { $ne: reservation._id },
      isActive: true,
    },
    {
      $set: {
        queueStatus: "conflict",
        isActive: false,
        cancellationReason: "Another tenant completed the down payment.",
      },
    }
  );

  return { ok: true as const };
}

function sessionIsPaid(session: { attributes?: Record<string, unknown> }): boolean {
  const attributes = session.attributes ?? {};
  const payments = Array.isArray(attributes.payments) ? attributes.payments : [];
  const paymentPaid = payments.some((payment) => {
    if (!payment || typeof payment !== "object") return false;
    const status = (payment as { attributes?: { status?: string } }).attributes?.status;
    return status === "paid";
  });

  const intent = attributes.payment_intent as { attributes?: { status?: string } } | undefined;
  return paymentPaid || intent?.attributes?.status === "succeeded";
}

export async function createCheckout(req: Request, res: Response) {
  try {
    const tenantId = req.auth?.userId;
    const reservationId = typeof req.body?.reservationId === "string" ? req.body.reservationId : "";

    if (!tenantId || !mongoose.isValidObjectId(tenantId) || !mongoose.isValidObjectId(reservationId)) {
      return res.status(400).json({ message: "Invalid reservation." });
    }

    const mockPayments = process.env.PAYMONGO_MOCK === "true" && process.env.NODE_ENV !== "production";
    const secret = process.env.PAYMONGO_SECRET_KEY;
    if (!secret && !mockPayments) {
      return res.status(503).json({
        message: "PayMongo is not configured. Set PAYMONGO_SECRET_KEY to collect the down payment.",
      });
    }

    const reservation = await Reservation.findOne({
      _id: reservationId,
      tenantId,
      isActive: true,
      queueStatus: "payment_pending",
    });

    if (!reservation) {
      return res.status(409).json({ message: "This reservation is not waiting for a down payment." });
    }

    const listing = await Listing.findById(reservation.unitId).select("title price available archivedAt");
    if (!listing || listing.archivedAt || listing.available !== true) {
      return res.status(409).json({ message: "This listing is no longer available." });
    }

    const tenant = await User.findById(tenantId).select("firstName lastName email phone");
    if (!tenant) {
      return res.status(401).json({ message: "Authentication required." });
    }

    const amountPesos = reservation.downPaymentAmount && reservation.downPaymentAmount > 0
      ? reservation.downPaymentAmount
      : listing.price;
    const amountCentavos = Math.round(amountPesos * 100);
    const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

    await Payment.updateMany(
      { reservationId: reservation._id, status: "pending" },
      { $set: { status: "cancelled" } }
    );

    if (mockPayments) {
      reservation.downPaymentAmount = amountPesos;
      await reservation.save();
      const payment = await Payment.create({
        reservationId: reservation._id,
        listingId: listing._id,
        tenantId,
        amount: amountPesos,
        currency: "PHP",
        provider: "paymongo",
        providerSessionId: "mock",
        status: "pending",
      });
      const checkoutUrl = `${clientOrigin}/pay/mock/${payment._id}`;
      payment.checkoutUrl = checkoutUrl;
      payment.providerSessionId = String(payment._id);
      await payment.save();
      return res.json({ checkoutUrl, amount: amountPesos, mock: true });
    }

    if (!secret) {
      return res.status(503).json({ message: "PayMongo is not configured. Set PAYMONGO_SECRET_KEY to collect the down payment." });
    }

    const response = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
      method: "POST",
      headers: {
        Authorization: paymongoAuthHeader(secret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            billing: {
              name: `${tenant.firstName} ${tenant.lastName}`.trim(),
              email: tenant.email,
              phone: tenant.phone,
            },
            line_items: [
              {
                currency: "PHP",
                amount: amountCentavos,
                name: `Down payment — ${listing.title}`,
                quantity: 1,
              },
            ],
            payment_method_types: ["gcash", "paymaya", "grab_pay", "card"],
            success_url: `${clientOrigin}/listings/${listing._id}?reservation=${reservation._id}`,
            cancel_url: `${clientOrigin}/listings/${listing._id}?reservation=${reservation._id}&paid=0`,
            description: `RENTA down payment (1 month) for ${listing.title}`,
            metadata: { reservationId: String(reservation._id) },
          },
        },
      }),
    });

    const payload = (await response.json()) as {
      data?: { id?: string; attributes?: { checkout_url?: string } };
      errors?: { detail?: string }[];
    };

    if (!response.ok || !payload.data?.id || !payload.data.attributes?.checkout_url) {
      console.error("PayMongo checkout failed:", payload);
      return res.status(502).json({
        message: payload.errors?.[0]?.detail || "PayMongo could not start checkout.",
      });
    }

    reservation.downPaymentAmount = amountPesos;
    await reservation.save();

    await Payment.create({
      reservationId: reservation._id,
      listingId: listing._id,
      tenantId,
      amount: amountPesos,
      currency: "PHP",
      provider: "paymongo",
      providerSessionId: payload.data.id,
      checkoutUrl: payload.data.attributes.checkout_url,
      status: "pending",
    });

    res.json({
      checkoutUrl: payload.data.attributes.checkout_url,
      amount: amountPesos,
    });
  } catch (error) {
    console.error("Failed to start checkout:", error);
    res.status(500).json({ message: "Failed to start checkout." });
  }
}

export async function syncPayment(req: Request, res: Response) {
  try {
    const tenantId = req.auth?.userId;
    const reservationId = typeof req.body?.reservationId === "string" ? req.body.reservationId : "";
    const secret = process.env.PAYMONGO_SECRET_KEY;

    if (!tenantId || !mongoose.isValidObjectId(reservationId)) {
      return res.status(400).json({ message: "Invalid reservation." });
    }
    if (!secret) {
      return res.status(503).json({ message: "PayMongo is not configured." });
    }

    const payment = await Payment.findOne({ reservationId, tenantId, status: { $in: ["pending", "paid"] } }).sort({
      createdAt: -1,
    });

    if (!payment) {
      return res.status(404).json({ message: "No checkout was started for this reservation." });
    }
    if (payment.status === "paid") {
      return res.json({ status: "paid" });
    }

    const response = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${payment.providerSessionId}`, {
      headers: { Authorization: paymongoAuthHeader(secret) },
    });

    const payload = (await response.json()) as { data?: { attributes?: Record<string, unknown> } };
    if (!response.ok || !payload.data) {
      return res.status(502).json({ message: "Could not check the payment with PayMongo." });
    }

    if (!sessionIsPaid(payload.data)) {
      return res.json({ status: "pending" });
    }

    const result = await markReservationPaid(reservationId, String(payment._id));
    if (!result.ok) {
      return res.status(409).json({ message: result.message, status: "needs_refund" });
    }

    res.json({ status: "paid" });
  } catch (error) {
    console.error("Failed to sync payment:", error);
    res.status(500).json({ message: "Failed to confirm payment." });
  }
}

function signatureMatches(raw: Buffer, header: string | undefined, secret: string): boolean {
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(",").map((piece) => {
      const index = piece.indexOf("=");
      return [piece.slice(0, index), piece.slice(index + 1)];
    })
  );

  const signed = createHmac("sha256", secret).update(`${parts.t}.${raw.toString("utf8")}`).digest("hex");
  const expected = process.env.PAYMONGO_SECRET_KEY?.startsWith("sk_live") ? parts.li : parts.te;
  if (!expected || expected.length !== signed.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signed));
}

export async function paymongoWebhook(req: Request, res: Response) {
  try {
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return res.status(503).json({ message: "PayMongo webhook secret is not configured." });
    }

    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const header = req.header("paymongo-signature") ?? undefined;
    if (!signatureMatches(raw, header, webhookSecret)) {
      return res.status(401).json({ message: "Invalid webhook signature." });
    }

    const event = JSON.parse(raw.toString("utf8")) as {
      data?: {
        attributes?: {
          type?: string;
          data?: { id?: string; attributes?: { metadata?: { reservationId?: string } } };
        };
      };
    };

    if (event.data?.attributes?.type !== "checkout_session.payment.paid") {
      return res.json({ received: true });
    }

    const sessionId = event.data.attributes.data?.id;
    const reservationId = event.data.attributes.data?.attributes?.metadata?.reservationId;
    if (!sessionId || !reservationId) {
      return res.json({ received: true });
    }

    const payment = await Payment.findOne({ providerSessionId: sessionId });
    if (!payment || payment.status === "paid") {
      return res.json({ received: true });
    }

    await markReservationPaid(reservationId, String(payment._id));
    res.json({ received: true });
  } catch (error) {
    console.error("PayMongo webhook failed:", error);
    res.status(500).json({ message: "Webhook failed." });
  }
}

function mockEnabled() {
  return process.env.PAYMONGO_MOCK === "true" && process.env.NODE_ENV !== "production";
}

export async function getMockPayment(req: Request, res: Response) {
  try {
    if (!mockEnabled()) return res.status(404).json({ message: "Mock payments are not enabled." });
    const id = requireObjectId(req, res, "id");
    if (!id) return;
    const payment = await Payment.findOne({ _id: id, tenantId: req.auth?.userId }).populate("listingId", "title price");
    if (!payment) return res.status(404).json({ message: "Payment not found." });
    const listing = payment.listingId as { title?: string; price?: number } | null;
    res.json({
      payment: {
        id: payment._id,
        status: payment.status,
        amount: payment.amount,
        title: listing && typeof listing === "object" ? listing.title : "Listing",
      },
    });
  } catch (error) {
    console.error("Failed to load mock payment:", error);
    res.status(500).json({ message: "Failed to load payment." });
  }
}

export async function payMockPayment(req: Request, res: Response) {
  try {
    if (!mockEnabled()) return res.status(404).json({ message: "Mock payments are not enabled." });
    const id = requireObjectId(req, res, "id");
    if (!id) return;
    const payment = await Payment.findOne({ _id: id, tenantId: req.auth?.userId, status: "pending" });
    if (!payment) return res.status(404).json({ message: "This payment is not waiting to be paid." });
    const result = await markReservationPaid(String(payment.reservationId), String(payment._id));
    if (!result.ok) return res.status(409).json({ message: result.message });
    res.json({ message: "Payment confirmed.", status: "paid" });
  } catch (error) {
    console.error("Mock payment failed:", error);
    res.status(500).json({ message: "Failed to confirm payment." });
  }
}

export async function cancelMockPayment(req: Request, res: Response) {
  try {
    if (!mockEnabled()) return res.status(404).json({ message: "Mock payments are not enabled." });
    const id = requireObjectId(req, res, "id");
    if (!id) return;
    const payment = await Payment.findOne({ _id: id, tenantId: req.auth?.userId, status: "pending" });
    if (!payment) return res.status(404).json({ message: "This payment is not waiting to be paid." });
    payment.status = "cancelled";
    await payment.save();
    res.json({ message: "Payment cancelled.", status: "cancelled" });
  } catch (error) {
    console.error("Mock cancel failed:", error);
    res.status(500).json({ message: "Failed to cancel payment." });
  }
}
