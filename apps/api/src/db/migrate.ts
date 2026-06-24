/**
 * Migraciones al ARRANQUE de la API.
 *
 * El startCommand de render.yaml NO se auto-aplica (Render no re-lee el blueprint
 * en cada push), así que dejarlo solo ahí dejó prod con código nuevo y columnas
 * faltantes ("column kyc_status does not exist"). Para no depender del dashboard,
 * la propia API aplica las migraciones pendientes al boot: idempotente vía la
 * tabla _migrations (igual que scripts/run-migrations.mjs), solo en Postgres.
 *
 * Si una migración falla, se PROPAGA → el arranque aborta (fail-fast): mejor no
 * servir con un esquema incorrecto. Render reinicia y reintenta.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import postgres from 'postgres';
import { logger } from '../logger.js';

/**
 * Busca el directorio `migrations/` subiendo desde el cwd (robusto a cwd=raíz o
 * cwd=apps/api). Se usa cwd y no __dirname/import.meta para funcionar igual en
 * dev (tsx = ESM, sin __dirname) y en prod (tsc → CommonJS).
 */
function findMigrationsDir(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, 'migrations');
    if (existsSync(candidate) && readdirSync(candidate).some((f) => f.endsWith('.sql'))) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export async function runPendingMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith('postgres')) {
    logger.info('migrate-on-boot: DATABASE_URL no es Postgres → se omite');
    return;
  }
  const dir = findMigrationsDir();
  if (!dir) {
    logger.warn('migrate-on-boot: no se encontró el directorio migrations/ → se omite');
    return;
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`;
    const appliedRows = await sql<{ filename: string }[]>`SELECT filename FROM _migrations`;
    const applied = new Set(appliedRows.map((r) => r.filename));
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let n = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      logger.info(`migrate-on-boot: aplicando ${file}…`);
      await sql.unsafe(readFileSync(join(dir, file), 'utf-8'));
      await sql`INSERT INTO _migrations (filename) VALUES (${file})`;
      n++;
    }
    logger.info(`migrate-on-boot: ${n} migración(es) pendiente(s) aplicada(s).`);
  } finally {
    await sql.end();
  }
}
