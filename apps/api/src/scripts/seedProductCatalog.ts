/**
 * Seed del catálogo único de productos (Fase 1b).
 *
 * Carga apps/web/src/data/products.seed.json (los 52 productos que hoy ve el usuario) a la tabla
 * `financial_products`, que pasa a ser la fuente única (antes había 3 catálogos disjuntos:
 * productCatalog.ts en memoria, este JSON en el front, y seed.ts). Idempotente: upsert por `slug`.
 *
 * La monetización (lead/success fee) NO viene en el JSON — se rellena con DEFAULTS por categoría
 * alineados al plan de negocios CMF. Son placeholder (`data_source='placeholder'` en monetización)
 * hasta que haya acuerdos comerciales reales por institución; el dashboard admin los distingue.
 *
 * Uso: DATABASE_URL="postgresql://..." npm run db:seed-catalog -w @coda/api [-- --dry-run]
 */
import { config } from "dotenv";
import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../../.env") });

interface SeedProduct {
  id: string;
  institution: string;
  institution_logo_url: string | null;
  category: string;
  name: string;
  short_description: string;
  annual_rate_pct: number | null;
  monthly_cost_clp: number | null;
  min_income_clp: number | null;
  min_credit_score: number | null;
  tags: string[];
  source_url: string;
  last_verified: string;
  disclosure: string;
}

/** productType (notNull) derivado de la categoría del vocabulario único. */
const PRODUCT_TYPE_BY_CATEGORY: Record<string, string> = {
  creditos_consumo: "loan",
  lineas_credito: "loan",
  creditos_hipotecarios: "loan",
  portabilidad: "loan",
  tarjetas_credito: "credit_card",
  cuentas_ahorro: "account",
  depositos_plazo: "deposit",
  fondos_mutuos: "fund",
};

/**
 * Defaults de monetización por categoría (placeholder, alineados al plan de negocios CMF).
 * bps = puntos base sobre monto; flat/bonus = CLP. Reemplazar por los valores de cada contrato
 * comercial cuando existan (por eso data_source='placeholder' hasta entonces).
 */
const MONETIZATION_BY_CATEGORY: Record<
  string,
  { leadFee?: number; successFeeBps?: number; successFeeFlat?: number; activationBonus?: number }
> = {
  creditos_consumo: { leadFee: 10000, successFeeBps: 60 },
  creditos_hipotecarios: { leadFee: 10000, successFeeBps: 30 },
  portabilidad: { leadFee: 10000, successFeeBps: 40 },
  lineas_credito: { leadFee: 8000, successFeeBps: 50 },
  tarjetas_credito: { successFeeFlat: 60000, activationBonus: 30000 },
  cuentas_ahorro: { successFeeFlat: 15000, activationBonus: 30000 },
  depositos_plazo: { successFeeBps: 20 },
  fondos_mutuos: { successFeeBps: 100 },
};

async function main() {
  const dryRun = process.argv.slice(2).includes("--dry-run");

  const seedPath = path.join(__dirname, "../../../web/src/data/products.seed.json");
  const products: SeedProduct[] = JSON.parse(readFileSync(seedPath, "utf-8"));

  const { db, financialProducts, eq } = await import("../db/index.js");
  if (!db) {
    console.error("Base de datos no disponible (falta DATABASE_URL).");
    process.exit(1);
  }

  let inserted = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const p of products) {
    const monet = MONETIZATION_BY_CATEGORY[p.category] ?? {};
    const row = {
      slug: p.id,
      provider: p.institution,
      productName: p.name,
      category: p.category,
      productType: PRODUCT_TYPE_BY_CATEGORY[p.category] ?? "other",
      description: p.short_description,
      interestRate: p.annual_rate_pct ?? null,
      monthlyPayment: p.monthly_cost_clp ?? null,
      minIncome: p.min_income_clp ?? null,
      minCreditScore: p.min_credit_score ?? null,
      features: JSON.stringify(p.tags ?? []),
      requirements: null,
      externalUrl: p.source_url,
      logoUrl: p.institution_logo_url,
      disclosure: p.disclosure ?? null,
      lastVerified: p.last_verified ?? null,
      dataSource: "seed_verified",
      leadFee: monet.leadFee ?? null,
      successFeeBps: monet.successFeeBps ?? null,
      successFeeFlat: monet.successFeeFlat ?? null,
      activationBonus: monet.activationBonus ?? null,
      isActive: 1,
      priority: 50,
      updatedAt: now,
    };

    const [existing] = await db
      .select({ id: financialProducts.id })
      .from(financialProducts)
      .where(eq(financialProducts.slug, p.id));

    if (existing) {
      if (!dryRun) await db.update(financialProducts).set(row).where(eq(financialProducts.id, existing.id));
      updated++;
    } else {
      if (!dryRun) await db.insert(financialProducts).values(row);
      inserted++;
    }
  }

  console.log(
    `Catálogo: ${products.length} productos procesados → ${inserted} nuevos, ${updated} actualizados${dryRun ? " (DRY RUN, no se escribió)" : ""}.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("seedProductCatalog falló:", e);
  process.exit(1);
});
