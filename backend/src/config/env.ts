import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3001),

  databaseUrl: required("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",

  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "15m",
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "30d",

  storageRoot: process.env.STORAGE_ROOT ?? "/photos",
  thumbnailCacheRoot: process.env.THUMBNAIL_CACHE_ROOT ?? "/photos-cache",

  mlServiceUrl: process.env.ML_SERVICE_URL ?? "http://localhost:8000",

  gitRepoPath: process.env.GIT_REPO_PATH ?? process.cwd(),
} as const;
