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
