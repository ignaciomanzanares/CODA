import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

// Use the DATABASE_URL from environment variables
// Use the DATABASE_URL from environment variables or fallback to a default local database connection string
const connectionString = process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/finhealth";

if (!connectionString) {
  console.warn("⚠️  DATABASE_URL not found, falling back to in-memory storage");
  console.warn("   For production use, set DATABASE_URL environment variable");
}

// Create a postgres client only if DATABASE_URL is provided
const sql = connectionString ? postgres(connectionString) : null;

// Create a drizzle instance with our schema if connection exists  
// This will be set to null if connection test fails
let db = sql ? drizzle(sql, { schema }) : null;

// Database health check
export async function checkDatabaseConnection(): Promise<boolean> {
  if (!db || !sql) {
    return false;
  }
  
  try {
    await sql`SELECT 1`;
    console.log("✅ Database connection successful");
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    console.log("💾 Disabling database and falling back to in-memory storage");
    // Disable database to force fallback to in-memory storage
    db = null;
    return false;
  }
}

// Export the db instance
export { db };
