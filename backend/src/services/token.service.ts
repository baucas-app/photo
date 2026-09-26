import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AccessTokenPayload {
  sub: string;
  role: "user" | "admin";
}

// jsonwebtoken types `expiresIn` as a template-literal union (e.g. "15m"),
// not a general string - our values come from an env var, so we assert the
// shape rather than widen the whole env module to a jsonwebtoken-specific type.
const accessTokenExpiry = env.jwtExpiresIn as SignOptions["expiresIn"];
const refreshTokenExpiry = env.jwtRefreshExpiresIn as SignOptions["expiresIn"];

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: accessTokenExpiry });
}

export function signRefreshToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: refreshTokenExpiry });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtRefreshSecret) as AccessTokenPayload;
}
