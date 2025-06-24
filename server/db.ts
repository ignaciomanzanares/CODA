import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

// Use the DATABASE_URL from environment variables
const connectionString = process.env.DATABASE_URL!;

// Create a postgres client
const sql = postgres(connectionString);

// Create a drizzle instance with our schema
export const db = drizzle(sql, { schema });