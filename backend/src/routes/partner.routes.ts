import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { notifyUser } from "../services/apns.service.js";
import { notifyUserEmail } from "../services/email.service.js";
import { BadRequest, Forbidden, NotFound } from "../utils/httpError.js";

export const partnerRouter = Router();
partnerRouter.use(requireAuth);

// GET /partner – returns the current user's incoming + outgoing library shares
partnerRouter.get("/", async (req, res) => {
  const userId = req.user!.sub;
  const [sent, received] = await Promise.all([
    prisma.libraryShare.findMany({
      where: { fromUserId: userId },
      include: { toUser: { select: { id: true, name: true, email: true } } },
    }),
    prisma.libraryShare.findMany({
      where: { toUserId: userId },
      include: { fromUser: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  res.json({ sent, received });
});

const inviteSchema = z.object({ email: z.string().email() });

// POST /partner/invite – send a library-share invitation to another user by e-mail
partnerRouter.post("/invite", async (req, res) => {
  const { email } = inviteSchema.parse(req.body);
  const userId = req.user!.sub;

  const target = await prisma.user.findUnique({ where: { email } });
  if (!target) throw NotFound("No account with that e-mail address");
  if (target.id === userId) throw BadRequest("Cannot share with yourself");

  const existing = await prisma.libraryShare.findFirst({
    where: {
      OR: [
        { fromUserId: userId, toUserId: target.id },
        { fromUserId: target.id, toUserId: userId },
      ],
    },
  });
  if (existing) throw BadRequest("A library share with this user already exists");

  const share = await prisma.libraryShare.create({
    data: { fromUserId: userId, toUserId: target.id },
    include: { toUser: { select: { id: true, name: true, email: true } } },
  });
  const inviter = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  const inviterName = inviter?.name ?? inviter?.email ?? "Jemand";
  notifyUser(
    target.id,
    "Partner-Bibliothek-Einladung",
    `${inviterName} möchte seine Bibliothek mit dir teilen.`
  ).catch(() => {});
  notifyUserEmail(
    target.id,
    "Einladung zur Partner-Bibliothek",
    `<p>Hallo,</p><p><b>${inviterName}</b> möchte seine Foto-Bibliothek mit dir teilen.<br>Öffne die Photos-App und gehe zu <b>Partner</b>, um die Einladung anzunehmen.</p>`
  ).catch(() => {});
  res.status(201).json(share);
});

// POST /partner/accept – accept a pending invitation (called by the toUser)
partnerRouter.post("/accept", async (req, res) => {
  const userId = req.user!.sub;
  const share = await prisma.libraryShare.findFirst({
    where: { toUserId: userId, status: "pending" },
  });
  if (!share) throw NotFound("No pending invitation found");

  const updated = await prisma.libraryShare.update({
    where: { id: share.id },
    data: { status: "accepted" },
    include: { fromUser: { select: { id: true, name: true, email: true } } },
  });
  res.json(updated);
});

// DELETE /partner/:shareId – remove a library share (either side may do this)
partnerRouter.delete("/:shareId", async (req, res) => {
  const userId = req.user!.sub;
  const share = await prisma.libraryShare.findUnique({ where: { id: req.params.shareId } });
  if (!share) throw NotFound("Share not found");
  if (share.fromUserId !== userId && share.toUserId !== userId) {
    throw Forbidden("Not your library share");
  }
  await prisma.libraryShare.delete({ where: { id: req.params.shareId } });
  res.status(204).send();
});

// GET /partner/assets – returns the partner's assets (only when accepted)
partnerRouter.get("/assets", async (req, res) => {
  const userId = req.user!.sub;

  // Find accepted shares where this user is either side
  const shares = await prisma.libraryShare.findMany({
    where: {
      status: "accepted",
      OR: [{ fromUserId: userId }, { toUserId: userId }],
    },
  });

  if (shares.length === 0) {
    return res.json({ assets: [] });
  }

  // Collect partner user IDs (the other side of each share)
  const partnerIds = shares.map((s) => (s.fromUserId === userId ? s.toUserId : s.fromUserId));

  const assets = await prisma.asset.findMany({
    where: {
      userId: { in: partnerIds },
      deletedAt: null,
      isArchived: false,
      stackParentId: null,
      isLivePhotoMotion: false,
    },
    select: {
      id: true, filename: true, mimeType: true, width: true, height: true,
      takenAt: true, uploadedAt: true, latitude: true, longitude: true,
      isFavorite: true, isArchived: true, duration: true, is360: true,
      livePhotoVideoId: true, userId: true,
      cameraMake: true, cameraModel: true, _count: { select: { stackChildren: true } },
    },
    orderBy: [{ takenAt: "desc" }, { uploadedAt: "desc" }, { id: "desc" }],
    take: 200,
  });

  res.json({ assets });
});
