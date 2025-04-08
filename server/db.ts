import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "@shared/schema";

// Use the DATABASE_URL from environment variables
const connectionString = process.env.DATABASE_URL!;

// Create a neon client
const sql = neon(connectionString);

// Create a drizzle instance with our schema
export const db = drizzle(sql, { schema });