import "express-async-errors";
import cors from "cors";
import express from "express";
import helmet from "helmet";
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
