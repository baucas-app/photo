import type { NextFunction, Request, Response } from "express";
import { Unauthorized, Forbidden } from "../utils/httpError.js";
import { verifyAccessToken, type AccessTokenPayload } from "../services/token.service.js";
import { resolveUserFromApiKey } from "../services/apiKey.service.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

function extractApiKey(req: Request): string | undefined {
  const header = req.headers["x-api-key"];
  if (typeof header === "string") return header;
  const query = req.query.apiKey;
  if (typeof query === "string") return query;
  return undefined;
}

/**
 * Accepts either a short-lived JWT bearer token (used by the web/iOS app for
 * normal API calls) or a long-lived API key via header/query param. The
 * latter exists specifically so plain URLs - <img src>, an external tool,
 * a calendar/photo-frame integration - can authenticate without setting
 * headers themselves.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      req.user = verifyAccessToken(authHeader.slice("Bearer ".length));
      next();
      return;
    } catch {
      throw Unauthorized("Invalid or expired token");
    }
  }

  const apiKey = extractApiKey(req);
  if (apiKey) {
    const user = await resolveUserFromApiKey(apiKey);
    if (!user) throw Unauthorized("Invalid API key");
    req.user = { sub: user.id, role: user.role };
    next();
    return;
  }

  throw Unauthorized("Missing bearer token or API key");
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== "admin") {
    throw Forbidden("Admin access required");
  }
  next();
}
