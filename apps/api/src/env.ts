import path from 'path';
import { fileURLToPath } from 'url';

// Handle both ESM and CommonJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment validation
const isProd = process.env.NODE_ENV === 'production';

// In production, critical env vars are required
if (isProd) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in production');
  }
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required in production. Generate with: openssl rand -base64 32');
  }
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
}

// Only allow SQLite/memory fallback in development
const useMemStorage = !isProd && (process.env.USE_MEM_STORAGE === '1' || !process.env.DATABASE_URL);

// Get JWT secret - in production this is validated above, in dev use a default
const jwtSecret = isProd 
  ? process.env.JWT_SECRET! 
  : (process.env.JWT_SECRET || 'coda-dev-secret-do-not-use-in-production');

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  useMemStorage,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: process.env.CLIENT_URL || (isProd ? '' : 'http://localhost:5173'),
};

/**
 * Helper to check if we're in production
 */
export function isProduction(): boolean {
  return env.nodeEnv === "production";
}

/**
 * Helper to check if we're in development
 */
export function isDevelopment(): boolean {
  return env.nodeEnv === "development";
}
