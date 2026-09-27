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
import { publicSharingRouter, sharingRouter } from "./routes/sharing.routes.js";
import { searchRouter } from "./routes/search.routes.js";
import { statsRouter } from "./routes/stats.routes.js";
import { tagsRouter } from "./routes/tags.routes.js";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

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
app.use("/api", sharingRouter); // /api/albums/:id/share, /api/shared-links, /api/albums/:id/members
app.use("/api/public", publicSharingRouter); // /api/public/albums/:token
app.use("/api/admin", adminRouter);

app.use(notFoundHandler);
app.use(errorHandler);
