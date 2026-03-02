/**
 * Script to run SQL migrations in the migrations/ folder
 * Usage: node scripts/run-migrations.mjs
 */

import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import postgres from 'postgres';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

async function runMigrations() {
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl || !dbUrl.startsWith('postgres')) {
    console.log('⚠️  DATABASE_URL not set or not PostgreSQL. Skipping migrations.');
    console.log('   For local SQLite, use: npm run db:push');
    return;
  }

  console.log('🔄 Connecting to database...');
  const sql = postgres(dbUrl, { max: 1 });

  try {
    // Create migrations tracking table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Get list of applied migrations
    const appliedMigrations = await sql`SELECT filename FROM _migrations`;
    const appliedSet = new Set(appliedMigrations.map(row => row.filename));

    // Read all migration files
    const migrationsDir = join(projectRoot, 'migrations');
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`📁 Found ${files.length} migration file(s)`);

    // Apply each migration
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`✅ ${file} - already applied`);
        continue;
      }

      console.log(`🔄 Applying ${file}...`);
      const migrationSql = readFileSync(join(migrationsDir, file), 'utf-8');
      
      // Execute migration
      await sql.unsafe(migrationSql);
      
      // Record migration
      await sql`INSERT INTO _migrations (filename) VALUES (${file})`;
      
      console.log(`✅ ${file} - applied successfully`);
    }

    console.log('✅ All migrations applied successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigrations();
