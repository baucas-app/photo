import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { notifyUser } from "../services/apns.service.js";
import { notifyUserEmail } from "../services/email.service.js";
import { sendRendition } from "../services/thumbnail.service.js";
import { sendAssetFile } from "../utils/sendAssetFile.js";
import {
  addAlbumMember,
  createShareLink,
  deleteShareLink,
  removeAlbumMember,
  resolvePublicAlbum,
  resolvePublicAsset,
  updateShareLink,
} from "../services/sharing.service.js";

export const sharingRouter = Router();
export const publicSharingRouter = Router();

sharingRouter.use(requireAuth);

const shareSchema = z.object({
  password: z.string().min(4).optional(),
  expiresAt: z.coerce.date().optional(),
});

sharingRouter.post("/albums/:id/share", async (req, res) => {
  const options = shareSchema.parse(req.body);
  const link = await createShareLink(req.user!.sub, req.params.id, options);
  res.status(201).json(link);
});

const updateShareSchema = z.object({
  password: z.string().min(4).optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

sharingRouter.put("/albums/:id/share", async (req, res) => {
  const options = updateShareSchema.parse(req.body);
  const link = await updateShareLink(req.user!.sub, req.params.id, options);
  res.json(link);
});

sharingRouter.delete("/albums/:id/share", async (req, res) => {
  await deleteShareLink(req.user!.sub, req.params.id);
  res.status(204).send();
});

sharingRouter.get("/shared-links", async (req, res) => {
  const links = await prisma.sharedLink.findMany({
    where: { album: { userId: req.user!.sub } },
    include: { album: { select: { id: true, name: true, path: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(links);
});

const memberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["editor", "viewer"]),
});

sharingRouter.post("/albums/:id/members", async (req, res) => {
  const { email, role } = memberSchema.parse(req.body);
  const member = await addAlbumMember(req.user!.sub, req.params.id, email, role);
  // Push notification to the newly invited user
  const album = await prisma.album.findUnique({
    where: { id: req.params.id },
    select: { name: true, userId: true },
  });
  if (album) {
    const inviter = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: { name: true, email: true },
    });
    const inviterName = inviter?.name ?? inviter?.email ?? "Jemand";
    const albumName = album.name;
    notifyUser(
      member.userId,
      "Neues Album geteilt",
      `${inviterName} hat das Album „${albumName}" mit dir geteilt.`
    ).catch(() => {});
    notifyUserEmail(
      member.userId,
      `Album geteilt: ${albumName}`,
      `<p>Hallo,</p><p><b>${inviterName}</b> hat das Album <b>${albumName}</b> mit dir geteilt.</p>`
    ).catch(() => {});
  }
  res.status(201).json(member);
});

sharingRouter.delete("/albums/:id/members/:userId", async (req, res) => {
  await removeAlbumMember(req.user!.sub, req.params.id, req.params.userId);
  res.status(204).send();
});

const publicQuerySchema = z.object({
  password: z.string().optional(),
});

publicSharingRouter.get("/albums/:token", async (req, res) => {
  const { password } = publicQuerySchema.parse(req.query);
  const result = await resolvePublicAlbum(req.params.token, password);
  res.json(result);
});

publicSharingRouter.get("/albums/:token/assets/:assetId/thumbnail", async (req, res) => {
  const { password } = publicQuerySchema.parse(req.query);
  const asset = await resolvePublicAsset(req.params.token, req.params.assetId, password);
  await sendRendition(res, asset, "thumbnail");
});

publicSharingRouter.get("/albums/:token/assets/:assetId/preview", async (req, res) => {
  const { password } = publicQuerySchema.parse(req.query);
  const asset = await resolvePublicAsset(req.params.token, req.params.assetId, password);
  await sendRendition(res, asset, "preview");
});

publicSharingRouter.get("/albums/:token/assets/:assetId/file", async (req, res) => {
  const { password } = publicQuerySchema.parse(req.query);
  const asset = await resolvePublicAsset(req.params.token, req.params.assetId, password);
  sendAssetFile(res, asset);
});
