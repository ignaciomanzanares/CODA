/**
 * Inicialización de la base de datos para docker-compose.
 *
 * - BD virgen (no existe la tabla `users`): crea el schema completo con
 *   `drizzle-kit push`. SOLO en BD virgen: sobre una BD ya inicializada,
 *   push podría DROPear los índices que crean las migraciones (el schema
 *   Drizzle no declara índices — ver migrations/*.sql).
 * - Siempre: aplica migrations/*.sql (idempotente vía la tabla _migrations).
 *
 * Requiere devDependencies (drizzle-kit) → corre sobre el target `dev` del
 * Dockerfile. Espera DATABASE_URL (y DATABASE_URL_MIGRATE con sslmode=disable
 * para el Postgres local del compose, porque drizzle.config.ts agrega
 * sslmode=require si falta — pensado para Neon).
 */
import { spawnSync } from "node:child_process";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url || !url.startsWith("postgres")) {
  console.error("db-init: se requiere DATABASE_URL de Postgres");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
let initialized;
try {
  [{ initialized }] = await sql`SELECT to_regclass('public.users') IS NOT NULL AS initialized`;
} finally {
  await sql.end();
}

function run(cmd, args) {
  console.log(`db-init: ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!initialized) {
  console.log("db-init: BD virgen — creando schema con drizzle-kit push");
  run("npx", ["drizzle-kit", "push", "--config=./drizzle.config.ts", "--force"]);
} else {
  console.log("db-init: schema ya existe — skip push (solo migraciones)");
}

run("node", ["scripts/run-migrations.mjs"]);
console.log("db-init: OK");
