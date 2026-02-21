/**
 * Seed 1–2 empresas de ejemplo para CODA Empresas (dashboard, listado, transacciones).
 * Ejecutar desde la raíz: DATABASE_URL="..." npm run seed:empresas -w @coda/api
 * o desde apps/api: DATABASE_URL="..." npx tsx src/seed-empresas.ts
 */
import "dotenv/config";
import {
  db,
  empresasCompanies,
  empresasBankAccounts,
  empresasBankTransactions,
  empresasBankBalances,
  empresasRiskScores,
} from "./db/index.js";

const now = new Date().toISOString().replace("T", " ").slice(0, 19);
const today = now.slice(0, 10);

async function main() {
  const existing = await db.select().from(empresasCompanies);
  if (existing.length >= 2) {
    console.log("Ya existen empresas. No se agregan más.");
    return;
  }

  console.log("Creando empresas de ejemplo...");

  const [c1] = await db
    .insert(empresasCompanies)
    .values({
      name: "Pyme Demo Chile SpA",
      rut: "76.123.456-7",
      industry: "Retail",
    })
    .returning({ id: empresasCompanies.id });

  const [c2] = await db
    .insert(empresasCompanies)
    .values({
      name: "Servicios Tech Ltda",
      rut: "77.987.654-3",
      industry: "Tecnología",
    })
    .returning({ id: empresasCompanies.id });

  const companyIds = [c1!.id, c2!.id].filter(Boolean) as number[];
  if (companyIds.length === 0) {
    throw new Error("No se crearon empresas");
  }

  for (let i = 0; i < companyIds.length; i++) {
    const companyId = companyIds[i];
    const base = companyId * 100;
    const accountsToCreate: { bankName: string; accountNumber: string; accountType: "checking" | "savings" | "credit"; balance: number; txns?: { amount: number; description: string; category: string }[] }[] = [
      {
        bankName: i === 0 ? "Banco Estado" : "Banco de Chile",
        accountNumber: String(base + 12345678),
        accountType: "checking",
        balance: 5_000_000 + (i + 1) * 2_000_000,
        txns: [
          { amount: 1_200_000, description: "Venta cliente", category: "ingreso" },
          { amount: -350_000, description: "Pago proveedor", category: "gasto" },
          { amount: -180_000, description: "Servicios", category: "gasto" },
        ],
      },
      {
        bankName: i === 0 ? "Banco Estado" : "Banco de Chile",
        accountNumber: String(base + 22222222),
        accountType: "savings",
        balance: 3_000_000,
      },
      {
        bankName: i === 0 ? "Banco Estado" : "Banco de Chile",
        accountNumber: `CC-${base}`,
        accountType: "credit",
        balance: -450_000,
        txns: [
          { amount: -200_000, description: "Compras oficina", category: "gasto" },
          { amount: -250_000, description: "Combustible", category: "gasto" },
        ],
      },
    ];

    for (const ac of accountsToCreate) {
      const [acc] = await db
        .insert(empresasBankAccounts)
        .values({
          companyId,
          bankName: ac.bankName,
          accountNumber: ac.accountNumber,
          accountType: ac.accountType,
          currency: "CLP",
          isActive: 1,
        })
        .returning({ id: empresasBankAccounts.id });

      if (!acc?.id) continue;

      await db.insert(empresasBankBalances).values({
        bankAccountId: acc.id,
        balanceDate: today,
        availableBalance: ac.balance,
        currentBalance: ac.balance,
      });

      for (const t of ac.txns ?? []) {
        await db.insert(empresasBankTransactions).values({
          companyId,
          bankAccountId: acc.id,
          transactionDate: today,
          postedDate: today,
          amount: t.amount,
          currency: "CLP",
          description: t.description,
          category: t.category,
          status: "posted",
        });
      }
    }

    await db.insert(empresasRiskScores).values({
      companyId,
      assessmentDate: today,
      overallScore: 72 + i * 5,
      rating: i === 0 ? "B" : "A",
      factors: JSON.stringify({ liquidity: 0.8, solvency: 0.7, activity: 0.75 }),
    });
  }

  console.log("Empresas de ejemplo creadas:", companyIds.length);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
