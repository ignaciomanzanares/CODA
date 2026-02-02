/**
 * JWT Authentication Middleware
 * Simple JWT auth for CODA - Individual users (no multi-company)
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../env.js';
import { storage } from '../storage.js';

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
 * Verify a password against a hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
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
export async function handleRegister(req: Request, res: Response) {
  const { name, email, password } = req.body;

  if (!email || !password) {
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

    // Generate token
    const tokenPayload: TokenPayload = {
      userId: newUser.id,
      email: newUser.email,
      name: newUser.displayName || name,
    };

    const token = generateToken(tokenPayload);

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
 * Login handler with proper database authentication
 * Supports both registered users and demo users
 */
export async function handleLoginWithDB(req: Request, res: Response) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Email and password are required' 
    });
  }

  // Check demo authentication FIRST (for quick demo access)
  const isProduction = process.env.NODE_ENV === 'production';
  const demoModeEnabled = process.env.DEMO_MODE === 'true';
  const demoPassword = process.env.DEMO_PASSWORD || 'demo123';
  
  // Allow demo login in development OR when DEMO_MODE is enabled in production
  if ((!isProduction || demoModeEnabled) && password === demoPassword) {
    // Create demo user token
    const tokenPayload: TokenPayload = {
      userId: email.split('@')[0],
      email: email,
      name: email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1),
    };

    const token = generateToken(tokenPayload);

    return res.json({
      success: true,
      token,
      user: tokenPayload,
    });
  }

  try {
    // Check if user exists in database
    const user = await storage.getUserByEmail(email);
    
    if (user && user.passwordHash) {
      // User exists with password - verify
      if (!verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ 
          error: 'Unauthorized', 
          message: 'Invalid email or password' 
        });
      }

      // Check if 2FA is enabled
      if (user.twoFactorEnabled) {
        // Generate and send OTP
        const otpCode = generateOTP();
        storeOTP(email, otpCode);
        
        // In production, send email here
        // TODO: Integrate with email service
        console.log(`2FA code for ${email}: ${otpCode}`); // Remove in production
        
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

      const token = generateToken(tokenPayload);

      return res.json({
        success: true,
        token,
        user: tokenPayload,
      });
    }

    // No user found and not a demo login
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Invalid email or password' 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Login failed' 
    });
  }
}

/**
 * Verify 2FA OTP and complete login
 */
export async function handleVerify2FA(req: Request, res: Response) {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Email and verification code are required' 
    });
  }

  const result = verifyOTP(email, code);
  
  if (!result.valid) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: result.error 
    });
  }

  try {
    // Get user and generate token
    const user = await storage.getUserByEmail(email);
    
    if (!user) {
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
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Email is required' 
    });
  }

  try {
    const user = await storage.getUserByEmail(email);
    
    if (!user || !user.twoFactorEnabled) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: '2FA is not enabled for this account' 
      });
    }

    // Generate and store new OTP
    const otpCode = generateOTP();
    storeOTP(email, otpCode);
    
    // TODO: Send email with OTP
    console.log(`2FA code for ${email}: ${otpCode}`); // Remove in production

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
