import { register, collectDefaultMetrics, Counter, Gauge, Histogram } from "prom-client";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";

// Collect Node.js process metrics (memory, event loop lag, etc.)
collectDefaultMetrics({ register });

// ── App-level gauges (refreshed on each /metrics scrape) ────────────────────

const usersTotal = new Gauge({
  name: "photos_users_total",
  help: "Total number of registered users",
  registers: [register],
});

const assetsTotal = new Gauge({
  name: "photos_assets_total",
  help: "Total number of assets (excluding trash)",
  registers: [register],
});

const storageBytesTotal = new Gauge({
  name: "photos_storage_bytes_total",
  help: "Total storage used by assets in bytes",
  registers: [register],
});

const albumsTotal = new Gauge({
  name: "photos_albums_total",
  help: "Total number of albums",
  registers: [register],
});

// ── HTTP request metrics ─────────────────────────────────────────────────────

export const httpRequestsTotal = new Counter({
  name: "photos_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"] as const,
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: "photos_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

// ── Express middleware ───────────────────────────────────────────────────────

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on("finish", () => {
    const route = (req.route?.path as string | undefined) ?? req.path;
    const label = `${req.baseUrl ?? ""}${route}`;
    const duration = (Date.now() - start) / 1000;
    httpRequestsTotal.inc({ method: req.method, route: label, status: String(res.statusCode) });
    httpRequestDuration.observe({ method: req.method, route: label }, duration);
  });
  next();
}

// ── Scrape handler ───────────────────────────────────────────────────────────

export async function metricsHandler(_req: Request, res: Response) {
  // Refresh app-level gauges on every scrape (cheap DB calls).
  const [users, assets, storage, albums] = await Promise.all([
    prisma.user.count(),
    prisma.asset.count({ where: { deletedAt: null } }),
    prisma.asset.aggregate({ where: { deletedAt: null }, _sum: { size: true } }),
    prisma.album.count(),
  ]);
  usersTotal.set(users);
  assetsTotal.set(assets);
  storageBytesTotal.set(storage._sum.size ?? 0);
  albumsTotal.set(albums);

  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
}
