import crypto from "node:crypto";
import { prisma } from "../db/prisma.js";
import { NotFound } from "../utils/httpError.js";

const KEY_PREFIX = "photos_";

function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export async function createApiKey(userId: string, name: string) {
  const rawKey = `${KEY_PREFIX}${crypto.randomBytes(24).toString("base64url")}`;

  const apiKey = await prisma.apiKey.create({
    data: { userId, name, keyHash: hashKey(rawKey) },
  });

  // The raw key is only ever available here - only its hash is persisted.
  return { id: apiKey.id, name: apiKey.name, createdAt: apiKey.createdAt, key: rawKey };
}

export function listApiKeys(userId: string) {
  return prisma.apiKey.findMany({
    where: { userId },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeApiKey(userId: string, id: string): Promise<void> {
  const key = await prisma.apiKey.findFirst({ where: { id, userId } });
  if (!key) throw NotFound("API key not found");
  await prisma.apiKey.delete({ where: { id } });
}

export async function resolveUserFromApiKey(rawKey: string) {
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hashKey(rawKey) },
    include: { user: true },
  });
  if (!apiKey) return null;

  // Best-effort: an image being loaded shouldn't fail because this write raced or failed.
  prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return apiKey.user;
}
