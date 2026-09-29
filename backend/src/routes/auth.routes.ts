import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { BadRequest, Conflict, Unauthorized } from "../utils/httpError.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../services/token.service.js";
import { createApiKey, listApiKeys, revokeApiKey } from "../services/apiKey.service.js";
import {
  verifyGoogleIdToken,
  verifyAppleIdToken,
  upsertOAuthUser,
} from "../services/oauth.service.js";

export const authRouter = Router();

// Brute-force protection: 10 attempts per 15 minutes per IP on login/register.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later." },
});
authRouter.post("/login", authLimiter);
authRouter.post("/register", authLimiter);
authRouter.post("/refresh", rateLimit({ windowMs: 60 * 1000, max: 30 }));

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

  if (!user.passwordHash) {
    // OAuth-only account – no password set
    throw Unauthorized("This account uses social login. Please sign in with the connected provider.");
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

const updateMeSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  email: z.string().email().optional(),
});

authRouter.put("/me", requireAuth, async (req, res) => {
  const data = updateMeSchema.parse(req.body);
  if (data.email) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing && existing.id !== req.user!.sub) {
      throw BadRequest("E-Mail-Adresse bereits vergeben");
    }
  }
  const user = await prisma.user.update({ where: { id: req.user!.sub }, data });
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

// ─── OAuth – Google (Authorization Code Flow) ─────────────────────────────

function googleOAuthEnabled() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function makeTokenPair(user: { id: string; role: string }) {
  const role = user.role as "user" | "admin";
  return {
    accessToken: signAccessToken({ sub: user.id, role }),
    refreshToken: signRefreshToken({ sub: user.id, role }),
  };
}

/** Redirects the browser (or ASWebAuthenticationSession) to Google's consent page. */
authRouter.get("/oauth/google", (req, res) => {
  if (!googleOAuthEnabled()) {
    return res.status(503).json({ error: "Google OAuth not configured" });
  }

  const platform = req.query.platform === "ios" ? "ios" : "web";
  // Anti-CSRF state: random hex + platform, signed via HMAC so the callback
  // can verify it without a server-side session/store.
  const nonce = crypto.randomBytes(16).toString("hex");
  const statePayload = Buffer.from(JSON.stringify({ nonce, platform })).toString("base64url");
  const hmac = crypto
    .createHmac("sha256", process.env.JWT_SECRET ?? "state-secret")
    .update(statePayload)
    .digest("hex");
  const state = `${statePayload}.${hmac}`;

  const backendBase = process.env.OAUTH_REDIRECT_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${backendBase}/api/auth/oauth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

/** Handles Google's callback: exchanges the code, upserts the user, redirects with tokens. */
authRouter.get("/oauth/google/callback", async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";

  if (oauthError || !code || !state || typeof state !== "string") {
    return res.redirect(`${frontendUrl}/oauth/callback?error=cancelled`);
  }

  // Verify HMAC state
  const [statePayload, hmac] = state.split(".");
  const expectedHmac = crypto
    .createHmac("sha256", process.env.JWT_SECRET ?? "state-secret")
    .update(statePayload ?? "")
    .digest("hex");
  if (!statePayload || !hmac || !crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
    return res.redirect(`${frontendUrl}/oauth/callback?error=invalid_state`);
  }

  const { platform } = JSON.parse(Buffer.from(statePayload, "base64url").toString()) as {
    nonce: string;
    platform: "web" | "ios";
  };

  // Exchange code for ID token
  const backendBase = process.env.OAUTH_REDIRECT_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: code as string,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${backendBase}/api/auth/oauth/google/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return res.redirect(`${frontendUrl}/oauth/callback?error=token_exchange_failed`);
  }

  const tokenData = (await tokenRes.json()) as { id_token?: string };
  if (!tokenData.id_token) {
    return res.redirect(`${frontendUrl}/oauth/callback?error=no_id_token`);
  }

  const identity = await verifyGoogleIdToken(tokenData.id_token);
  const user = await upsertOAuthUser(identity);
  const { accessToken, refreshToken } = makeTokenPair(user);

  if (platform === "ios") {
    // Deep-link back into the iOS app
    return res.redirect(
      `photosapp://oauth/callback?accessToken=${encodeURIComponent(accessToken)}&refreshToken=${encodeURIComponent(refreshToken)}&userId=${user.id}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name ?? "")}`,
    );
  }

  return res.redirect(
    `${frontendUrl}/oauth/callback?accessToken=${encodeURIComponent(accessToken)}&refreshToken=${encodeURIComponent(refreshToken)}&userId=${user.id}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name ?? "")}`,
  );
});

/** Returns whether Google OAuth is configured (for frontend to decide whether to show the button). */
authRouter.get("/oauth/providers", (_req, res) => {
  res.json({
    google: googleOAuthEnabled(),
    apple: !!(process.env.APPLE_CLIENT_ID),
  });
});

// ─── OAuth – Apple (Identity Token POST, iOS-native flow) ─────────────────

const appleTokenSchema = z.object({
  identityToken: z.string().min(1),
  email: z.string().email().optional(),
  name: z.string().optional(),
});

/** Verifies an Apple Sign-In identity token sent by the iOS app. */
authRouter.post("/oauth/apple/token", async (req, res) => {
  const appleClientId = process.env.APPLE_CLIENT_ID;
  if (!appleClientId) {
    throw BadRequest("Apple Sign In not configured");
  }

  const { identityToken, email, name } = appleTokenSchema.parse(req.body);

  const identity = await verifyAppleIdToken(identityToken, appleClientId);
  // Apple only sends email on the very first sign-in; use the form value as fallback.
  if (!identity.email && email) identity.email = email;
  if (!identity.name && name) identity.name = name;

  if (!identity.email) throw BadRequest("No email available from Apple token");

  const user = await upsertOAuthUser(identity);
  const { accessToken, refreshToken } = makeTokenPair(user);

  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    accessToken,
    refreshToken,
  });
});
