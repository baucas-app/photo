import "express-async-errors";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { prisma } from "./db/prisma.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { adminRouter } from "./routes/admin.routes.js";
import { albumsRouter } from "./routes/albums.routes.js";
import { assetsRouter } from "./routes/assets.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { facesRouter } from "./routes/faces.routes.js";
import { partnerRouter } from "./routes/partner.routes.js";
import { pushRouter } from "./routes/push.routes.js";
import { smartAlbumsRouter } from "./routes/smart-albums.routes.js";
import { tagGroupsRouter } from "./routes/tag-groups.routes.js";
import { publicSharingRouter, sharingRouter } from "./routes/sharing.routes.js";
import { searchRouter } from "./routes/search.routes.js";
import { statsRouter } from "./routes/stats.routes.js";
import { tagsRouter } from "./routes/tags.routes.js";
import { userLabelsRouter } from "./routes/user-labels.routes.js";
import { tripsRouter } from "./routes/trips.routes.js";
import { dawarichCompatRouter } from "./routes/dawarich-compat.routes.js";
import { metricsHandler, metricsMiddleware } from "./services/metrics.service.js";

export const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());
app.use(metricsMiddleware);

app.get("/health", (_req, res) => res.json({ status: "ok" }));
// Prometheus metrics — no auth so Prometheus can scrape without a token.
// Restrict access at the network level (firewall/nginx) in production.
app.get("/metrics", metricsHandler);

// Same check, but reachable through the /api prefix nginx actually proxies
// in production (the bare /health above only exists for the container's own
// Docker healthcheck) - this is what Settings' "Server-Status" pings.
app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "ok" });
  } catch {
    res.status(503).json({ status: "ok", database: "unreachable" });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/assets", assetsRouter);
app.use("/api/albums", albumsRouter);
app.use("/api/search", searchRouter);
app.use("/api/stats", statsRouter);
app.use("/api/tags", tagsRouter);
app.use("/api/faces", facesRouter);
// The public router MUST be mounted before sharingRouter: sharingRouter is
// mounted at the bare "/api" prefix with a router-level requireAuth, so it
// would otherwise reject every unauthenticated /api/public/* request with 401.
app.use("/api/public", publicSharingRouter); // /api/public/albums/:token
app.use("/api", sharingRouter); // /api/albums/:id/share, /api/shared-links, /api/albums/:id/members
app.use("/api/partner", partnerRouter);
app.use("/api/push", pushRouter);
app.use("/api/smart-albums", smartAlbumsRouter);
app.use("/api/tag-groups", tagGroupsRouter);
app.use("/api/user-labels", userLabelsRouter);
app.use("/api/trips", tripsRouter);
app.use("/api/admin", adminRouter);

// Dawarich integration: mounted at /compat/api/* to avoid colliding with
// Photos' own /api/assets/* routes. Configure Dawarich with:
//   URL:     http://<photos-host>:3001/compat
//   API key: any Photos API key
app.use("/compat/api", dawarichCompatRouter);

app.use(notFoundHandler);
app.use(errorHandler);
