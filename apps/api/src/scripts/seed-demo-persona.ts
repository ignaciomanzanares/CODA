/**
 * Persona de DEMO pre-cargado (para el recorrido de features → venta de productos).
 *
 * Crea un usuario realista chileno con 6 meses de cartola SANA (ingreso regular >
 * gastos), patrimonio (depto con hipoteca + fondo mutuo + auto) y score crediticio,
 * de modo que el dashboard muestre score transaccional CONFIABLE, patrimonio,
 * movimientos y recomendaciones de producto. Complementa a la cuenta FRESCA que se
 * crea en vivo recorriendo el onboarding/consentimiento.
 *
 * Idempotente: si el usuario ya tiene cuentas con movimientos, no duplica.
 *
 * Uso (contra la BD que apunte DATABASE_URL — en local, el Postgres del docker):
 *   docker compose exec api npx tsx src/scripts/seed-demo-persona.ts
 *
 *   Credenciales:  demo@codafinance.cl  /  CodaDemo2026!
 */

import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../../../../packages/dist/schema.js";

const {
  users,
  bankConnections,
  accounts,
  balances,
  transactions,
  creditScores,
  userAssets,
  documentUploads,
} = schema;
import { ensurePostgresSslMode } from "../db/postgresUrl.js";
import { hashPassword } from "../middleware/auth.js";
import { encryptField } from "../services/crypto/fieldEncryption.js";

const DEMO_USER_ID = "demo-persona-camila";
const DEMO_EMAIL = "demo@codafinance.cl";
const DEMO_PASSWORD = "CodaDemo2026!";
/** Saldo líquido (buffer de emergencia realista para el perfil). */
const LIQUID_BALANCE = 9_000_000;

/** PRNG determinista (mulberry32) para montos reproducibles. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260819);
/** Entero en [min,max]. */
const ri = (min: number, max: number) => Math.round(min + rand() * (max - min));
/** Variación ±pct sobre base. */
const vary = (base: number, pct: number) => Math.round(base * (1 + (rand() * 2 - 1) * pct));

type Tx = {
  day: number; // día del mes
  description: string;
  merchantName?: string;
  amount: number; // + ingreso, − gasto
  category: string;
};

/** Genera los movimientos de UN mes (cuenta corriente, persona sana). */
function monthTransactions(): Tx[] {
  const txs: Tx[] = [];
  // Ingreso: sueldo regular (día 2, pago a mes vencido), monto casi fijo → alta
  // regularidad de ingreso. Día temprano para que el mes en curso ya tenga ingreso
  // y el resumen ingresos/gastos no salga negativo por un mes parcial sin sueldo.
  txs.push({
    day: 2,
    description: "Sueldo",
    merchantName: "Constructora Andes SpA",
    amount: vary(1_650_000, 0.02),
    category: "income",
  });
  // Ingreso menor esporádico (reembolso / honorario) algunos meses.
  if (rand() < 0.5) {
    txs.push({
      day: ri(14, 20),
      description: "Transferencia recibida",
      merchantName: "Reembolso",
      amount: ri(60_000, 180_000),
      category: "income",
    });
  }
  // Arriendo (día 5) — gasto fijo mayor.
  txs.push({
    day: 5,
    description: "Arriendo departamento",
    merchantName: "Arriendo",
    amount: -520_000,
    category: "housing",
  });
  // Servicios básicos (días 8–12).
  txs.push({
    day: 8,
    description: "Cuenta de luz",
    merchantName: "Enel",
    amount: -vary(48_000, 0.15),
    category: "utilities",
  });
  txs.push({
    day: 9,
    description: "Cuenta de agua",
    merchantName: "Aguas Andinas",
    amount: -vary(22_000, 0.12),
    category: "utilities",
  });
  txs.push({
    day: 10,
    description: "Internet hogar",
    merchantName: "VTR",
    amount: -29_990,
    category: "utilities",
  });
  txs.push({
    day: 11,
    description: "Gas",
    merchantName: "Lipigas",
    amount: -vary(19_000, 0.2),
    category: "utilities",
  });
  txs.push({
    day: 12,
    description: "Plan celular",
    merchantName: "Entel",
    amount: -19_990,
    category: "utilities",
  });
  // Supermercado (4 compras semanales).
  const superMarkets = ["Jumbo", "Lider", "Unimarc", "Santa Isabel"];
  for (let w = 0; w < 4; w++) {
    txs.push({
      day: 3 + w * 7 + ri(0, 2),
      description: "Supermercado",
      merchantName: superMarkets[w % superMarkets.length],
      amount: -ri(55_000, 92_000),
      category: "groceries",
    });
  }
  // Restaurantes / delivery (5).
  const dining = ["Restaurante Peumayen", "PedidosYa", "Uber Eats", "Café Colmado", "La Burguesía"];
  for (let i = 0; i < 5; i++) {
    txs.push({
      day: ri(2, 27),
      description: "Restaurante",
      merchantName: dining[i % dining.length],
      amount: -ri(14_000, 42_000),
      category: "dining",
    });
  }
  // Transporte (2 recargas Bip + 4 Uber/DiDi).
  txs.push({
    day: ri(2, 6),
    description: "Recarga Bip!",
    merchantName: "Metro de Santiago",
    amount: -10_000,
    category: "transportation",
  });
  txs.push({
    day: ri(15, 20),
    description: "Recarga Bip!",
    merchantName: "Metro de Santiago",
    amount: -10_000,
    category: "transportation",
  });
  for (let i = 0; i < 4; i++) {
    txs.push({
      day: ri(2, 27),
      description: "Viaje",
      merchantName: i % 2 ? "Uber" : "DiDi",
      amount: -ri(4_200, 12_800),
      category: "transportation",
    });
  }
  // Suscripciones.
  txs.push({
    day: 6,
    description: "Suscripción música",
    merchantName: "Spotify",
    amount: -5_900,
    category: "subscriptions",
  });
  txs.push({
    day: 7,
    description: "Suscripción streaming",
    merchantName: "Netflix",
    amount: -9_900,
    category: "subscriptions",
  });
  // Salud / farmacia (0–2).
  const nHealth = ri(0, 2);
  for (let i = 0; i < nHealth; i++) {
    txs.push({
      day: ri(2, 27),
      description: "Farmacia",
      merchantName: i % 2 ? "Salcobrand" : "Cruz Verde",
      amount: -ri(9_000, 38_000),
      category: "health",
    });
  }
  // Retail ocasional.
  if (rand() < 0.6) {
    txs.push({
      day: ri(10, 24),
      description: "Compra retail",
      merchantName: "Falabella",
      amount: -ri(25_000, 120_000),
      category: "shopping",
    });
  }
  return txs;
}

function isoAt(year: number, month0: number, day: number): string {
  // hora fija 12:00 para evitar cruces de día por zona horaria.
  const d = new Date(Date.UTC(year, month0, Math.min(day, 28), 12, 0, 0));
  return d.toISOString();
}

async function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw || (!raw.startsWith("postgres://") && !raw.startsWith("postgresql://"))) {
    console.error("❌ DATABASE_URL debe ser una URL PostgreSQL.");
    process.exit(1);
  }
  const client = postgres(ensurePostgresSslMode(raw), {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 20,
  });
  const db = drizzle(client, { schema });
  const now = new Date();

  // Usuario ------------------------------------------------------------------
  // firstName/lastName se guardan CIFRADOS (AES-256-GCM): storage.decryptUserPII
  // los descifra en el login y lanza si están en texto plano. displayName y email
  // NO se cifran (email se busca por igualdad en el login).
  //
  // SEED_ENCRYPT_NAMES=false → guarda los nombres como NULL (el saludo usa
  // displayName). Necesario al sembrar PROD desde una máquina con la llave DEV:
  // cifrar con la llave equivocada rompería el descifrado (login 500) en prod.
  const encryptNames = process.env.SEED_ENCRYPT_NAMES !== "false";
  const encFirst = encryptNames ? encryptField("Camila") : null;
  const encLast = encryptNames ? encryptField("Rojas Fuentes") : null;

  // Persona PRE-CARGADO: el onboarding va marcado como COMPLETO para que caiga
  // directo al dashboard. Sin esto, el gate de onboarding (FEATURES.onboarding)
  // redirige a /verificacion en cada ruta protegida y no se ve la plataforma.
  // (La cuenta FRESCA del demo se crea aparte y sí recorre el wizard en vivo.)
  const onboardingFields = {
    onboardingCompleted: 1,
    kycStatus: "mock_completed",
  } as Record<string, unknown>;

  let userRow = (await db.select().from(users).where(eq(users.id, DEMO_USER_ID)).limit(1))[0];
  if (!userRow) {
    console.log("Creando persona demo Camila…");
    await db.insert(users).values({
      id: DEMO_USER_ID,
      username: "camila_rojas",
      email: DEMO_EMAIL,
      passwordHash: hashPassword(DEMO_PASSWORD),
      firstName: encFirst,
      lastName: encLast,
      displayName: "Camila Rojas",
      role: "persona",
      ...onboardingFields,
    });
    userRow = (await db.select().from(users).where(eq(users.id, DEMO_USER_ID)).limit(1))[0]!;
    console.log(`  → ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  } else {
    // Auto-cura: re-cifra nombres, resetea clave y marca onboarding completo.
    console.log("El persona demo ya existe; re-cifrando PII y marcando onboarding…");
    await db
      .update(users)
      .set({
        firstName: encFirst,
        lastName: encLast,
        passwordHash: hashPassword(DEMO_PASSWORD),
        ...onboardingFields,
      })
      .where(eq(users.id, DEMO_USER_ID));
  }
  const userId = userRow.id;

  // Cuenta + movimientos -----------------------------------------------------
  const existing = await db.select().from(accounts).where(eq(accounts.userId, userId));
  let txCount = 0;
  for (const a of existing) {
    txCount += (await db.select().from(transactions).where(eq(transactions.accountId, a.id)))
      .length;
  }
  if (txCount > 0) {
    console.log(`✓ Ya tiene ${txCount} movimientos; no se duplican.`);
  } else {
    console.log("Insertando conexión, cuenta corriente y 6 meses de movimientos…");
    const [conn] = await db
      .insert(bankConnections)
      .values({ userId, bankName: "Banco de Chile", accountType: "checking", status: "connected" })
      .returning();
    const [acc] = await db
      .insert(accounts)
      .values({
        userId,
        bankConnectionId: conn!.id,
        name: "Cuenta Corriente",
        officialName: "Cuenta Corriente Banco de Chile",
        type: "depository",
        subtype: "checking",
        currency: "CLP",
        mask: "4821",
        status: "active",
      })
      .returning();
    const accountId = acc!.id;

    // 6 meses hacia atrás desde el mes actual (incluido).
    const rows: (typeof transactions.$inferInsert)[] = [];
    for (let back = 5; back >= 0; back--) {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const y = d.getFullYear();
      const m0 = d.getMonth();
      for (const t of monthTransactions()) {
        // No generar movimientos en el futuro (mes actual: solo hasta hoy).
        if (back === 0 && t.day > now.getDate()) continue;
        rows.push({
          accountId,
          postedAt: isoAt(y, m0, t.day),
          description: t.description,
          merchantName: t.merchantName ?? null,
          amount: t.amount,
          currency: "CLP",
          category: t.category,
        });
      }
    }
    // Insert por lotes.
    for (let i = 0; i < rows.length; i += 200) {
      await db.insert(transactions).values(rows.slice(i, i + 200));
    }

    // Saldo actual reportado (tabla balances — la usan open-banking/dashboard).
    await db.insert(balances).values({
      accountId,
      asOf: now.toISOString(),
      current: LIQUID_BALANCE,
      available: LIQUID_BALANCE,
      currency: "CLP",
    });
    console.log(`  → ${rows.length} movimientos en 6 meses.`);
  }

  // Documentos subidos (document_uploads). parsedData va en JSON plano: la lectura
  // tolera texto sin cifrar (looksEncrypted).
  const docs = await db.select().from(documentUploads).where(eq(documentUploads.userId, userId));
  const hasTipo = (tipo: string) => docs.some((d) => d.tipo === tipo);
  const end = new Date(now.getFullYear(), now.getMonth(), 0); // último día del mes previo
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  // Cartola — getReportedBalance/financial-health leen el saldo del `saldo_final`
  // de la ÚLTIMA cartola de cuenta (NO de la tabla balances); sin esto la salud
  // financiera sale "sin saldo" → crítico.
  if (!hasTipo("cartola")) {
    await db.insert(documentUploads).values({
      id: `${DEMO_USER_ID}-cartola`,
      userId,
      tipo: "cartola",
      banco: "Banco de Chile",
      periodoDesde: iso(start),
      periodoHasta: iso(end),
      parsedData: JSON.stringify({
        banco: "Banco de Chile",
        saldo_final: LIQUID_BALANCE,
        periodo: { desde: iso(start), hasta: iso(end) },
      }),
      parseStatus: "success",
      reviewStatus: "not_required",
      uploadedAt: now.toISOString(),
    });
    console.log(`  → cartola con saldo_final $${LIQUID_BALANCE.toLocaleString("es-CL")}.`);
  }

  // Informe de Deudas CMF — /api/credit-score exige un doc tipo "cmf" (success) +
  // la fila credit_scores para mostrar el score tradicional (si no: "sube tu
  // informe de deudas"). Persona sana: deuda hipotecaria vigente al día, sin mora.
  if (!hasTipo("cmf")) {
    await db.insert(documentUploads).values({
      id: `${DEMO_USER_ID}-cmf`,
      userId,
      tipo: "cmf",
      banco: "CMF",
      periodoDesde: iso(start),
      periodoHasta: iso(end),
      parsedData: JSON.stringify({
        fuente: "Informe de Deudas CMF",
        periodo: iso(end),
        deuda_directa_vigente_clp: 46_000_000, // saldo hipotecario
        deuda_directa_morosa_clp: 0,
        deuda_indirecta_clp: 0,
        numero_instituciones: 1,
        numero_operaciones: 1,
        dias_morosidad_max: 0,
      }),
      parseStatus: "success",
      reviewStatus: "not_required",
      uploadedAt: now.toISOString(),
    });
    console.log("  → informe CMF (deuda hipotecaria vigente, sin mora).");
  }

  // Patrimonio (activos) -----------------------------------------------------
  const assetRows = await db.select().from(userAssets).where(eq(userAssets.userId, userId));
  if (assetRows.length === 0) {
    console.log("Insertando patrimonio (depto con hipoteca, fondo mutuo, auto)…");
    const nowIso = new Date().toISOString();
    await db.insert(userAssets).values([
      {
        id: `${DEMO_USER_ID}-depto`,
        userId,
        type: "property",
        name: "Departamento Ñuñoa",
        acquisitionCostClp: 92_000_000,
        estimatedValueClp: 118_000_000,
        hasLien: 1,
        lienAmountClp: 46_000_000,
        currency: "CLP",
        notes: "Crédito hipotecario vigente",
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: `${DEMO_USER_ID}-fm`,
        userId,
        type: "investment",
        name: "Fondo Mutuo Renta",
        acquisitionCostClp: 6_500_000,
        estimatedValueClp: 8_200_000,
        hasLien: 0,
        lienAmountClp: null,
        currency: "CLP",
        notes: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: `${DEMO_USER_ID}-auto`,
        userId,
        type: "vehicle",
        name: "Suzuki Swift 2021",
        acquisitionCostClp: 12_000_000,
        estimatedValueClp: 8_900_000,
        hasLien: 0,
        lienAmountClp: null,
        currency: "CLP",
        notes: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ]);
    console.log("  → 3 activos (patrimonio neto ≈ $89M).");
  } else {
    console.log(`✓ Ya tiene ${assetRows.length} activos.`);
  }

  // Score crediticio ---------------------------------------------------------
  const score = await db
    .select()
    .from(creditScores)
    .where(eq(creditScores.userId, userId))
    .limit(1);
  if (score.length === 0) {
    await db.insert(creditScores).values({
      userId,
      score: 742,
      maxScore: 850,
      paymentHistory: "Excellent",
      utilization: "Low",
      ageOfCredit: "Good",
    });
    console.log("  → score crediticio 742/850.");
  }

  console.log("\n✓ Persona demo listo. Login:");
  console.log(`   ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  await client.end({ timeout: 5 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
