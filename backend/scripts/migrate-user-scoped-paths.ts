/**
 * One-time data migration for the user-scoped storage paths fix (see
 * docs/TODO.md, 2026-09-27): album/asset paths used to be
 * `/<name>` / `/<year>/<month>`, shared across every user on the server, so
 * two users with the same album name (or the same year folder) collided on
 * one physical directory. Paths are now `/<userId>/...`.
 *
 * This moves every existing asset's file on disk into its new
 * user-prefixed location and rewrites `assets.path` / `albums.path` to
 * match. Idempotent: a row already starting with `/<its userId>/` is left
 * alone, so running this twice (or on a partially-migrated DB) is safe.
 *
 * Run once per environment after deploying the path-scoping code change:
 *   cd backend && npx tsx scripts/migrate-user-scoped-paths.ts
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "../src/db/prisma.js";
import { toAbsolutePath, ensureDir } from "../src/services/filesystem.service.js";

async function moveFile(oldRelative: string, newRelative: string): Promise<void> {
  const oldAbsolute = toAbsolutePath(oldRelative);
  const newAbsolute = toAbsolutePath(newRelative);
  await ensureDir(path.posix.dirname(newRelative));
  try {
    await fs.rename(oldAbsolute, newAbsolute);
  } catch (error) {
    // Old file already gone (e.g. re-run after a partial previous run
    // already moved it) - nothing left to move, the DB row update below
    // still needs to happen.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  let movedAssets = 0;
  let movedAlbums = 0;
  let skipped = 0;

  for (const user of users) {
    const prefix = `/${user.id}`;

    const albums = await prisma.album.findMany({ where: { userId: user.id } });
    for (const album of albums) {
      if (album.path.startsWith(`${prefix}/`)) {
        skipped++;
        continue;
      }
      const newPath = `${prefix}${album.path}`;
      await ensureDir(newPath);
      await prisma.album.update({ where: { id: album.id }, data: { path: newPath } });
      movedAlbums++;
    }

    const assets = await prisma.asset.findMany({ where: { userId: user.id } });
    for (const asset of assets) {
      if (asset.path.startsWith(`${prefix}/`)) {
        skipped++;
        continue;
      }
      const newPath = `${prefix}${asset.path}`;
      await moveFile(asset.path, newPath);
      await prisma.asset.update({ where: { id: asset.id }, data: { path: newPath } });
      movedAssets++;
    }

    console.log(`${user.email}: ${albums.length} albums, ${assets.length} assets checked`);
  }

  console.log(`Done. Moved ${movedAlbums} albums and ${movedAssets} assets, skipped ${skipped} already-migrated rows.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
