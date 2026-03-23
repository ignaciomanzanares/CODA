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
import { REGISTRATION_REQUIRED_PURPOSES, PRIVACY_POLICY_VERSION } from '../services/privacyConsent/privacyConsentTypes.js';

// =============================================================================
// TYPES
// =============================================================================

export interface TokenPayload {
  userId: string;
  email: string;
  name?: string;
  requires2FA?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

// Token blacklist for logout (in production, use Redis)
const tokenBlacklist = new Set<string>();

// 2FA OTP storage (in production, use Redis with TTL)
const otpStorage = new Map<string, { code: string; expiresAt: number; attempts: number }>();

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

function isTwoFactorEnabledFlag(value: unknown): boolean {
  if (value === true) return true;
  if (value === 1) return true;
  if (typeof value === 'string' && value.trim() === '1') return true;
  return false;
}

function isLikelyDatabaseOrInfraError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; name?: string };
  const code = e?.code;
  if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return true;
  const msg = String(e?.message ?? err ?? '');
  return /connection|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|timeout|socket|database|postgres|query failed|Failed query/i.test(
    msg
  );
}

// =============================================================================
// 2FA UTILITIES
// =============================================================================

/**
 * Generate a 6-digit OTP code
 */
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store OTP for a user (expires in 10 minutes)
 */
export function storeOTP(email: string, code: string): void {
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
  otpStorage.set(email, { code, expiresAt, attempts: 0 });
}

/**
 * Verify OTP for a user
 */
export function verifyOTP(email: string, code: string): { valid: boolean; error?: string } {
  const stored = otpStorage.get(email);
  
  if (!stored) {
    return { valid: false, error: 'No verification code found. Please request a new one.' };
  }
  
  if (Date.now() > stored.expiresAt) {
    otpStorage.delete(email);
    return { valid: false, error: 'Verification code expired. Please request a new one.' };
  }
  
  if (stored.attempts >= 3) {
    otpStorage.delete(email);
    return { valid: false, error: 'Too many attempts. Please request a new code.' };
  }
  
  if (stored.code !== code) {
    stored.attempts++;
    return { valid: false, error: 'Invalid verification code.' };
  }
  
  // Valid - remove the OTP
  otpStorage.delete(email);
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
 * Invalidate a token (add to blacklist)
 */
export function invalidateToken(token: string): void {
  tokenBlacklist.add(token);
  // Clean up old tokens periodically (tokens expire anyway)
  setTimeout(() => tokenBlacklist.delete(token), 7 * 24 * 60 * 60 * 1000);
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * JWT Authentication Middleware
 * Verifies the JWT token and attaches user to request
 */
export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Missing or invalid authorization header' 
    });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Invalid or expired token' 
    });
  }

  req.user = payload;
  next();
}

/**
 * Optional authentication - doesn't fail if no token
 */
export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }

  next();
}

// =============================================================================
// AUTH HANDLERS
// =============================================================================

/**
 * Login handler
 * In development: accepts demo password for testing
 * In production: requires DEMO_MODE=true env var to enable demo auth
 */
export async function handleLogin(req: Request, res: Response) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Email and password are required' 
    });
  }

  // Demo authentication - only allowed in development or when explicitly enabled
  const isProduction = process.env.NODE_ENV === 'production';
  const demoModeEnabled = process.env.DEMO_MODE === 'true';
  const demoPassword = process.env.DEMO_PASSWORD || 'demo123';
  
  if (isProduction && !demoModeEnabled) {
    // In production without demo mode, reject all login attempts
    // Real authentication should use Auth0 or another provider
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Demo authentication is disabled in production' 
    });
  }

  // Validate demo password
  if (password !== demoPassword) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Invalid email or password' 
    });
  }

  // Generate token
  const tokenPayload: TokenPayload = {
    userId: email.split('@')[0],
    email: email,
    name: email.split('@')[0],
  };

  const token = generateToken(tokenPayload);

  res.json({
    success: true,
    token,
    user: tokenPayload,
  });
}

/**
 * Logout handler - invalidates the current token
 */
export async function handleLogout(req: AuthenticatedRequest, res: Response) {
  const authHeader = req.headers.authorization;
  
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    invalidateToken(token);
  }

  if (req.user?.userId) {
    logAuthSecurityEvent('logout', req, {
      userId: req.user.userId,
      email: req.user.email ? redactEmail(req.user.email) : undefined,
    });
  }

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
      twoFactorEnabled: false,
    });

    const purposeVersions: { purpose: (typeof REGISTRATION_REQUIRED_PURPOSES)[number]; policyVersion: string }[] =
      REGISTRATION_REQUIRED_PURPOSES.map((purpose) => ({ purpose, policyVersion: pv }));
    if (consents.marketing === true) {
      purposeVersions.push({ purpose: 'marketing', policyVersion: pv });
    }
    try {
      await recordBatchAccept(newUser.id, purposeVersions, registerClientMeta(req));
    } catch (consentErr) {
      console.error('Privacy consent recording failed:', consentErr);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'No se pudo registrar el consentimiento. Intente nuevamente.',
      });
    }

    // Generate token
    const tokenPayload: TokenPayload = {
      userId: newUser.id,
      email: newUser.email,
      name: newUser.displayName || name,
    };

    const token = generateToken(tokenPayload);

    logAuthSecurityEvent('register_success', req, {
      userId: newUser.id,
      email: redactEmail(newUser.email),
    });

    res.status(201).json({
      success: true,
      token,
      user: tokenPayload,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to create account' 
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
 * Resolve the effective DB user id for the given JWT payload.
 * Use this in routes that write to tables with FK to users (e.g. consent_grants).
 * Returns null if the user does not exist and cannot be created (e.g. demo disabled).
 */
export async function ensureUserForToken(payload: TokenPayload): Promise<string | null> {
  if (!payload?.userId && !payload?.email) return null;
  const byId = await storage.getUser(payload.userId);
  if (byId) return byId.id;
  const byEmail = await storage.getUserByEmail(payload.email);
  if (byEmail) return byEmail.id;
  const demoModeEnabled = process.env.DEMO_MODE === 'true';
  if (demoModeEnabled && payload.email) {
    const user = await getOrCreateDemoUser(payload.email);
    return user.id;
  }
  return null;
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

  // Check demo authentication FIRST (for quick demo access)
  const isProduction = process.env.NODE_ENV === 'production';
  const demoModeEnabled = process.env.DEMO_MODE === 'true';
  const demoPassword = process.env.DEMO_PASSWORD || 'demo123';
  
  // Allow demo login in development OR when DEMO_MODE is enabled in production
  if ((!isProduction || demoModeEnabled) && password === demoPassword) {
    // Ensure demo user exists in DB and use real user.id in token (evita FK en consent_grants)
    const user = await getOrCreateDemoUser(email);
    const tokenPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      name: user.displayName || user.username,
    };

    const token = generateToken(tokenPayload);

    logAuthSecurityEvent('login_demo', req, {
      userId: user.id,
      email: redactEmail(user.email),
    });

    return res.json({
      success: true,
      token,
      user: tokenPayload,
    });
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
        return res.status(401).json({ 
          error: 'Unauthorized', 
          message: 'Invalid email or password' 
        });
      }

      // Check if 2FA is enabled
      if (isTwoFactorEnabledFlag(user.twoFactorEnabled)) {
        // Generate and send OTP
        const otpCode = generateOTP();
        storeOTP(email, otpCode);

        const sent = await emailService.send2FACode(email, otpCode);
        logAuthSecurityEvent('twofa_challenge', req, {
          email: redactEmail(email),
          emailSent: sent,
        });

        if (!sent) {
          if (process.env.NODE_ENV === 'production') {
            otpStorage.delete(email);
            logAuthSecurityEvent('twofa_email_failed', req, { email: redactEmail(email) });
            return res.status(503).json({
              error: 'Service Unavailable',
              message: 'No se pudo enviar el código. Intenta más tarde o contacta soporte.',
            });
          }
          if (isDevelopment()) {
            console.log(`[DEV] 2FA code for ${email}: ${otpCode}`);
          }
        }

        return res.json({
          success: true,
          requires2FA: true,
          message: 'Verification code sent to your email',
        });
      }

      // Generate token
      const tokenPayload: TokenPayload = {
        userId: user.id,
        email: user.email,
        name: user.displayName || user.username,
      };

      let token: string;
      try {
        token = generateToken(tokenPayload);
      } catch (tokenErr) {
        logger.error({ err: tokenErr }, 'login: generateToken failed');
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'No se pudo crear la sesión. Revisa la configuración del servidor (JWT).',
        });
      }

      logAuthSecurityEvent('login_success', req, {
        userId: user.id,
        email: redactEmail(user.email),
      });

      return res.json({
        success: true,
        token,
        user: tokenPayload,
      });
    }

    // No user found and not a demo login
    logAuthSecurityEvent('login_failed', req, {
      reason: 'bad_credentials',
      email: redactEmail(email),
    });
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Invalid email or password' 
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

  const result = verifyOTP(email, code);
  
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

    const tokenPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      name: user.displayName || user.username,
    };

    const token = generateToken(tokenPayload);

    logAuthSecurityEvent('twofa_verified', req, {
      userId: user.id,
      email: redactEmail(user.email),
    });

    res.json({
      success: true,
      token,
      user: tokenPayload,
    });
  } catch (error) {
    console.error('2FA verification error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Verification failed' 
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
    await storage.updateUser(user.id, { twoFactorEnabled: true });

    logAuthSecurityEvent('enable_2fa', req as Request, {
      userId: user.id,
      email: redactEmail(user.email),
    });

    res.json({
      success: true,
      message: '2FA has been enabled for your account',
    });
  } catch (error) {
    console.error('Enable 2FA error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to enable 2FA' 
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
    await storage.updateUser(user.id, { twoFactorEnabled: false });

    logAuthSecurityEvent('disable_2fa', req as Request, {
      userId: user.id,
      email: redactEmail(user.email),
    });

    res.json({
      success: true,
      message: '2FA has been disabled for your account',
    });
  } catch (error) {
    console.error('Disable 2FA error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to disable 2FA' 
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
    storeOTP(email, otpCode);

    const sent = await emailService.send2FACode(email, otpCode);
    logAuthSecurityEvent('resend_2fa', req, {
      email: redactEmail(email),
      emailSent: sent,
    });
    if (!sent) {
      if (process.env.NODE_ENV === 'production') {
        otpStorage.delete(email);
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
    console.error('Resend 2FA error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to resend code' 
    });
  }
}
