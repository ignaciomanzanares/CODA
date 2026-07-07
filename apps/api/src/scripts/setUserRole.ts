/**
 * Asigna el rol de un usuario (persona | admin) por email.
 *
 * El rol viaja en el JWT (buildAuthTokenPayload), así que cambiarlo en la DB no basta:
 * este script además invalida las sesiones activas del usuario (tokenInvalidatedAt = ahora)
 * para forzar un re-login que emita un token con el nuevo rol. Ver middleware/auth.ts:requireAdmin.
 *
 * Uso:
 *   DATABASE_URL="postgresql://..." npm run db:set-role -w @coda/api -- --email=alguien@coda.cl --role=admin
 *   (--role omitido → 'admin' por defecto)
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../../.env") });

const VALID_ROLES = new Set(["admin", "persona"]);

async function main() {
  const args = process.argv.slice(2);
  const emailArg = args.find((a) => a.startsWith("--email="))?.split("=")[1];
  const roleArg = (args.find((a) => a.startsWith("--role="))?.split("=")[1] ?? "admin").trim();

  if (!emailArg) {
    console.error("Falta --email=<correo>. Uso: --email=alguien@coda.cl [--role=admin|persona]");
    process.exit(1);
  }
  if (!VALID_ROLES.has(roleArg)) {
    console.error(`Rol inválido "${roleArg}". Válidos: ${[...VALID_ROLES].join(", ")}`);
    process.exit(1);
  }

  const { db, users, eq } = await import("../db/index.js");
  if (!db) {
    console.error("Base de datos no disponible (falta DATABASE_URL).");
    process.exit(1);
  }

  const email = emailArg.trim().toLowerCase();
  const [user] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email));
  if (!user) {
    console.error(`No existe un usuario con email ${email}.`);
    process.exit(1);
  }

  await db
    .update(users)
    .set({ role: roleArg, tokenInvalidatedAt: new Date().toISOString() })
    .where(eq(users.id, user.id));

  console.log(
    `Usuario ${email}: rol ${user.role ?? "persona"} → ${roleArg}. Sesiones invalidadas — debe volver a iniciar sesión para que el nuevo rol tome efecto.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("setUserRole falló:", e);
  process.exit(1);
});
