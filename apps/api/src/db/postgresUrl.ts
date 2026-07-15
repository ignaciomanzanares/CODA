/**
 * Neon, Render y otros Postgres gestionados exigen TLS.
 * Asegura `sslmode=require` en la URL si no viene (evita errores de conexión).
 */
export function ensurePostgresSslMode(connectionString: string): string {
  const trimmed = connectionString.trim();
  if (!trimmed.startsWith("postgres")) return trimmed;
  if (!/sslmode=/i.test(trimmed)) {
    const sep = trimmed.includes("?") ? "&" : "?";
    return `${trimmed}${sep}sslmode=require`;
  }
  return trimmed;
}

/**
 * El endpoint **pooler** de Neon (`-pooler` en el hostname) usa PgBouncer en modo transaction.
 * `drizzle-kit push` / introspección a veces **se cuelgan** en "Pulling schema..." con ese host.
 * La conexión **directa** (mismo `ep-…` sin `-pooler`) suele funcionar para migraciones desde tu PC.
 */
export function neonPreferDirectHost(connectionString: string): string {
  const trimmed = connectionString.trim();
  if (!trimmed.startsWith("postgres")) return trimmed;
  try {
    const normalized = trimmed.replace(/^postgresql:/, "postgres:");
    const u = new URL(normalized);
    if (u.hostname.includes("-pooler.")) {
      u.hostname = u.hostname.replace("-pooler.", ".");
    }
    let out = u.toString();
    if (out.startsWith("postgres:") && trimmed.startsWith("postgresql:")) {
      out = "postgresql:" + out.slice("postgres:".length);
    }
    return out;
  } catch {
    return trimmed;
  }
}

/** Evita espera indefinida al abrir socket (CLI / drizzle-kit). */
export function ensurePostgresToolingQueryParams(connectionString: string): string {
  const trimmed = connectionString.trim();
  if (!trimmed.startsWith("postgres")) return trimmed;
  if (/connect_timeout=/i.test(trimmed)) return trimmed;
  const sep = trimmed.includes("?") ? "&" : "?";
  return `${trimmed}${sep}connect_timeout=15`;
}

/** URL para drizzle-kit: SSL + (Neon) host directo + connect_timeout. */
export function postgresUrlForDrizzleKit(connectionString: string): string {
  return ensurePostgresToolingQueryParams(
    neonPreferDirectHost(ensurePostgresSslMode(connectionString)),
  );
}
