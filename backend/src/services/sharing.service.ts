import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { BadRequest, Conflict, NotFound, Unauthorized } from "../utils/httpError.js";

function generateToken(): string {
  return crypto.randomBytes(16).toString("base64url");
}

export async function createShareLink(
  userId: string,
  albumId: string,
  options: { password?: string; expiresAt?: Date },
) {
  const album = await prisma.album.findFirst({ where: { id: albumId, userId } });
  if (!album) throw NotFound("Album not found");

  const existing = await prisma.sharedLink.findUnique({ where: { albumId } });
  if (existing) throw Conflict("Album is already shared - use PUT to change it");

  const passwordHash = options.password ? await bcrypt.hash(options.password, 12) : null;

  return prisma.sharedLink.create({
    data: {
      albumId,
      token: generateToken(),
      passwordHash,
      expiresAt: options.expiresAt,
      createdBy: userId,
    },
  });
}

export async function updateShareLink(
  userId: string,
  albumId: string,
  options: { password?: string; expiresAt?: Date | null },
) {
  const album = await prisma.album.findFirst({ where: { id: albumId, userId } });
  if (!album) throw NotFound("Album not found");

  const existing = await prisma.sharedLink.findUnique({ where: { albumId } });
  if (!existing) throw NotFound("Album is not shared yet");

  const passwordHash =
    options.password !== undefined ? await bcrypt.hash(options.password, 12) : undefined;

  return prisma.sharedLink.update({
    where: { albumId },
    data: { passwordHash, expiresAt: options.expiresAt },
  });
}

export async function deleteShareLink(userId: string, albumId: string): Promise<void> {
  const album = await prisma.album.findFirst({ where: { id: albumId, userId } });
  if (!album) throw NotFound("Album not found");

  await prisma.sharedLink.deleteMany({ where: { albumId } });
}

async function loadValidSharedLink(token: string, password?: string) {
  const link = await prisma.sharedLink.findUnique({
    where: { token },
    include: { album: { include: { albumAssets: { include: { asset: true } } } } },
  });
  if (!link) throw NotFound("Link not found");

  if (link.expiresAt && link.expiresAt < new Date()) {
    throw NotFound("Link has expired");
  }

  if (link.passwordHash) {
    if (!password) throw Unauthorized("Password required");
    const valid = await bcrypt.compare(password, link.passwordHash);
    if (!valid) throw Unauthorized("Incorrect password");
  }

  return link;
}

/**
 * The fields an anonymous visitor of a public share link may see. The full
 * Asset row (used internally by resolvePublicAsset for file serving) also
 * carries the server filesystem path and the owner's internal user id -
 * neither belongs in a response anyone with the link can read.
 */
function toPublicAsset(asset: {
  id: string;
  filename: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  takenAt: Date | null;
  is360: boolean;
  isLivePhotoMotion: boolean;
  livePhotoVideoId: string | null;
}) {
  return {
    id: asset.id,
    filename: asset.filename,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    duration: asset.duration,
    takenAt: asset.takenAt,
    is360: asset.is360,
    isLivePhotoMotion: asset.isLivePhotoMotion,
    livePhotoVideoId: asset.livePhotoVideoId,
  };
}

export async function resolvePublicAlbum(token: string, password?: string) {
  const link = await loadValidSharedLink(token, password);

  return {
    album: {
      id: link.album.id,
      name: link.album.name,
      description: link.album.description,
    },
    assets: link.album.albumAssets.map((entry) => toPublicAsset(entry.asset)),
  };
}

export async function resolvePublicAsset(token: string, assetId: string, password?: string) {
  const link = await loadValidSharedLink(token, password);

  const entry = link.album.albumAssets.find((a) => a.assetId === assetId);
  if (!entry) throw NotFound("Asset not found in this shared album");

  return entry.asset;
}

export async function addAlbumMember(
  ownerId: string,
  albumId: string,
  memberEmail: string,
  role: "editor" | "viewer",
) {
  const album = await prisma.album.findFirst({ where: { id: albumId, userId: ownerId } });
  if (!album) throw NotFound("Album not found");

  const member = await prisma.user.findUnique({ where: { email: memberEmail } });
  if (!member) throw NotFound("No user with this email");
  if (member.id === ownerId) throw BadRequest("Owner already has full access");

  return prisma.sharedMember.upsert({
    where: { albumId_userId: { albumId, userId: member.id } },
    create: { albumId, userId: member.id, role },
    update: { role },
  });
}

export async function removeAlbumMember(ownerId: string, albumId: string, memberUserId: string): Promise<void> {
  const album = await prisma.album.findFirst({ where: { id: albumId, userId: ownerId } });
  if (!album) throw NotFound("Album not found");

  await prisma.sharedMember.deleteMany({ where: { albumId, userId: memberUserId } });
}
