import path from 'path';
import { fileURLToPath } from 'url';

// Handle both ESM and CommonJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// In production, DATABASE_URL and JWT_SECRET are required
const isProd = process.env.NODE_ENV === 'production';
if (isProd) {
  if (!process.env.DATABASE_URL) {
    throw new Error('❌ DATABASE_URL is required in production. Set it in your environment variables.');
  }
  if (!process.env.JWT_SECRET) {
    throw new Error('❌ JWT_SECRET is required in production. Generate one with: openssl rand -base64 32');
  }
  // Warn if JWT_SECRET looks weak
  if (process.env.JWT_SECRET.length < 32) {
    console.warn('⚠️  JWT_SECRET should be at least 32 characters for security');
  }
}

// Only allow SQLite fallback in development
const useMemStorage = !isProd && (process.env.USE_MEM_STORAGE === '1' || !process.env.DATABASE_URL);

if (!useMemStorage && process.env.DATABASE_URL) {
  console.log(`📂 Database: ${process.env.DATABASE_URL}`);
} else {
  console.log('📂 Database: In-memory storage (development mode)');
}

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  useMemStorage,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'coda-dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
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
