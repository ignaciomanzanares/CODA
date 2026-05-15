import rateLimit from "express-rate-limit";
import { isProduction } from "../env.js";

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
});

/**
 * Rate limiter for document uploads.
 * Keyed by authenticated userId so each user has their own bucket.
 * Prevents parser abuse and cloud cost spikes.
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isProduction() ? 15 : 200, // 15 uploads/hour in production
  keyGenerator: (req) => {
    // Use userId from JWT payload if available, fall back to IP
    const authReq = req as { user?: { userId?: string } };
    return authReq.user?.userId ?? req.ip ?? 'unknown';
  },
  message: "Límite de subida de documentos alcanzado. Intenta de nuevo en una hora.",
  standardHeaders: true,
  legacyHeaders: false,
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
});
