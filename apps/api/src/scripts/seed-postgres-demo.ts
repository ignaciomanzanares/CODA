/**
 * Datos de prueba para Postgres (Neon / Render) cuando las tablas están vacías.
 *
 * Uso (desde raíz del monorepo):
 *   DATABASE_URL="postgresql://..." npm run seed:demo -w @coda/api
 *
 * Opcional: asociar datos a un usuario ya registrado:
 *   SEED_USER_EMAIL="tu@email.com" DATABASE_URL="..." npm run seed:demo -w @coda/api
 *
 * Sin SEED_USER_EMAIL crea/usa usuario demo:
 *   email: demo-seed@coda.app
 *   password: DemoSeed123!
 *   id: seed-demo-coda
 */

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../../../../packages/dist/schema.js";

const { users, bankConnections, accounts, balances, transactions, creditScores } = schema;
import { ensurePostgresSslMode } from "../db/postgresUrl.js";
import { hashPassword } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../../.env") });

const DEMO_USER_ID = "seed-demo-coda";
const DEMO_EMAIL = "demo-seed@coda.app";
const DEMO_PASSWORD = "DemoSeed123!";

async function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw || (!raw.startsWith("postgres://") && !raw.startsWith("postgresql://"))) {
    console.error("❌ DATABASE_URL debe ser una URL PostgreSQL (Neon, Render, etc.).");
    process.exit(1);
  }

  const url = ensurePostgresSslMode(raw);
  const client = postgres(url, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 20,
  });
  const db = drizzle(client, { schema });

  const seedEmail = process.env.SEED_USER_EMAIL?.trim().toLowerCase();

  let userRow = seedEmail
    ? (await db.select().from(users).where(eq(users.email, seedEmail)).limit(1))[0]
    : (await db.select().from(users).where(eq(users.id, DEMO_USER_ID)).limit(1))[0];

  if (seedEmail && !userRow) {
    console.error(
      `❌ No hay usuario con email ${seedEmail}. Regístrate primero o omite SEED_USER_EMAIL para crear el demo.`,
    );
    await client.end({ timeout: 5 });
    process.exit(1);
  }

  if (!userRow) {
    console.log("Creando usuario demo…");
    const passwordHash = hashPassword(DEMO_PASSWORD);
    await db.insert(users).values({
      id: DEMO_USER_ID,
      username: "demo_seed",
      email: DEMO_EMAIL,
      passwordHash,
      firstName: "Demo",
      lastName: "Seed",
      displayName: "Usuario demo",
      role: "persona",
    });
    userRow = (await db.select().from(users).where(eq(users.id, DEMO_USER_ID)).limit(1))[0]!;
    console.log(`  → ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  }

  const userId = userRow.id;

  const existingAccounts = await db.select().from(accounts).where(eq(accounts.userId, userId));
  if (existingAccounts.length > 0) {
    let txCount = 0;
    for (const a of existingAccounts) {
      const part = await db.select().from(transactions).where(eq(transactions.accountId, a.id));
      txCount += part.length;
    }
    if (txCount > 0) {
      console.log(`✓ El usuario ${userId} ya tiene cuentas y movimientos. No se duplican datos.`);
      await client.end({ timeout: 5 });
      return;
    }
  }

  console.log("Insertando conexión, cuenta, saldos y transacciones de ejemplo…");

  const [conn] = await db
    .insert(bankConnections)
    .values({
      userId,
      bankName: "Banco Demo",
      accountType: "checking",
      status: "connected",
    })
    .returning();

  const [acc] = await db
    .insert(accounts)
    .values({
      userId,
      bankConnectionId: conn!.id,
      name: "Cuenta Corriente Demo",
      officialName: "Cuenta Corriente Demo",
      type: "depository",
      subtype: "checking",
      currency: "CLP",
      mask: "001",
      status: "active",
    })
    .returning();

  const accountId = acc!.id;
  const now = new Date().toISOString();

  await db.insert(balances).values([
    {
      accountId,
      asOf: now,
      current: 1_250_000,
      available: 1_250_000,
      currency: "CLP",
    },
  ]);

  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toISOString();
  };

  await db.insert(transactions).values([
    {
      accountId,
      postedAt: day(3),
      description: "Transferencia recibida",
      amount: 800_000,
      currency: "CLP",
      category: "income",
    },
    {
      accountId,
      postedAt: day(5),
      description: "Sueldo",
      merchantName: "Empleador Demo",
      amount: 1_200_000,
      currency: "CLP",
      category: "income",
    },
    {
      accountId,
      postedAt: day(2),
      description: "Supermercado",
      merchantName: "Jumbo",
      amount: -185_000,
      currency: "CLP",
      category: "groceries",
    },
    {
      accountId,
      postedAt: day(4),
      description: "Uber",
      merchantName: "Uber",
      amount: -12_500,
      currency: "CLP",
      category: "transportation",
    },
    {
      accountId,
      postedAt: day(1),
      description: "Restaurante",
      merchantName: "Restaurante X",
      amount: -45_000,
      currency: "CLP",
      category: "dining",
    },
  ]);

  const existingScore = await db
    .select()
    .from(creditScores)
    .where(eq(creditScores.userId, userId))
    .limit(1);
  if (existingScore.length === 0) {
    await db.insert(creditScores).values({
      userId,
      score: 720,
      maxScore: 850,
      paymentHistory: "Excellent",
      utilization: "Low",
      ageOfCredit: "Good",
    });
  }

  console.log("✓ Seed completado. Reinicia el API si estaba en ejecución.");
  await client.end({ timeout: 5 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
