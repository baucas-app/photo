import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { NotFound, BadRequest } from "../utils/httpError.js";
import { recalculateTrips } from "../services/trip.service.js";

export const tripsRouter = Router();
tripsRouter.use(requireAuth);

// ─── List ──────────────────────────────────────────────────────────────────

tripsRouter.get("/", async (req, res) => {
  const trips = await prisma.trip.findMany({
    where: { userId: req.user!.sub },
    orderBy: { startDate: "desc" },
    include: {
      coverAsset: { select: { id: true, mimeType: true } },
      _count: { select: { assets: true } },
    },
  });
  res.json(trips);
});

// ─── Recalculate (trigger clustering) ─────────────────────────────────────

tripsRouter.post("/recalculate", async (req, res) => {
  const count = await recalculateTrips(req.user!.sub);
  res.json({ trips: count });
});

// ─── Single trip ────────────────────────────────────────────────────────────

tripsRouter.get("/:id", async (req, res) => {
  const trip = await prisma.trip.findFirst({
    where: { id: req.params.id, userId: req.user!.sub },
    include: {
      coverAsset: { select: { id: true, mimeType: true } },
      _count: { select: { assets: true } },
    },
  });
  if (!trip) throw NotFound("Trip not found");

  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const take = 60;

  const tripAssets = await prisma.tripAsset.findMany({
    where: { tripId: trip.id },
    ...(cursor ? { cursor: { tripId_assetId: { tripId: trip.id, assetId: cursor } }, skip: 1 } : {}),
    take,
    orderBy: { asset: { takenAt: "desc" } },
    include: { asset: true },
  });

  const assets = tripAssets.map((ta) => ta.asset);
  const lastTripAsset = tripAssets[tripAssets.length - 1];
  const nextCursor = tripAssets.length === take && lastTripAsset ? lastTripAsset.assetId : null;

  res.json({ trip, assets, nextCursor });
});

// ─── Update name / cover ───────────────────────────────────────────────────

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  coverAssetId: z.string().uuid().optional(),
});

tripsRouter.patch("/:id", async (req, res) => {
  const trip = await prisma.trip.findFirst({
    where: { id: req.params.id, userId: req.user!.sub },
  });
  if (!trip) throw NotFound("Trip not found");

  const data = patchSchema.parse(req.body);
  const updated = await prisma.trip.update({ where: { id: trip.id }, data });
  res.json(updated);
});

// ─── Delete ────────────────────────────────────────────────────────────────

tripsRouter.delete("/:id", async (req, res) => {
  const trip = await prisma.trip.findFirst({
    where: { id: req.params.id, userId: req.user!.sub },
  });
  if (!trip) throw NotFound("Trip not found");
  await prisma.trip.delete({ where: { id: trip.id } });
  res.status(204).send();
});

// ─── Dawarich GPS-Track proxy ──────────────────────────────────────────────
// Returns the Dawarich track for the trip's time window so the frontend can
// render the route on a map without exposing the Dawarich API key to the
// browser (kept server-side in env vars only).

const dawarichQuerySchema = z.object({
  tripId: z.string().uuid(),
});

tripsRouter.get("/dawarich/track", async (req, res) => {
  const { tripId } = dawarichQuerySchema.parse(req.query);
  const dawarichUrl = process.env.DAWARICH_URL;
  const dawarichKey = process.env.DAWARICH_API_KEY;

  if (!dawarichUrl || !dawarichKey) {
    return res.status(503).json({ error: "Dawarich not configured" });
  }

  const trip = await prisma.trip.findFirst({
    where: { id: tripId, userId: req.user!.sub },
  });
  if (!trip) throw NotFound("Trip not found");

  const startAt = trip.startDate.toISOString();
  const endAt = trip.endDate.toISOString();

  const url = `${dawarichUrl.replace(/\/$/, "")}/api/v1/points?start_at=${encodeURIComponent(startAt)}&end_at=${encodeURIComponent(endAt)}&slim=true`;

  const upstream = await fetch(url, {
    headers: { "X-Api-Key": dawarichKey },
  });

  if (!upstream.ok) {
    return res.status(upstream.status).json({ error: "Dawarich request failed" });
  }

  const data = await upstream.json();
  res.json(data);
});
