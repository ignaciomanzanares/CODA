/**
 * Auth cookie foundation (Fase A — backwards-compatible).
 *
 * El JWT puede viajar en una cookie httpOnly ADEMÁS del `Authorization: Bearer`
 * legacy. Todo está detrás de `AUTH_COOKIE_ENABLED` (default `false`): con el
 * flag apagado, `setAuthCookie`/`clearAuthCookie` son no-op y la respuesta es
 * idéntica a producción actual (Bearer + token en JSON). Las cookies NO se
 * activan hasta tener `api.codafinance.cl` (cross-site con onrender.com serían
 * third-party y Safari/Chrome las bloquean).
 */
import type { Request, Response, CookieOptions } from "express";

const DEFAULT_COOKIE_NAME = "coda_session";
/** Coherente con el default de JWT_EXPIRES_IN ('30d'). */
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function isAuthCookieEnabled(): boolean {
  return process.env.AUTH_COOKIE_ENABLED === "true";
}

export function getAuthCookieName(): string {
  const raw = process.env.AUTH_COOKIE_NAME?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_COOKIE_NAME;
}

/** Enum validado: lax | strict | none. Valor inválido → 'lax' (default seguro). */
function getSameSite(): "lax" | "strict" | "none" {
  const raw = (process.env.AUTH_COOKIE_SAMESITE ?? "lax").trim().toLowerCase();
  if (raw === "strict" || raw === "none") return raw;
  return "lax";
}

function isSecure(sameSite: "lax" | "strict" | "none"): boolean {
  // SameSite=None exige Secure (el navegador descarta la cookie si no lo es).
  if (sameSite === "none") return true;
  // Secure por defecto; solo se desactiva explícitamente (dev local sobre http).
  return process.env.AUTH_COOKIE_SECURE !== "false";
}

/** maxAge derivado de JWT_EXPIRES_IN ('30d','7d','12h'…); fallback 30d. */
function parseMaxAgeMs(): number {
  const raw = (process.env.JWT_EXPIRES_IN ?? "30d").trim();
  const m = /^(\d+)\s*([smhd])$/.exec(raw);
  if (!m) return DEFAULT_MAX_AGE_MS;
  const n = Number(m[1]);
  const mult =
    m[2] === "s" ? 1000 : m[2] === "m" ? 60_000 : m[2] === "h" ? 3_600_000 : 86_400_000;
  return n * mult;
}

export function getAuthCookieOptions(): CookieOptions {
  const sameSite = getSameSite();
  const options: CookieOptions = {
    httpOnly: true,
    secure: isSecure(sameSite),
    sameSite,
    path: "/",
    maxAge: parseMaxAgeMs(),
  };
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim();
  if (domain) options.domain = domain; // Solo si está seteado (no antes de api.codafinance.cl).
  return options;
}

/** Setea la cookie de sesión solo si el flag está activo (no-op si no). */
export function setAuthCookie(res: Response, token: string): void {
  if (!isAuthCookieEnabled()) return;
  res.cookie(getAuthCookieName(), token, getAuthCookieOptions());
}

/** Limpia la cookie de sesión solo si el flag está activo (no-op si no). */
export function clearAuthCookie(res: Response): void {
  if (!isAuthCookieEnabled()) return;
  const { httpOnly, secure, sameSite, path, domain } = getAuthCookieOptions();
  res.clearCookie(getAuthCookieName(), {
    httpOnly,
    secure,
    sameSite,
    path,
    ...(domain ? { domain } : {}),
  });
}

/**
 * Lee el JWT desde la cookie (requiere cookie-parser). Bearer tiene prioridad en
 * authenticate. Si AUTH_COOKIE_ENABLED !== "true" devuelve undefined: con el flag
 * apagado NO hay transporte por cookie (una cookie existente/manual no autentica),
 * de modo que el comportamiento es idéntico a producción actual (solo Bearer).
 */
export function getTokenFromCookie(req: Request): string | undefined {
  if (!isAuthCookieEnabled()) return undefined;
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const value = cookies?.[getAuthCookieName()];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
