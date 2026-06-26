import Redis from 'ioredis';
import { logger } from './logger.js';

/**
 * Cliente Redis compartido.
 * Si REDIS_URL no está definida, queda en null y los consumidores deben usar fallback local/dev.
 */
export const redis: Redis | null = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
  : null;

if (redis) {
  redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));
}
