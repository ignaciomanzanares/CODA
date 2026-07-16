import rateLimit, { type Store, ipKeyGenerator } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { isProduction } from "../env.js";
import { redis } from "../redis.js";

/**
 * Sin Redis (`REDIS_URL` no definida), cada limiter usa su `MemoryStore` por defecto — válido en dev
 * con un solo proceso, pero no escala a múltiples instancias en producción (ver render.yaml).
 */
function redisStoreOrDefault(prefix: string): Store | undefined {
  const client = redis;
  if (!client) return undefined;
  return new RedisStore({
    prefix,
    sendCommand: (command: string, ...args: string[]) =>
      client.call(command, ...args) as ReturnType<RedisStore["sendCommand"]>,
  });
}

/**
 * Rate limiter for authentication endpoints
 * Stricter limits to prevent brute force attacks
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction() ? 5 : 100, // 5 attempts in production, 100 in dev
  message: "Too many authentication attempts, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStoreOrDefault("rl:auth:"),
});

/**
 * Rate limiter for general API endpoints
 * More lenient for normal operations
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction() ? 300 : 1000, // 300 requests per 15 min in production
  message: "Too many requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === "/health";
  },
  store: redisStoreOrDefault("rl:api:"),
});

/**
 * Rate limiter for expensive operations (ML scoring, reports)
 * Very strict to prevent abuse
 */
export const expensiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isProduction() ? 10 : 100, // 10 requests per hour in production
  message: "Rate limit exceeded for this operation, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStoreOrDefault("rl:expensive:"),
});

/**
 * Rate limiter for document uploads.
 * Keyed by authenticated userId so each user has their own bucket.
 * Prevents parser abuse and cloud cost spikes.
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  // 60/hora: un usuario cargando su historial (2 años = 24 cartolas + CMF +
  // reintentos) no debe toparse con el límite; 15 cortaba lotes legítimos.
  max: isProduction() ? 60 : 200,
  keyGenerator: (req) => {
    // Use userId from JWT payload if available, fall back to IP
    const authReq = req as { user?: { userId?: string } };
    return authReq.user?.userId ?? ipKeyGenerator(req.ip ?? "127.0.0.1");
  },
  message: "Límite de subida de documentos alcanzado. Intenta de nuevo en una hora.",
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStoreOrDefault("rl:upload:"),
});

/**
 * Rate limiter for public endpoints (no auth required)
 * Moderate limits to prevent abuse while allowing demos
 */
export const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction() ? 50 : 500, // 50 requests per 15 min in production
  message: "Too many requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStoreOrDefault("rl:public:"),
});
