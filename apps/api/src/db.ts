import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../../packages/db/src/schema.js";
import { dbLogger } from "./logger.js";

// Use the DATABASE_URL from environment variables or fallback to a default local database connection string
const connectionString = process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/finhealth";
const forceMem = process.env.USE_MEM_STORAGE === '1';

if (!connectionString && !forceMem) {
  dbLogger.warn("DATABASE_URL not found, falling back to in-memory storage");
  dbLogger.warn("For production use, set DATABASE_URL environment variable");
}

// Create a postgres client only if not forcing memory mode and connection string is provided
const sql = (!forceMem && connectionString) ? postgres(connectionString) : null;

// Create a drizzle instance with our schema if connection exists  
// This will be set to null if connection test fails
let db = sql ? drizzle(sql, { schema }) : null;

// Database health check
export async function checkDatabaseConnection(): Promise<boolean> {
  if (forceMem) {
    dbLogger.info("💾 Using in-memory storage (USE_MEM_STORAGE=1)");
    return false;
  }
  if (!db || !sql) {
    dbLogger.warn("💾 Database not configured, using in-memory storage");
    return false;
  }
  
  try {
    await sql`SELECT 1`;
    dbLogger.info("✅ Database connection successful");
    return true;
  } catch (error) {
    dbLogger.error({ error }, "❌ Database connection failed");
    dbLogger.info("💾 Falling back to in-memory storage");
    // Disable database to force fallback to in-memory storage
    db = null;
    return false;
  }
}

// Export the db instance
export { db };
