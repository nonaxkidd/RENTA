
import { Request, Response } from "express";
import mongoose from "mongoose";
import {
  Reservation,
  ReservationStatus,
  IReservation,
} from "../models/Reservation";
import { Listing } from "../models/Listing";

const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

const ACTIVE_STATUSES = [
  "queued",
  "payment_pending",
] as const satisfies readonly ReservationStatus[];

function actorId(req: Request): string | undefined {
  return req.auth?.userId;
}

// Normalize Express 5 route parameters.
function getRouteParam(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validId(value: string | undefined): value is string {
  return typeof value === "string" && mongoose.isValidObjectId(value);
}

// Expire overdue payment requests.
async function expireOverdueRequests(unitId?: string): Promise<void> {
  const filter = {
  queueStatus: "payment_pending" as const,
  isActive: true,
  paymentDeadlineAt: { $lte: new Date() },
} as mongoose.QueryFilter<IReservation>;

  if (unitId && mongoose.isValidObjectId(unitId)) {
    filter.unitId = new mongoose.Types.ObjectId(unitId);
  }

  await Reservation.updateMany(filter, {
    $set: {
      queueStatus: "expired",
      isActive: false,
      cancellationReason: "The 24-hour test-payment deadline elapsed.",
    },
  });
}

// TENANT: Create reservation.
export async function createReservation(req: Request, res: Response) {
  try {
    const tenantId = actorId(req);
    const listingId = getRouteParam(req.params.listingId);

    const {
      intendedMoveIn,
      occupants,
      expectedLengthOfStay,
      requestedMoveOut,
      notes,
    } = req.body ?? {};

    if (!validId(tenantId) || !validId(listingId)) {
      return res.status(400).json({
        message: "Invalid tenant or listing.",
      });
    }

    const moveIn = new Date(intendedMoveIn);
    const moveOut = requestedMoveOut
      ? new Date(requestedMoveOut)
      : undefined;

    if (
      !intendedMoveIn ||
      Number.isNaN(moveIn.getTime()) ||
      moveIn <= new Date()
    ) {
      return res.status(400).json({
        message: "Choose a valid future move-in date.",
      });
    }

    if (!Number.isInteger(occupants) || occupants < 1) {
      return res.status(400).json({
        message: "Occupants must be a whole number greater than zero.",
      });
    }

    if (
      moveOut &&
      (Number.isNaN(moveOut.getTime()) || moveOut <= moveIn)
    ) {
      return res.status(400).json({
        message: "Move-out date must be after move-in date.",
      });
    }

    if (
      notes !== undefined &&
      (typeof notes !== "string" || notes.length > 1000)
    ) {
      return res.status(400).json({
        message: "Notes must be 1,000 characters or fewer.",
      });
    }

    const listing = await Listing.findById(listingId).select(
      "title capacity available ownerId"
    );

    if (!listing) {
      return res.status(404).json({
        message: "Listing not found.",
      });
    }

    if (!listing.ownerId) {
      return res.status(409).json({
        message: "This listing has no linked owner account.",
      });
    }

    if (listing.available !== true) {
      return res.status(409).json({
        message: "This listing is not currently available.",
      });
    }

    if (occupants > listing.capacity) {
      return res.status(400).json({
        message: `This listing has a maximum capacity of ${listing.capacity}.`,
      });
    }

    await expireOverdueRequests(listingId);

    const reservation = await Reservation.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      unitId: listing._id,
      intendedMoveIn: moveIn,
      occupants,
      expectedLengthOfStay:
        typeof expectedLengthOfStay === "string"
          ? expectedLengthOfStay.trim().slice(0, 100)
          : undefined,
      requestedMoveOut: moveOut,
      notes: typeof notes === "string" ? notes.trim() : undefined,
      serverTimestamp: new Date(),
      queueStatus: "queued",
      isActive: true,
    });

    const earlierCount = await Reservation.countDocuments({
      unitId: listing._id,
      isActive: true,
      serverTimestamp: {
        $lt: reservation.serverTimestamp,
      },
    });

    return res.status(201).json({
      reservation,
      queuePosition: earlierCount + 1,
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return res.status(409).json({
        message:
          "You already have an active reservation request for this listing.",
      });
    }

    console.error("Failed to create reservation:", error);

    return res.status(500).json({
      message: "Failed to submit reservation request.",
    });
  }
}

// TENANT: Get own reservations.
export async function getMyReservations(req: Request, res: Response) {
  try {
    const tenantId = actorId(req);

    if (!validId(tenantId)) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    await expireOverdueRequests();

    const reservations = await Reservation.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
      .populate("unitId", "title type barangay price imageUrl")
      .sort({ serverTimestamp: -1 })
      .lean();

    const withPositions = await Promise.all(
      reservations.map(async (item: any) => {
        if (!item.isActive) {
          return {
            ...item,
            queuePosition: null,
          };
        }

        const itemUnitId = item.unitId?._id ?? item.unitId;

        const ahead = await Reservation.countDocuments({
          unitId: itemUnitId,
          isActive: true,
          serverTimestamp: {
            $lt: item.serverTimestamp,
          },
        });

        return {
          ...item,
          queuePosition: ahead + 1,
        };
      })
    );

    return res.json({
      reservations: withPositions,
    });
  } catch (error: unknown) {
    console.error("Failed to fetch tenant reservations:", error);

    return res.status(500).json({
      message: "Failed to fetch reservations.",
    });
  }
}

// OWNER: Get reservations for owned listings.
export async function getOwnerReservations(req: Request, res: Response) {
  try {
    const ownerId = actorId(req);

    if (!validId(ownerId)) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    await expireOverdueRequests();

    const listings = await Listing.find({
      ownerId: new mongoose.Types.ObjectId(ownerId),
    })
      .select("_id")
      .lean();

    const unitIds: mongoose.Types.ObjectId[] = listings.map(
      (listing) => listing._id as mongoose.Types.ObjectId
    );

    const reservations = await Reservation.find({
      unitId: { $in: unitIds },
    })
      .populate("tenantId", "firstName lastName email")
      .populate("unitId", "title type barangay price capacity")
      .sort({ serverTimestamp: 1 })
      .lean();

    const activePositions = new Map<string, number>();

    const response = reservations.map((item: any) => {
      let queuePosition: number | null = null;

      if (item.isActive) {
        const key = String(item.unitId?._id ?? item.unitId);
        const next = (activePositions.get(key) ?? 0) + 1;

        activePositions.set(key, next);
        queuePosition = next;
      }

      return {
        ...item,
        queuePosition,
      };
    });

    return res.json({
      reservations: response,
    });
  } catch (error: unknown) {
    console.error("Failed to fetch owner reservations:", error);

    return res.status(500).json({
      message: "Failed to fetch reservation requests.",
    });
  }
}

// OWNER: Approve or reject reservation.
export async function decideReservation(req: Request, res: Response) {
  try {
    const ownerId = actorId(req);
    const id = getRouteParam(req.params.id);

    const { decision, responseNote } = req.body ?? {};

    if (!validId(ownerId)) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    if (!validId(id)) {
      return res.status(400).json({
        message: "Invalid reservation id.",
      });
    }

    if (decision !== "approve" && decision !== "reject") {
      return res.status(400).json({
        message: "Decision must be approve or reject.",
      });
    }

    if (
      responseNote !== undefined &&
      (typeof responseNote !== "string" || responseNote.length > 1000)
    ) {
      return res.status(400).json({
        message: "Response must be 1,000 characters or fewer.",
      });
    }

    let reservation = await Reservation.findById(id);

    if (!reservation) {
      return res.status(404).json({
        message: "Reservation request not found.",
      });
    }

    const listing = await Listing.findOne({
      _id: reservation.unitId,
      ownerId: new mongoose.Types.ObjectId(ownerId),
    }).select("_id available");

    if (!listing) {
      return res.status(403).json({
        message: "You do not own this listing.",
      });
    }

    await expireOverdueRequests(String(reservation.unitId));

    const refreshedReservation = await Reservation.findById(id);

    if (!refreshedReservation) {
      return res.status(404).json({
        message: "Reservation request not found.",
      });
    }

    reservation = refreshedReservation;

    if (!reservation.isActive || reservation.queueStatus !== "queued") {
      return res.status(409).json({
        message: "This request is no longer awaiting an owner decision.",
      });
    }

    const earliest = await Reservation.findOne({
      unitId: reservation.unitId,
      isActive: true,
      queueStatus: {
        $in: [...ACTIVE_STATUSES],
      },
    }).sort({
      serverTimestamp: 1,
      _id: 1,
    });

    if (
      !earliest ||
      String(earliest._id) !== String(reservation._id)
    ) {
      return res.status(409).json({
        message:
          "FIFO rule: review the earliest active request for this listing first.",
      });
    }

    const now = new Date();

    reservation.ownerDecision =
      decision === "approve" ? "approved" : "rejected";

    reservation.ownerDecisionAt = now;

    reservation.ownerResponse =
      typeof responseNote === "string"
        ? responseNote.trim()
        : undefined;

    if (decision === "approve") {
      if (listing.available !== true) {
        reservation.queueStatus = "conflict";
        reservation.isActive = false;

        reservation.cancellationReason =
          "Listing was no longer available when the owner reviewed the request.";
      } else {
        reservation.queueStatus = "payment_pending";

        reservation.paymentDeadlineAt = new Date(
          now.getTime() + PAYMENT_WINDOW_MS
        );
      }
    } else {
      reservation.queueStatus = "rejected";
      reservation.isActive = false;
    }

    await reservation.save();

    return res.json({
      message:
        decision === "approve"
          ? "Request approved. The 24-hour test-payment window has started; payment checkout is not connected yet."
          : "Request rejected. The next request in the FIFO queue may now be reviewed.",
      reservation,
    });
  } catch (error: unknown) {
    console.error("Failed to decide reservation:", error);

    return res.status(500).json({
      message: "Failed to save reservation decision.",
    });
  }
}

// TENANT: Cancel reservation.
export async function cancelReservation(req: Request, res: Response) {
  try {
    const tenantId = actorId(req);
    const id = getRouteParam(req.params.id);

    if (!validId(tenantId)) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    if (!validId(id)) {
      return res.status(400).json({
        message: "Invalid reservation id.",
      });
    }

    const reservation = await Reservation.findOne({
      _id: id,
      tenantId: new mongoose.Types.ObjectId(tenantId),
    });

    if (!reservation) {
      return res.status(404).json({
        message: "Reservation request not found.",
      });
    }

    if (
      !reservation.isActive ||
      !ACTIVE_STATUSES.some(
        (status) => status === reservation.queueStatus
      )
    ) {
      return res.status(409).json({
        message: "This reservation can no longer be cancelled.",
      });
    }

    reservation.queueStatus = "cancelled";
    reservation.isActive = false;
    reservation.cancellationReason = "Cancelled by tenant.";

    await reservation.save();

    return res.json({
      message: "Reservation request cancelled.",
      reservation,
    });
  } catch (error: unknown) {
    console.error("Failed to cancel reservation:", error);

    return res.status(500).json({
      message: "Failed to cancel reservation.",
    });
  }
}
