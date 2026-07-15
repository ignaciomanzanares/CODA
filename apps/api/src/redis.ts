import Redis from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

/**
 * Cliente Redis compartido (Render add-on). `null` si `REDIS_URL` no está definida — en ese caso
 * rate limiting y colas caen a memoria local de un solo proceso (ver rateLimiter.ts/documentQueue.ts).
 */
export const redis: Redis | null = env.redisUrl
  ? new Redis(env.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
  : null;

if (redis) {
  redis.on("error", (err) => logger.error({ err }, "Redis connection error"));
}
