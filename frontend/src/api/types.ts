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
  takenAt: string | null;
  uploadedAt: string;
  isFavorite: boolean;
  isArchived: boolean;
}

export interface Album {
  id: string;
  name: string;
  description: string | null;
  path: string;
  parentId: string | null;
  coverAssetId: string | null;
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

export interface SharedLink {
  id: string;
  albumId: string;
  token: string;
  expiresAt: string | null;
  createdAt: string;
  album: { id: string; name: string; path: string };
}
