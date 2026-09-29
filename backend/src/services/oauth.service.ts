import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "../db/prisma.js";

const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_ISSUER = "https://appleid.apple.com";
const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

let appleJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
function getAppleJWKS() {
  if (!appleJWKS) appleJWKS = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
  return appleJWKS;
}

export interface OAuthIdentity {
  provider: "google" | "apple";
  providerId: string;
  email: string;
  name?: string;
}

/** Verifies a Google ID token via Google's tokeninfo endpoint. */
export async function verifyGoogleIdToken(idToken: string): Promise<OAuthIdentity> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID not configured");

  const url = `${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Google token verification failed");

  const payload = (await res.json()) as Record<string, string>;
  if (payload.aud !== clientId) throw new Error("Google token audience mismatch");
  if (!payload.sub || !payload.email) throw new Error("Missing sub/email in Google token");

  return {
    provider: "google",
    providerId: payload.sub,
    email: payload.email,
    name: payload.name,
  };
}

/** Verifies an Apple identity token (JWT signed with Apple's private key). */
export async function verifyAppleIdToken(
  identityToken: string,
  clientId: string,
): Promise<OAuthIdentity> {
  const { payload } = await jwtVerify(identityToken, getAppleJWKS(), {
    issuer: APPLE_ISSUER,
    audience: clientId,
  });

  if (!payload.sub || typeof payload.sub !== "string")
    throw new Error("Missing sub in Apple token");

  return {
    provider: "apple",
    providerId: payload.sub,
    email: typeof payload.email === "string" ? payload.email : "",
    name: undefined,
  };
}

/** Finds or creates a user for the given OAuth identity, returns the user. */
export async function upsertOAuthUser(identity: OAuthIdentity) {
  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerId: { provider: identity.provider, providerId: identity.providerId } },
    include: { user: true },
  });

  if (existing) return existing.user;

  // Check if a user with this email already exists – link to them rather than
  // creating a duplicate account.
  let user = identity.email
    ? await prisma.user.findUnique({ where: { email: identity.email } })
    : null;

  if (!user) {
    const isFirstUser = (await prisma.user.count()) === 0;
    user = await prisma.user.create({
      data: {
        email: identity.email,
        name: identity.name ?? null,
        role: isFirstUser ? "admin" : "user",
      },
    });
  }

  await prisma.oAuthAccount.create({
    data: { userId: user.id, provider: identity.provider, providerId: identity.providerId },
  });

  return user;
}
