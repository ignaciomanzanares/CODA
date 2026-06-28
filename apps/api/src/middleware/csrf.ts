/**
 * CSRF Origin/Referer allowlist (CSRF-1, foundation).
 *
 * Protects state-changing requests that authenticate via the `coda_session`
 * cookie against cross-site request forgery, once C3 removes the Bearer header
 * (which is itself CSRF-safe). Inert unless `CSRF_ENFORCE=true` (default off).
 *
 * A request is treated as a cookie-authenticated mutation when: the method is
 * mutating, the path isn't an exempt route, there is NO `Authorization: Bearer`
 * header (Bearer auth — empresas/CLI/legacy — is CSRF-safe and skipped), and the
 * `coda_session` cookie is present. For those, an allowlisted `Origin` (fallback
 * `Referer`) is required, otherwise 403. This needs no frontend changes (browsers
 * send `Origin` automatically) and no new CORS `allowedHeaders`.
 */
import type { Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SESSION_COOKIE = "coda_session";

// Mutating routes exempt from CSRF: auth bootstrap (no session yet, or the action
// IS authenticating — also used by CLI), public endpoints, and empresas (Bearer).
const SKIP_EXACT = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/recover-migration-password",
  "/api/auth/2fa/verify",
  "/api/auth/2fa/resend",
]);
const SKIP_PREFIXES = ["/api/utils/", "/api/share/", "/api/empresas/"];

export function isCsrfEnforced(): boolean {
  return process.env.CSRF_ENFORCE === "true";
}

/**
 * Allowlist of origins for cookie-authenticated mutations. Mirrors the CORS
 * allowlist: own domains + dev + `CORS_ORIGINS` (where staging/preview origins
 * are configured), so no insecure wildcard is hardcoded.
 */
export function csrfAllowedOrigins(): Set<string> {
  const defaults = [
    "https://www.codafinance.cl",
    "https://codafinance.cl",
    "http://localhost:5173",
    "http://localhost:3000",
  ];
  const extra = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return new Set([...defaults, ...extra]);
}

/** Exact origin of an Origin/Referer header, or null if absent/`null`/invalid. */
function originOf(header: string | undefined): string | null {
  if (!header || header === "null") return null;
  try {
    return new URL(header).origin;
  } catch {
    return null;
  }
}

function isSkippedPath(path: string): boolean {
  if (SKIP_EXACT.has(path)) return true;
  return SKIP_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function csrfOriginCheck(req: Request, res: Response, next: NextFunction): void {
  if (!isCsrfEnforced()) return next();
  if (!MUTATING_METHODS.has(req.method)) return next();
  if (isSkippedPath(req.path)) return next();

  // Bearer present → header-based auth (CSRF-safe); covers empresas/CLI/legacy.
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) return next();

  // No session cookie → not a cookie-authenticated mutation.
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  if (!cookies || !cookies[SESSION_COOKIE]) return next();

  // Cookie-authenticated mutation: require an allowlisted Origin (fallback Referer).
  const origin = originOf(req.headers.origin) ?? originOf(req.headers.referer);
  if (origin && csrfAllowedOrigins().has(origin)) return next();

  logger.warn(
    {
      method: req.method,
      path: req.path,
      origin: req.headers.origin ?? null,
      referer: req.headers.referer ?? null,
    },
    "csrf: blocked cookie-auth mutation (origin not allowlisted)"
  );
  res.status(403).json({ message: "CSRF validation failed" });
}
