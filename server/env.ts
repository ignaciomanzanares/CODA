import { z } from "zod";

/**
 * Environment variable schema validation
 * Ensures all required environment variables are present and valid
 */
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().optional(),
  USE_MEM_STORAGE: z.enum(["0", "1"]).optional(),

  // Auth0 Backend API
  AUTH0_ISSUER_BASE_URL: z.string().url("AUTH0_ISSUER_BASE_URL must be a valid URL"),
  AUTH0_AUDIENCE: z.string().min(1, "AUTH0_AUDIENCE is required"),

  // Auth0 Frontend (VITE_ prefixed vars are for client-side)
  VITE_AUTH0_DOMAIN: z.string().min(1, "VITE_AUTH0_DOMAIN is required"),
  VITE_AUTH0_CLIENT_ID: z.string().min(1, "VITE_AUTH0_CLIENT_ID is required"),
  VITE_AUTH0_AUDIENCE: z.string().min(1, "VITE_AUTH0_AUDIENCE is required"),
  VITE_AUTH0_REDIRECT_URI: z.string().url("VITE_AUTH0_REDIRECT_URI must be a valid URL"),

  // Auth0 Management API (Machine to Machine) - Optional for local dev
  AUTH0_M2M_CLIENT_ID: z.string().optional(),
  AUTH0_M2M_CLIENT_SECRET: z.string().optional(),

  // Application Settings
  PORT: z.string().optional().default("5000"),
  NODE_ENV: z.enum(["development", "production", "test"]).optional().default("development"),

  // Optional: Railway API
  RAILWAY_API_URL: z.string().url().optional(),

  // Optional: Account deletion (local dev only)
  ALLOW_LOCAL_ACCOUNT_DELETE: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates and parses environment variables
 * Throws an error if validation fails
 */
export function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Environment variable validation failed:");
      console.error("\nMissing or invalid environment variables:");
      
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
      
      console.error("\n💡 Please check your .env file and ensure all required variables are set.");
      console.error("   See .env.example for reference.\n");
      
      throw new Error("Environment validation failed");
    }
    throw error;
  }
}

/**
 * Returns validated environment variables
 * Safe to use after calling validateEnv()
 */
export const env = validateEnv();

/**
 * Helper to check if Auth0 Management API is configured
 */
export function isAuth0ManagementConfigured(): boolean {
  return !!(env.AUTH0_M2M_CLIENT_ID && env.AUTH0_M2M_CLIENT_SECRET);
}

/**
 * Helper to check if we're in production
 */
export function isProduction(): boolean {
  return env.NODE_ENV === "production";
}

/**
 * Helper to check if we're in development
 */
export function isDevelopment(): boolean {
  return env.NODE_ENV === "development";
}
