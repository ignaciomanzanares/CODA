import path from 'path';
import { fileURLToPath } from 'url';

// Handle both ESM and CommonJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path - use in-memory by default for development
const useMemStorage = process.env.USE_MEM_STORAGE === '1' || !process.env.DATABASE_URL;

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
