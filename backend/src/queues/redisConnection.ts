import { Redis } from "ioredis";
import { env } from "../config/env.js";

export const redisConnection = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
