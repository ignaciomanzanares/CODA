/**
 * JWT Authentication Middleware
 * Simple JWT auth for CODA - Individual users (no multi-company)
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';

// =============================================================================
// TYPES
// =============================================================================

export interface TokenPayload {
  userId: string;
  email: string;
  name?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

// Token blacklist for logout (in production, use Redis)
const tokenBlacklist = new Set<string>();

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
