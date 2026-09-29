import { Router } from "express";
import { z } from "zod";
import { prisma } from "@photos/database";
import { requireAuth } from "../middleware/auth.js";
import { apnsConfigured } from "../services/apns.service.js";

export const pushRouter = Router();
pushRouter.use(requireAuth);

const registerSchema = z.object({
  token: z.string().min(10),
  platform: z.string().default("ios"),
});

// iOS app calls this after APNs registration to store the device token.
pushRouter.post("/register", async (req, res) => {
  const { token, platform } = registerSchema.parse(req.body);
  await prisma.devicePushToken.upsert({
    where: { token },
    update: { userId: req.user!.sub, platform, updatedAt: new Date() },
    create: { id: crypto.randomUUID(), userId: req.user!.sub, token, platform },
  });
  res.json({ ok: true, apnsConfigured: apnsConfigured() });
});

// Called on logout or when the user disables notifications.
pushRouter.delete("/register", async (req, res) => {
  const { token } = z.object({ token: z.string() }).parse(req.body);
  await prisma.devicePushToken.deleteMany({
    where: { token, userId: req.user!.sub },
  });
  res.json({ ok: true });
});
