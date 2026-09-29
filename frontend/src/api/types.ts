export interface User {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
}

export interface Asset {
  id: string;
  filename: string;
  path: string;
  size: number | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  iso: number | null;
  fNumber: number | null;
  exposureTime: number | null;
  focalLength: number | null;
  takenAt: string | null;
  uploadedAt: string;
  isFavorite: boolean;
  isArchived: boolean;
  /** Set while the asset sits in the trash (auto-purged after 30 days). */
  deletedAt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Number of *other* photos grouped into this asset's stack (0 = not stacked).
   *  Only computed by `GET /assets` (incl. ?favorite=/?archived=/?trashed=) - other
   *  endpoints (single asset, album detail, edit/revert) don't include it. */
  stackCount?: number;
  /** Raw FK to the stack's primary - null on the primary itself, set on members.
   *  Present on every endpoint that returns a bare asset row (unlike stackCount). */
  stackParentId?: string | null;
  /** True for the hidden video half of a Live Photo - never shown on its own. */
  isLivePhotoMotion: boolean;
  /** Set on the still image of a Live Photo - id of its paired motion video (playable via /assets/:id/file). */
  livePhotoVideoId: string | null;
  /** True for an equirectangular 360°/panorama photo. */
  is360: boolean;
  /** OCR-extracted text (populated by ml-service if pytesseract is installed). */
  ocrText?: string | null;
}

export interface AssetsPage {
  assets: Asset[];
  nextCursor: string | null;
}

export interface MapPoint {
  id: string;
  latitude: number;
  longitude: number;
  takenAt: string | null;
}

export interface Memory {
  year: number;
  yearsAgo: number;
  assets: Asset[];
}

/** Body of POST /assets/:id/edit - crop is in real image pixels of the original. */
export interface EditOperations {
  rotate?: 90 | 180 | 270 | -90;
  crop?: { left: number; top: number; width: number; height: number };
  brightness?: number;
  contrast?: number;
}

export type AlbumSortOrder = "takenAt_desc" | "takenAt_asc" | "uploadedAt_desc" | "name_asc";

export interface Album {
  id: string;
  name: string;
  description: string | null;
  path: string;
  parentId: string | null;
  coverAssetId: string | null;
  pinned: boolean;
  sortOrder: AlbumSortOrder;
  isLocked: boolean;
}

export interface AlbumDetail extends Album {
  children: Album[];
  assets: Asset[];
  nextCursor: string | null;
}

export interface Face {
  id: string;
  personName: string | null;
  sampleAsset: Asset | null;
  assetCount: number;
}

export interface AlbumComment {
  id: string;
  albumId: string;
  userId: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string | null; email: string };
}

export type LibraryShareStatus = "pending" | "accepted";

export interface LibraryShare {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: LibraryShareStatus;
  createdAt: string;
  fromUser?: { id: string; name: string | null; email: string };
  toUser?: { id: string; name: string | null; email: string };
}

export interface SharedLink {
  id: string;
  albumId: string;
  token: string;
  expiresAt: string | null;
  createdAt: string;
  album: { id: string; name: string; path: string };
}

export interface UserLabel {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  parentId: string | null;
  createdAt: string;
  assetCount?: number;
}

export interface Trip {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  centerLat: number | null;
  centerLon: number | null;
  locationName: string | null;
  coverAssetId: string | null;
  coverAsset: { id: string; mimeType: string | null } | null;
  _count: { assets: number };
}
