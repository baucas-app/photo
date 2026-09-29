import { prisma } from "../db/prisma.js";

// A new trip starts when photos are further apart than these thresholds.
const MAX_GAP_HOURS = 8;
const MAX_GAP_KM = 200;
const MIN_PHOTOS = 2;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type RawAsset = {
  id: string;
  takenAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  locationCity: string | null;
  locationCountry: string | null;
};

type Cluster = { assets: RawAsset[] };

function cluster(assets: RawAsset[]): Cluster[] {
  // Only assets with both GPS and a timestamp can be clustered.
  const located = assets
    .filter((a) => a.takenAt && a.latitude != null && a.longitude != null)
    .sort((a, b) => a.takenAt!.getTime() - b.takenAt!.getTime());

  const clusters: Cluster[] = [];
  let current: RawAsset[] = [];

  for (const asset of located) {
    if (current.length === 0) {
      current.push(asset);
      continue;
    }
    const prev = current[current.length - 1]!;
    const gapHours = (asset.takenAt!.getTime() - prev.takenAt!.getTime()) / 3_600_000;
    const distKm = haversineKm(
      prev.latitude!,
      prev.longitude!,
      asset.latitude!,
      asset.longitude!,
    );

    if (gapHours > MAX_GAP_HOURS || distKm > MAX_GAP_KM) {
      if (current.length >= MIN_PHOTOS) clusters.push({ assets: current });
      current = [asset];
    } else {
      current.push(asset);
    }
  }
  if (current.length >= MIN_PHOTOS) clusters.push({ assets: current });
  return clusters;
}

function tripName(c: Cluster, index: number): string {
  // Try to derive a name from reverse-geocoded location data already in the DB.
  const cities = [...new Set(c.assets.map((a) => a.locationCity).filter(Boolean))];
  const countries = [...new Set(c.assets.map((a) => a.locationCountry).filter(Boolean))];

  if (cities.length > 0 && countries.length > 0) {
    const top = cities.slice(0, 2).join(" & ");
    return cities.length === 1 ? `${cities[0]}, ${countries[0]}` : `${top} (${countries[0]})`;
  }
  if (countries.length > 0) return countries[0]!;

  const start = c.assets[0]!.takenAt!;
  const month = start.toLocaleString("de-DE", { month: "long", year: "numeric" });
  return `Reise ${month}`;
}

/** Deletes all existing trips for the user and rebuilds them from scratch. */
export async function recalculateTrips(userId: string): Promise<number> {
  const assets = await prisma.asset.findMany({
    where: {
      userId,
      deletedAt: null,
      isLivePhotoMotion: false,
      takenAt: { not: null },
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      takenAt: true,
      latitude: true,
      longitude: true,
      locationCity: true,
      locationCountry: true,
    },
  });

  const clusters = cluster(assets as RawAsset[]);

  // Replace all trips atomically.
  await prisma.$transaction([
    prisma.tripAsset.deleteMany({ where: { trip: { userId } } }),
    prisma.trip.deleteMany({ where: { userId } }),
  ]);

  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i]!;
    const lats = c.assets.map((a) => a.latitude!);
    const lons = c.assets.map((a) => a.longitude!);
    const centerLat = lats.reduce((s, v) => s + v, 0) / lats.length;
    const centerLon = lons.reduce((s, v) => s + v, 0) / lons.length;
    const sortedByDate = [...c.assets].sort((a, b) => a.takenAt!.getTime() - b.takenAt!.getTime());
    const countries = [...new Set(c.assets.map((a) => a.locationCountry).filter(Boolean))];
    const first = sortedByDate[0]!;
    const last = sortedByDate[sortedByDate.length - 1]!;

    const trip = await prisma.trip.create({
      data: {
        userId,
        name: tripName(c, i),
        startDate: first.takenAt!,
        endDate: last.takenAt!,
        centerLat,
        centerLon,
        locationName: countries.length > 0 ? countries.join(", ") : null,
        coverAssetId: first.id,
      },
    });

    await prisma.tripAsset.createMany({
      data: c.assets.map((a) => ({ tripId: trip.id, assetId: a.id })),
      skipDuplicates: true,
    });
  }

  return clusters.length;
}
