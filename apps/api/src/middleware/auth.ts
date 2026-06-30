/**
 * JWT Authentication Middleware
 * Simple JWT auth for CODA - Individual users (no multi-company)
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env, isDevelopment } from '../env.js';
import { storage } from '../storage.js';
import { emailService } from '../services/emailService.js';
import { logger } from '../logger.js';
import {
  logAuthSecurityEvent,
  redactEmail,
} from './authSecurityLog.js';
import { recordBatchAccept } from '../services/privacyConsent/privacyConsentService.js';
import { isMissingPrivacyTableError } from '../services/privacyConsent/privacyConsentErrors.js';
import { db, users } from '../db/index.js';
import { redis } from '../redis.js';
import { eq } from 'drizzle-orm';
import { REGISTRATION_REQUIRED_PURPOSES, PRIVACY_POLICY_VERSION } from '../services/privacyConsent/privacyConsentTypes.js';

// =============================================================================
// TYPES
// =============================================================================

export interface TokenPayload {
  userId: string;
  email: string;
  name?: string;
  requires2FA?: boolean;
  /** persona | empresa — default persona si la columna no existe en filas antiguas */
  role?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

// Token blacklist for logout — in-memory fast path (backs up DB check below)
const tokenBlacklist = new Set<string>();

// 2FA OTP storage.
// Primary store is Redis (TTL nativo) para que un código generado en una instancia se valide
// en cualquier otra — el `Map` en memoria es solo un fallback para dev/single-process sin REDIS_URL.
const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
const OTP_MAX_ATTEMPTS = 3;
const otpKey = (email: string) => `otp:2fa:${normalizeEmail(email)}`;

const otpStorage = new Map<string, { code: string; expiresAt: number; attempts: number }>();

// Periodic cleanup del fallback en memoria: remove expired OTP entries every 15 minutes.
// (Redis expira solo vía TTL; este interval solo aplica cuando no hay Redis.)
setInterval(() => {
  if (redis) return;
  const now = Date.now();
  for (const [email, entry] of otpStorage.entries()) {
    if (entry.expiresAt < now) otpStorage.delete(email);
  }
}, 15 * 60 * 1000).unref();

// =============================================================================
// PASSWORD UTILITIES
// =============================================================================

/**
 * Hash a password using PBKDF2
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a hash (PBKDF2 salt:hash). Nunca lanza: hashes corruptos o datos antiguos → false.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || typeof storedHash !== 'string') return false;
  try {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;
    const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
  } catch (err) {
    logger.warn({ err }, 'verifyPassword: error comparando hash (formato inválido o datos corruptos)');
    return false;
  }
}

/** Email estable para login/registro (evita fallos por espacios o mayúsculas vs BD). */
export function normalizeEmail(email: string): string {
  return String(email).trim().toLowerCase();
}

/** Rol estable para JWT (columna opcional en filas antiguas). */
export function userRoleFromRow(user: { role?: string | null } | undefined): string {
  const r = user?.role;
  return typeof r === 'string' && r.trim().length > 0 ? r.trim() : 'persona';
}

/** Payload de sesión para JWT (incluye role). */
export function buildAuthTokenPayload(user: {
  id: string;
  email: string;
  displayName?: string | null;
  username: string;
  role?: string | null;
}): TokenPayload {
  return {
    userId: user.id,
    email: user.email,
    name: user.displayName || user.username,
    role: userRoleFromRow(user),
  };
}

function isTwoFactorEnabledFlag(value: unknown): boolean {
  if (value === true) return true;
  if (value === 1) return true;
  if (typeof value === 'string' && value.trim() === '1') return true;
  return false;
}

/**
 * Solo errores de red / capa de conexión a Postgres (503).
 * Antes cualquier SQLSTATE de 5 caracteres (p.ej. 42P01 tabla inexistente) se clasificaba mal como "sin conexión".
 */
function* walkErrorChain(err: unknown): Generator<unknown> {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur != null; i++) {
    yield cur;
    cur = typeof cur === 'object' && cur !== null && 'cause' in cur ? (cur as { cause?: unknown }).cause : undefined;
  }
}

function isLikelyDatabaseOrInfraError(err: unknown): boolean {
  for (const layer of walkErrorChain(err)) {
    if (singleLayerIsConnectionOrInfra(layer)) return true;
  }
  return false;
}

function singleLayerIsConnectionOrInfra(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const o = e as { code?: string; message?: string; name?: string };
  const code = o.code;
  const msg = String(o.message ?? '');

  // Node / libuv
  if (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'EAI_AGAIN' ||
    code === 'UND_ERR_CONNECT_TIMEOUT'
  ) {
    return true;
  }

  // PostgreSQL SQLSTATE clase 08 — Connection Exception (08000, 08003, 08006, …)
  if (typeof code === 'string' && code.length === 5 && code.startsWith('08')) {
    return true;
  }
  // Servidor en mantenimiento / no acepta conexiones
  if (code === '57P01' || code === '57P02' || code === '57P03') {
    return true;
  }

  // Textos habituales del driver postgres.js / red (sin palabras genéricas como "database" que aparecen en errores SQL)
  if (
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET|connect ECONNREFUSED|getaddrinfo\s+ENOTFOUND|socket hang up|Connection terminated|connection terminated|Server closed the connection|write EPIPE|read ECONNRESET|password authentication failed for connection|SSL SYSCALL|SSL connection|certificate verify failed|no pg_hba\.conf|connection pool/i.test(
      msg
    )
  ) {
    return true;
  }

  return false;
}

// =============================================================================
// 2FA UTILITIES
// =============================================================================

/**
 * Generate a 6-digit OTP code
 */
export function generateOTP(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Store OTP for a user (expires in 10 minutes).
 * Redis primario (TTL nativo) con fallback a memoria si no hay REDIS_URL.
 */
export async function storeOTP(email: string, code: string): Promise<void> {
  if (redis) {
    await redis.set(
      otpKey(email),
      JSON.stringify({ code, attempts: 0 }),
      'EX',
      OTP_TTL_SECONDS,
    );
    return;
  }
  const expiresAt = Date.now() + OTP_TTL_SECONDS * 1000;
  otpStorage.set(normalizeEmail(email), { code, expiresAt, attempts: 0 });
}

/**
 * Delete a stored OTP (logout/cleanup tras envío fallido).
 */
export async function deleteOTP(email: string): Promise<void> {
  if (redis) {
    await redis.del(otpKey(email));
    return;
  }
  otpStorage.delete(normalizeEmail(email));
}

/**
 * Verify OTP for a user.
 * Cuenta intentos en el mismo store (Redis o memoria) preservando el TTL restante.
 */
export async function verifyOTP(email: string, code: string): Promise<{ valid: boolean; error?: string }> {
  if (redis) {
    const key = otpKey(email);
    const raw = await redis.get(key);
    if (!raw) {
      return { valid: false, error: 'No verification code found. Please request a new one.' };
    }
    let entry: { code: string; attempts: number };
    try {
      entry = JSON.parse(raw) as { code: string; attempts: number };
    } catch {
      await redis.del(key);
      return { valid: false, error: 'No verification code found. Please request a new one.' };
    }

    if (entry.attempts >= OTP_MAX_ATTEMPTS) {
      await redis.del(key);
      return { valid: false, error: 'Too many attempts. Please request a new code.' };
    }

    if (entry.code !== code) {
      entry.attempts++;
      const ttl = await redis.ttl(key);
      await redis.set(key, JSON.stringify(entry), 'EX', ttl > 0 ? ttl : OTP_TTL_SECONDS);
      return { valid: false, error: 'Invalid verification code.' };
    }

    // Valid - remove the OTP
    await redis.del(key);
    return { valid: true };
  }

  // Fallback en memoria (dev/single-process sin Redis)
  const key = normalizeEmail(email);
  const stored = otpStorage.get(key);

  if (!stored) {
    return { valid: false, error: 'No verification code found. Please request a new one.' };
  }

  if (Date.now() > stored.expiresAt) {
    otpStorage.delete(key);
    return { valid: false, error: 'Verification code expired. Please request a new one.' };
  }

  if (stored.attempts >= OTP_MAX_ATTEMPTS) {
    otpStorage.delete(key);
    return { valid: false, error: 'Too many attempts. Please request a new code.' };
  }

  if (stored.code !== code) {
    stored.attempts++;
    return { valid: false, error: 'Invalid verification code.' };
  }

  // Valid - remove the OTP
  otpStorage.delete(key);
  return { valid: true };
}

// =============================================================================
// TOKEN UTILITIES
// =============================================================================

/**
 * Generate a JWT token for a user
 */
export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

// =============================================================================
// SESIÓN HÍBRIDA: cookie httpOnly + header Authorization (transición, #10)
// =============================================================================
// El token viaja en una cookie httpOnly (no accesible por JS → inmune a robo por
// XSS) y, a la vez, se sigue devolviendo en el body para clientes que aún usan el
// header `Authorization: Bearer`. `authenticate()` acepta cualquiera de los dos.
// No usamos `cookie-parser`: `res.cookie/clearCookie` son nativos de Express y la
// lectura se hace parseando `req.headers.cookie` a mano (una sola cookie).

export const AUTH_COOKIE_NAME = 'coda_session';

function authCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  // En prod la API y el front están en orígenes distintos (Vercel ↔ Render), así que
  // la cookie debe ser SameSite=None+Secure para viajar cross-site; en dev, Lax basta.
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
  };
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
}

export function clearAuthCookie(res: Response): void {
  const { maxAge: _drop, ...opts } = authCookieOptions();
  res.clearCookie(AUTH_COOKIE_NAME, opts);
}

/** Lee una cookie por nombre desde el header `Cookie` sin depender de cookie-parser. */
function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function readAuthCookie(req: Request): string | null {
  return readCookie(req, AUTH_COOKIE_NAME);
}

/** Token de la request: header `Authorization: Bearer` primero, luego cookie httpOnly. */
export function readTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.substring(7);
  return readAuthCookie(req);
}

// =============================================================================
// CSRF (double-submit cookie) — solo aplica cuando la sesión viaja por cookie.
// =============================================================================
// Un cliente con `Authorization: Bearer` no es vulnerable a CSRF (el navegador no
// adjunta headers custom automáticamente en requests cross-site), así que el
// chequeo solo se exige cuando `authenticate()` resolvió el token desde la cookie.
// Patrón doble-submit: cookie NO httpOnly (el front la lee) + header `X-CSRF-Token`
// que debe coincidir.

export const CSRF_COOKIE_NAME = 'coda_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function csrfCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: false,
    secure: isProduction,
    sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function setCsrfCookie(res: Response): string {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions());
  return token;
}

export function clearCsrfCookie(res: Response): void {
  const { maxAge: _drop, ...opts } = csrfCookieOptions();
  res.clearCookie(CSRF_COOKIE_NAME, opts);
}

function isCsrfTokenValid(req: Request): boolean {
  const cookieToken = readCookie(req, CSRF_COOKIE_NAME);
  const headerToken = req.headers[CSRF_HEADER_NAME];
  return (
    !!cookieToken &&
    typeof headerToken === 'string' &&
    headerToken.length > 0 &&
    headerToken === cookieToken
  );
}

/**
 * Emite la sesión: genera el token, lo setea en la cookie httpOnly + cookie CSRF, y
 * devuelve el payload para incluirlo también en el body (modo híbrido). Centraliza
 * los ~4 puntos que antes hacían `res.json({ success, token, user })` a mano.
 */
export function issueSession(
  res: Response,
  payload: TokenPayload,
  extra: Record<string, unknown> = {},
): void {
  const token = generateToken(payload);
  setAuthCookie(res, token);
  setCsrfCookie(res);
  res.json({ success: true, token, user: payload, ...extra });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    if (tokenBlacklist.has(token)) {
      return null;
    }
    return jwt.verify(token, env.jwtSecret) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Invalidate a token (in-memory blacklist + DB persistence for cross-device/restart safety).
 */
export function invalidateToken(token: string, userId?: string): void {
  tokenBlacklist.add(token);
  setTimeout(() => tokenBlacklist.delete(token), 30 * 24 * 60 * 60 * 1000);

  // Persist logout timestamp to DB — any token with iat < this value is rejected
  // even after a server restart, covering all devices the user is logged into.
  if (userId) {
    db.update(users)
      .set({ tokenInvalidatedAt: new Date().toISOString() })
      .where(eq(users.id, userId))
      .catch((err: unknown) => logger.error({ err, userId }, 'Failed to persist token invalidation to DB'));
  }
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * JWT Authentication Middleware
 * Verifies the JWT token and checks DB-backed invalidation (cross-device logout).
 */
export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const fromHeader = !!authHeader?.startsWith('Bearer ');
    const token = fromHeader ? authHeader!.substring(7) : readAuthCookie(req);

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
    }

    // La sesión llegó solo por cookie (sin header explícito) y la request muta
    // estado: exigir el token CSRF de doble-submit.
    if (!fromHeader && MUTATING_METHODS.has(req.method) && !isCsrfTokenValid(req)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'CSRF token missing or invalid',
      });
    }

    const payload = verifyToken(token);

    if (!payload) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }

    // Check DB-backed invalidation: reject tokens issued before the user's last logout.
    // This makes logout work across all devices even after server restarts.
    const [userRow] = await db
      .select({ tokenInvalidatedAt: users.tokenInvalidatedAt })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (userRow?.tokenInvalidatedAt) {
      const invalidatedAtMs = new Date(userRow.tokenInvalidatedAt).getTime();
      const tokenIat = ((payload as unknown) as { iat?: number }).iat ?? 0;
      if (tokenIat * 1000 < invalidatedAtMs) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Session expired. Please log in again.',
        });
      }
    }

    req.user = payload;
    next();
  } catch (err) {
    logger.error({ err }, 'authenticate middleware error');
    return res.status(500).json({ error: 'Internal Server Error', message: 'Authentication check failed' });
  }
}

/**
 * Optional authentication - doesn't fail if no token.
 * Mirrors authenticate()'s tokenInvalidatedAt check so that logged-out tokens
 * are treated as unauthenticated (not silently accepted) on optional routes.
 */
export async function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const token = readTokenFromRequest(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      const [userRow] = await db
        .select({ tokenInvalidatedAt: users.tokenInvalidatedAt })
        .from(users)
        .where(eq(users.id, payload.userId))
        .limit(1);

      if (userRow?.tokenInvalidatedAt) {
        const invalidatedAtMs = new Date(userRow.tokenInvalidatedAt).getTime();
        const tokenIat = ((payload as unknown) as { iat?: number }).iat ?? 0;
        if (tokenIat * 1000 < invalidatedAtMs) {
          return next(); // token invalidado → tratar como no-autenticado
        }
      }

      req.user = payload;
    }
  }

  next();
}

// =============================================================================
// AUTH HANDLERS
// =============================================================================

/**
 * Logout handler - invalidates the current token y limpia las cookies de sesión/CSRF.
 */
export async function handleLogout(req: AuthenticatedRequest, res: Response) {
  const token = readTokenFromRequest(req);

  if (token) {
    invalidateToken(token, req.user?.userId);
  }

  if (req.user?.userId) {
    logAuthSecurityEvent('logout', req, {
      userId: req.user.userId,
      email: req.user.email ? redactEmail(req.user.email) : undefined,
    });
  }

  clearAuthCookie(res);
  clearCsrfCookie(res);
  res.json({ success: true, message: 'Logged out successfully' });
}

/**
 * Get current user info
 */
export async function handleMe(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Not authenticated' 
    });
  }

  res.json({
    success: true,
    user: req.user,
  });
}

/**
 * Registration handler - creates new user with hashed password
 */
function registerClientMeta(req: Request): { ipAddress: string | null; userAgent: string | null; channel: string } {
  const xf = req.headers['x-forwarded-for'];
  const first = typeof xf === 'string' ? xf.split(',')[0]?.trim() : '';
  const ip =
    first ||
    (typeof req.socket?.remoteAddress === 'string' ? req.socket.remoteAddress : null) ||
    null;
  const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
  return { ipAddress: ip, userAgent: ua, channel: 'web' };
}

export async function handleRegister(req: Request, res: Response) {
  const { name, email: rawEmail, password, consents, policyVersion } = req.body;

  if (!rawEmail || !password) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Email and password are required' 
    });
  }

  if (!name) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Name is required' 
    });
  }

  const email = normalizeEmail(rawEmail);

  if (!consents || typeof consents !== 'object') {
    return res.status(400).json({
      error: 'Bad Request',
      message:
        'Se requiere el objeto consents con data_processing, scoring y recommendations en true (Política de privacidad v' +
        PRIVACY_POLICY_VERSION +
        ').',
    });
  }

  const pv =
    typeof policyVersion === 'string' && policyVersion.trim().length > 0
      ? policyVersion.trim().slice(0, 32)
      : PRIVACY_POLICY_VERSION;

  for (const key of REGISTRATION_REQUIRED_PURPOSES) {
    if (consents[key] !== true) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Debe aceptar la finalidad obligatoria: ${key}`,
      });
    }
  }

  // Validate password strength
  if (password.length < 8) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Password must be at least 8 characters' 
    });
  }

  try {
    // Check if user already exists
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ 
        error: 'Conflict', 
        message: 'An account with this email already exists' 
      });
    }

    // Hash password and create user
    const passwordHash = hashPassword(password);
    const userId = crypto.randomUUID();
    
    const newUser = await storage.createUser({
      id: userId,
      email,
      username: email.split('@')[0],
      passwordHash,
      displayName: name,
      twoFactorEnabled: 0,
      role: 'persona',
    });

    const purposeVersions: { purpose: (typeof REGISTRATION_REQUIRED_PURPOSES)[number]; policyVersion: string }[] =
      REGISTRATION_REQUIRED_PURPOSES.map((purpose) => ({ purpose, policyVersion: pv }));
    if (consents.marketing === true) {
      purposeVersions.push({ purpose: 'marketing', policyVersion: pv });
    }
    try {
      await recordBatchAccept(newUser.id, purposeVersions, registerClientMeta(req));
    } catch (consentErr) {
      logger.error(
        {
          err: consentErr,
          message: consentErr instanceof Error ? consentErr.message : String(consentErr),
          code: (consentErr as { code?: string })?.code,
        },
        'register: recordBatchAccept failed'
      );
      try {
        await db.delete(users).where(eq(users.id, newUser.id));
      } catch (rollbackErr) {
        logger.error({ err: rollbackErr }, 'register: failed to delete user after consent failure');
      }
      if (isMissingPrivacyTableError(consentErr)) {
        return res.status(503).json({
          error: 'Service Unavailable',
          message:
            'Falta la tabla de consentimientos en la base de datos. Ejecute: psql "$DATABASE_URL" -f apps/api/scripts/create-privacy-consent-events.sql (URL externa de Postgres en Render).',
        });
      }
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'No se pudo registrar el consentimiento. Intente nuevamente.',
      });
    }

    const tokenPayload: TokenPayload = buildAuthTokenPayload({
      ...newUser,
      displayName: newUser.displayName ?? name,
    });

    logAuthSecurityEvent('register_success', req, {
      userId: newUser.id,
      email: redactEmail(newUser.email),
    });

    res.status(201);
    issueSession(res, tokenPayload);
  } catch (error) {
    logger.error({ err: error }, 'Registration error');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create account',
    });
  }
}

/**
 * Get or create a demo user in the DB so the JWT carries a real users.id (evita FK en consent_grants).
 */
export async function getOrCreateDemoUser(email: string): Promise<{ id: string; email: string; displayName?: string; username: string }> {
  const existing = await storage.getUserByEmail(email);
  if (existing) return existing;

  const demoPassword = process.env.DEMO_PASSWORD || 'demo123';
  const passwordHash = hashPassword(demoPassword);
  const username = email.split('@')[0];
  const displayName = username.charAt(0).toUpperCase() + username.slice(1);
  const newUser = await storage.createUser({
    id: crypto.randomUUID(),
    email,
    username,
    passwordHash,
    displayName,
  });
  return newUser;
}

/**
 * Resuelve el `users.id` efectivo para el JWT (FK en financial_goals, trazabilidad, etc.).
 *
 * - BD nueva (p. ej. Neon vacía): el JWT sigue siendo válido pero no hay fila → **creamos** una fila mínima.
 * - Email ya existe con otro id (JWT antiguo): devolvemos el id de la fila en BD.
 * - Demo: mismo comportamiento que antes con `getOrCreateDemoUser`.
 */
export async function ensureUserForToken(payload: TokenPayload): Promise<string | null> {
  if (!payload?.userId && !payload?.email) return null;

  const email = payload.email ? normalizeEmail(payload.email) : null;

  if (payload.userId) {
    const byId = await storage.getUser(payload.userId);
    if (byId) return byId.id;
  }

  if (email) {
    const byEmail = await storage.getUserByEmail(email);
    if (byEmail) {
      if (payload.userId && byEmail.id !== payload.userId) {
        logger.warn(
          {
            jwtUserId: payload.userId,
            dbUserId: byEmail.id,
            email: redactEmail(email),
          },
          'ensureUserForToken: JWT userId sin fila; usando usuario encontrado por email'
        );
      }
      return byEmail.id;
    }
  }

  const demoModeEnabled = process.env.DEMO_MODE === 'true';
  if (demoModeEnabled && email) {
    const user = await getOrCreateDemoUser(email);
    return user.id;
  }

  /** Migración a BD vacía: JWT verificado por `authenticate` pero `users` sin fila. */
  if (payload.userId && email) {
    try {
      const [firstName, ...rest] = (payload.name ?? '').split(/\s+/).filter(Boolean);
      const created = await storage.createUser({
        id: payload.userId,
        username: `u_${payload.userId.replace(/-/g, '')}`,
        email,
        passwordHash: hashPassword(`__jwt_sync__${payload.userId}__${email}`),
        firstName: firstName || 'Usuario',
        lastName: rest.length > 0 ? rest.join(' ') : null,
        displayName: payload.name?.trim() || null,
        /** Marca cuenta creada solo para FK: la contraseña real no está en BD hasta login o recuperación. */
        userMetadata: JSON.stringify({ jwtSynced: true }),
      });
      logger.info(
        { userId: created.id, email: redactEmail(email) },
        'ensureUserForToken: fila users creada (JWT sin contraparte en BD)'
      );
      return created.id;
    } catch (err) {
      logger.error({ err }, 'ensureUserForToken: no se pudo crear usuario para FK');
      return null;
    }
  }

  logger.warn(
    { hasUserId: !!payload.userId, hasEmail: !!email },
    'ensureUserForToken: faltan datos para crear usuario'
  );
  return null;
}

/** Cuenta creada por ensureUserForToken (hash placeholder, no la contraseña real del usuario). */
export function isJwtSyncedMigrationUser(user: { userMetadata?: string | null }): boolean {
  if (!user?.userMetadata) return false;
  try {
    const m = JSON.parse(user.userMetadata) as { jwtSynced?: boolean };
    return m.jwtSynced === true;
  } catch {
    return false;
  }
}

/**
 * Detecta el hash interno `hashPassword('__jwt_sync__' + userId + email)` aunque no exista `user_metadata`
 * (filas creadas antes de guardar jwtSynced en metadata).
 */
export function isPlaceholderJwtSyncPassword(
  user: { id: string; passwordHash: string },
  email: string
): boolean {
  const secret = `__jwt_sync__${user.id}__${normalizeEmail(email)}`;
  return verifyPassword(secret, user.passwordHash);
}

/**
 * Tras migrar a Neon con BD vacía: el usuario puede tener fila creada por JWT sin su contraseña real.
 * Requiere `MIGRATION_RECOVERY_SECRET` en el servidor (valor largo, solo tú lo conoces).
 */
export async function handleRecoverMigrationPassword(req: Request, res: Response) {
  const secret = process.env.MIGRATION_RECOVERY_SECRET;
  const body = req.body as {
    email?: string;
    newPassword?: string;
    recoverySecret?: string;
    secret?: string;
  };
  logger.debug({ emailProvided: !!body.email, secretConfigured: !!(secret && secret.length >= 16) }, '[recovery] attempt');

  if (!secret || secret.length < 16) {
    return res.status(503).json({
      message:
        'Recuperación no está activa. En el hosting, define MIGRATION_RECOVERY_SECRET (16+ caracteres), despliega, usa el formulario una vez y quita la variable.',
    });
  }
  const { email: rawEmail, newPassword, recoverySecret } = body;
  if (recoverySecret !== secret) {
    return res.status(403).json({ message: 'Código de recuperación inválido.' });
  }
  if (!rawEmail || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({
      message: 'Email y contraseña nueva (mínimo 8 caracteres) son obligatorios.',
    });
  }
  const email = normalizeEmail(rawEmail);
  const user = await storage.getUserByEmail(email);
  if (!user) {
    return res.status(404).json({ message: 'No encontramos una cuenta con ese correo.' });
  }
  if (!isJwtSyncedMigrationUser(user) && !isPlaceholderJwtSyncPassword(user, email)) {
    return res.status(400).json({
      message:
        'Esta cuenta no está en modo recuperación por migración. Si olvidaste la contraseña, usa el flujo habitual cuando esté disponible.',
    });
  }
  await storage.updateUser(user.id, {
    passwordHash: hashPassword(newPassword),
    userMetadata: null,
  });
  logger.info(
    { userId: user.id, email: redactEmail(email) },
    'migration_password_recovery: contraseña actualizada en BD'
  );
  logAuthSecurityEvent('migration_password_recovery', req, {
    userId: user.id,
    email: redactEmail(email),
  });
  return res.json({
    success: true,
    message: 'Contraseña actualizada. Ya puedes iniciar sesión con la nueva clave.',
  });
}

/**
 * Login handler with proper database authentication
 * Supports both registered users and demo users
 */
export async function handleLoginWithDB(req: Request, res: Response) {
  const { email: rawEmail, password } = req.body;

  if (!rawEmail || !password) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Email and password are required' 
    });
  }

  const email = normalizeEmail(rawEmail);

  logger.info({ email: redactEmail(email) }, '[AUTH LOGIN] attempt');

  // Check demo authentication FIRST (for quick demo access)
  const isProduction = process.env.NODE_ENV === 'production';
  const demoModeEnabled = process.env.DEMO_MODE === 'true';
  const demoPassword = process.env.DEMO_PASSWORD || 'demo123';
  
  // Allow demo login in development OR when DEMO_MODE is enabled in production
  if ((!isProduction || demoModeEnabled) && password === demoPassword) {
    // Ensure demo user exists in DB and use real user.id in token (evita FK en consent_grants)
    const user = await getOrCreateDemoUser(email);
    const tokenPayload: TokenPayload = buildAuthTokenPayload(user);

    logAuthSecurityEvent('login_demo', req, {
      userId: user.id,
      email: redactEmail(user.email),
    });

    return issueSession(res, tokenPayload);
  }

  try {
    // Usuario: primero email normalizado; si no hay fila, intentar tal cual vino (cuentas antiguas en BD)
    let user = await storage.getUserByEmail(email);
    if (!user && String(rawEmail).trim() !== email) {
      user = await storage.getUserByEmail(String(rawEmail).trim());
    }

    if (user && user.passwordHash) {
      // User exists with password - verify
      if (!verifyPassword(password, user.passwordHash)) {
        logAuthSecurityEvent('login_failed', req, {
          reason: 'bad_password',
          email: redactEmail(email),
        });
        if (isJwtSyncedMigrationUser(user) || isPlaceholderJwtSyncPassword(user, email)) {
          return res.status(401).json({
            error: 'Unauthorized',
            code: 'migration_password_placeholder',
            message:
              '[migration_recovery] Tras migrar el servidor (Neon), tu cuenta existe pero la contraseña aún no está guardada aquí. Despliega en Render la variable MIGRATION_RECOVERY_SECRET (16+ caracteres), abre «Recuperar acceso» abajo, pon tu nueva clave y ese código, y luego borra la variable.',
          });
        }
        return res.status(401).json({
          error: 'Unauthorized',
          code: 'wrong_password',
          message: 'La contraseña no es correcta.',
        });
      }

      // Check if 2FA is enabled
      if (isTwoFactorEnabledFlag(user.twoFactorEnabled)) {
        // Check if email service is actually configured before attempting 2FA
        const hasEmailConfig = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ||
          !!(process.env.SMTP_HOST && process.env.SMTP_USER);

        if (!hasEmailConfig) {
          // 2FA está habilitado para la cuenta pero el servidor no tiene servicio de email.
          // En producción esto es una mala configuración: NO podemos degradar silenciosamente
          // la segunda capa de autenticación (fail-closed). En dev sí permitimos el atajo.
          logAuthSecurityEvent('twofa_email_failed', req, {
            email: redactEmail(email),
            reason: 'no_email_config',
          });
          if (process.env.NODE_ENV === 'production') {
            logger.error({ email: redactEmail(email) }, '2FA enabled but no email service configured — failing closed. Set GMAIL_USER + GMAIL_APP_PASSWORD.');
            return res.status(503).json({
              error: 'Service Unavailable',
              code: 'twofa_unavailable',
              message: 'La verificación en dos pasos no está disponible temporalmente. Intenta más tarde o contacta a soporte.',
            });
          }
          logger.warn({ email: redactEmail(email) }, '[DEV] 2FA skipped: no email service configured.');
        } else {
          // Generate and send OTP
          const otpCode = generateOTP();
          await storeOTP(email, otpCode);

          // Send 2FA email with a 12s timeout — un SMTP lento no debe colgar el request.
          let sent = false;
          try {
            const sendPromise = emailService.send2FACode(email, otpCode);
            const timeoutPromise = new Promise<false>((resolve) => setTimeout(() => resolve(false), 12_000));
            sent = await Promise.race([sendPromise, timeoutPromise]);
          } catch (emailErr) {
            logger.warn({ err: emailErr, email: redactEmail(email) }, '2FA email threw');
            sent = false;
          }

          logAuthSecurityEvent('twofa_challenge', req, {
            email: redactEmail(email),
            emailSent: sent,
          });

          if (!sent) {
            // No se pudo entregar el código. Fail-closed: nunca emitir una sesión sin el
            // segundo factor para una cuenta con 2FA activo. (Mismo criterio que el handler
            // de reenvío de 2FA más abajo.)
            logAuthSecurityEvent('twofa_email_failed', req, { email: redactEmail(email) });
            if (isDevelopment()) {
              // Dev: mostramos el código en consola y mantenemos el OTP para poder probar el flujo.
              console.log(`[DEV] 2FA code for ${email}: ${otpCode}`);
              return res.json({
                success: true,
                requires2FA: true,
                message: '[DEV] Verification code generated — check server logs',
              });
            }
            await deleteOTP(email);
            logger.error({ email: redactEmail(email) }, '2FA email failed/timed out — denying login (fail-closed)');
            return res.status(503).json({
              error: 'Service Unavailable',
              code: 'twofa_email_failed',
              message: 'No pudimos enviar tu código de verificación. Intenta nuevamente en unos minutos.',
            });
          } else {
            return res.json({
              success: true,
              requires2FA: true,
              message: 'Verification code sent to your email',
            });
          }
        }
      }

      const tokenPayload: TokenPayload = buildAuthTokenPayload(user);

      logAuthSecurityEvent('login_success', req, {
        userId: user.id,
        email: redactEmail(user.email),
      });

      try {
        return issueSession(res, tokenPayload);
      } catch (tokenErr) {
        logger.error({ err: tokenErr }, 'login: generateToken failed');
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'No se pudo crear la sesión. Revisa la configuración del servidor (JWT).',
        });
      }
    }

    if (user && !user.passwordHash) {
      logAuthSecurityEvent('login_failed', req, {
        reason: 'no_password_set',
        email: redactEmail(email),
      });
      return res.status(401).json({
        error: 'Unauthorized',
        code: 'no_password',
        message: 'Esta cuenta usa otro método de acceso.',
      });
    }

    // No user found and not a demo login
    logAuthSecurityEvent('login_failed', req, {
      reason: 'bad_credentials',
      email: redactEmail(email),
    });
    return res.status(401).json({
      error: 'Unauthorized',
      code: 'user_not_found',
      message: 'No encontramos una cuenta con ese correo.',
    });
  } catch (error) {
    logger.error(
      { err: error, message: error instanceof Error ? error.message : String(error) },
      'Login error: handler exception'
    );
    if (isLikelyDatabaseOrInfraError(error)) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message:
          'No pudimos conectar con la base de datos. Intenta en unos segundos. Si persiste, contacta soporte.',
      });
    }
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Login failed',
    });
  }
}

/**
 * Verify 2FA OTP and complete login
 */
export async function handleVerify2FA(req: Request, res: Response) {
  const { email: rawEmail, code } = req.body;

  if (!rawEmail || !code) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Email and verification code are required' 
    });
  }

  const email = normalizeEmail(rawEmail);

  const result = await verifyOTP(email, code);

  if (!result.valid) {
    logAuthSecurityEvent('twofa_failed', req, {
      email: redactEmail(email),
      detail: result.error ?? 'invalid',
    });
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: result.error 
    });
  }

  try {
    // Get user and generate token
    const user = await storage.getUserByEmail(email);
    
    if (!user) {
      logAuthSecurityEvent('twofa_failed', req, {
        email: redactEmail(email),
        detail: 'user_not_found',
      });
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'User not found' 
      });
    }

    const tokenPayload: TokenPayload = buildAuthTokenPayload(user);

    logAuthSecurityEvent('twofa_verified', req, {
      userId: user.id,
      email: redactEmail(user.email),
    });

    issueSession(res, tokenPayload);
  } catch (error) {
    logger.error({ err: error }, '2FA verification error');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Verification failed',
    });
  }
}

/**
 * Enable 2FA for a user
 */
export async function handleEnable2FA(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Not authenticated' 
    });
  }

  try {
    const user = await storage.getUserByEmail(req.user.email);
    
    if (!user) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'User not found' 
      });
    }

    // Update user to enable 2FA
    await storage.updateUser(user.id, { twoFactorEnabled: 1 });

    logAuthSecurityEvent('enable_2fa', req as Request, {
      userId: user.id,
      email: redactEmail(user.email),
    });

    res.json({
      success: true,
      message: '2FA has been enabled for your account',
    });
  } catch (error) {
    logger.error({ err: error }, 'Enable 2FA error');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to enable 2FA',
    });
  }
}

/**
 * Disable 2FA for a user
 */
export async function handleDisable2FA(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Not authenticated' 
    });
  }

  try {
    const user = await storage.getUserByEmail(req.user.email);
    
    if (!user) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'User not found' 
      });
    }

    // Update user to disable 2FA
    await storage.updateUser(user.id, { twoFactorEnabled: 0 });

    logAuthSecurityEvent('disable_2fa', req as Request, {
      userId: user.id,
      email: redactEmail(user.email),
    });

    res.json({
      success: true,
      message: '2FA has been disabled for your account',
    });
  } catch (error) {
    logger.error({ err: error }, 'Disable 2FA error');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to disable 2FA',
    });
  }
}

/**
 * Resend 2FA OTP
 */
export async function handleResend2FA(req: Request, res: Response) {
  const { email: rawEmail } = req.body;

  if (!rawEmail) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Email is required' 
    });
  }

  const email = normalizeEmail(rawEmail);

  try {
    const user = await storage.getUserByEmail(email);
    
    if (!user || !isTwoFactorEnabledFlag(user.twoFactorEnabled)) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: '2FA is not enabled for this account' 
      });
    }

    // Generate and store new OTP
    const otpCode = generateOTP();
    await storeOTP(email, otpCode);

    const sent = await emailService.send2FACode(email, otpCode);
    logAuthSecurityEvent('resend_2fa', req, {
      email: redactEmail(email),
      emailSent: sent,
    });
    if (!sent) {
      if (process.env.NODE_ENV === 'production') {
        await deleteOTP(email);
        logAuthSecurityEvent('twofa_email_failed', req, { email: redactEmail(email) });
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'No se pudo enviar el código. Intenta más tarde.',
        });
      }
      if (isDevelopment()) {
        console.log(`[DEV] 2FA code for ${email}: ${otpCode}`);
      }
    }

    res.json({
      success: true,
      message: 'Verification code sent to your email',
    });
  } catch (error) {
    logger.error({ err: error }, 'Resend 2FA error');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to resend code',
    });
  }
}
