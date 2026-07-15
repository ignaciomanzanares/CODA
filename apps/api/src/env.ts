import path from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";

// Handle both ESM and CommonJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment validation
const isProd = process.env.NODE_ENV === "production";

// In production, critical env vars are required
if (isProd) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required in production");
  }
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required in production. Generate with: openssl rand -base64 32");
  }
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters in production");
  }
  if (!process.env.FIELD_ENCRYPTION_KEY) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY is required in production. Generate with: openssl rand -base64 32",
    );
  }
  if (process.env.FIELD_ENCRYPTION_KEY.length < 32) {
    throw new Error("FIELD_ENCRYPTION_KEY must be at least 32 characters in production");
  }
  if (!process.env.RUT_HASH_PEPPER) {
    throw new Error(
      "RUT_HASH_PEPPER is required in production. Generate with: openssl rand -base64 32",
    );
  }
  if (process.env.RUT_HASH_PEPPER.length < 32) {
    throw new Error("RUT_HASH_PEPPER must be at least 32 characters in production");
  }
}

// Only allow SQLite/memory fallback in development
const useMemStorage = !isProd && (process.env.USE_MEM_STORAGE === "1" || !process.env.DATABASE_URL);

// Get JWT secret. En producción está validado arriba (lanza si falta). En dev/test, si no se
// define, se genera uno ALEATORIO por proceso (#37): así no existe ninguna llave hardcodeada que
// pueda filtrarse a producción por error. Costo en dev: los tokens no sobreviven a un reinicio
// (basta re-loguear); en tests todo corre en el mismo proceso, así que no afecta.
const jwtSecret = isProd
  ? process.env.JWT_SECRET!
  : process.env.JWT_SECRET || randomBytes(32).toString("hex");

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  useMemStorage,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "30d",
  clientUrl: process.env.CLIENT_URL || (isProd ? "" : "http://localhost:5173"),
  // Validado arriba en prod; en dev usamos una llave fija no secreta (igual que jwtSecret).
  fieldEncryptionKey:
    process.env.FIELD_ENCRYPTION_KEY || "coda-dev-field-encryption-key-do-not-use-in-prod",
  // Llave ANTERIOR durante una rotación: decryptField la prueba como fallback si la llave
  // actual no autentica el valor. Permite leer datos cifrados con la llave vieja mientras el
  // job de rotación los re-cifra con la actual. Quitar tras completar la rotación.
  fieldEncryptionKeyPrev: process.env.FIELD_ENCRYPTION_KEY_PREV || undefined,
  // Pepper para el hash irreversible (HMAC-SHA256) del RUT (seudonimización, no cifrado — no
  // hay forma de recuperar el RUT desde rut_hash). Secreto DISTINTO de FIELD_ENCRYPTION_KEY:
  // rotarlo invalida todos los hashes existentes (no es una operación de "rotación" reversible
  // como la de fieldEncryption). Validado arriba en prod; en dev usamos una llave fija no secreta.
  rutHashPepper: process.env.RUT_HASH_PEPPER || "coda-dev-rut-hash-pepper-do-not-use-in-prod",
  // Opcional: si no está definida, rate limiting/colas caen a memoria local (un solo proceso).
  redisUrl: process.env.REDIS_URL,
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
