import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { Conflict, Unauthorized } from "../utils/httpError.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../services/token.service.js";
import { createApiKey, listApiKeys, revokeApiKey } from "../services/apiKey.service.js";

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
});

authRouter.post("/register", async (req, res) => {
  const { email, password, name } = registerSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw Conflict("Email already registered");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const isFirstUser = (await prisma.user.count()) === 0;

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      role: isFirstUser ? "admin" : "user",
    },
  });

  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = signRefreshToken({ sub: user.id, role: user.role });

  res.status(201).json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    accessToken,
    refreshToken,
  });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw Unauthorized("Invalid email or password");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw Unauthorized("Invalid email or password");
  }

  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = signRefreshToken({ sub: user.id, role: user.role });

  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    accessToken,
    refreshToken,
  });
});

authRouter.post("/logout", requireAuth, (_req, res) => {
  // Stateless JWTs: the client discards both tokens. Nothing to invalidate server-side.
  res.status(204).send();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) {
    throw Unauthorized("User no longer exists");
  }
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

authRouter.post("/refresh", async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw Unauthorized("Invalid or expired refresh token");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw Unauthorized("User no longer exists");
  }

  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const newRefreshToken = signRefreshToken({ sub: user.id, role: user.role });

  res.json({ accessToken, refreshToken: newRefreshToken });
});

const createApiKeySchema = z.object({
  name: z.string().min(1).max(60).default("Default"),
});

authRouter.post("/api-keys", requireAuth, async (req, res) => {
  const { name } = createApiKeySchema.parse(req.body);
  const apiKey = await createApiKey(req.user!.sub, name);
  res.status(201).json(apiKey);
});

authRouter.get("/api-keys", requireAuth, async (req, res) => {
  res.json(await listApiKeys(req.user!.sub));
});

authRouter.delete("/api-keys/:id", requireAuth, async (req, res) => {
  await revokeApiKey(req.user!.sub, req.params.id!);
  res.status(204).send();
});
