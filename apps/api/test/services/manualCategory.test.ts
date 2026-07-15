import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, transactions } from "../../src/db/index.js";
import { storage } from "../../src/storage.js";
import { recategorizeUserTransactions } from "../../src/services/recategorizeTransactions.js";
import { requiresReview, MANUAL_RULE_ID } from "../../src/services/transactions/reviewStatus.js";

function unique(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function makeUserWithAccount() {
  const userId = unique("manual-user");
  await storage.createUser({
    id: userId,
    username: userId,
    email: `${userId}@example.com`,
    passwordHash: "test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const account = await storage.createAccount({
    userId,
    name: "Santander",
    type: "depository",
    subtype: "checking",
    currency: "CLP",
    status: "active",
  });
  return { userId, account };
}

describe("storage.updateTransactionCategory — corrección manual", () => {
  it("persiste categoría + subcategoría y marca metadata manual; sale de 'por revisar'", async () => {
    const { userId, account } = await makeUserWithAccount();
    const prefix = unique("score-upload");
    const [tx] = await storage.createTransactionsBulk([
      {
        accountId: account.id,
        externalId: `${prefix}:0`,
        postedAt: "2026-05-10",
        description: "COMPRA COMERCIO XYZ",
        amount: -15000,
        currency: "CLP",
        category: "otro",
        categoryConfidence: 0.2,
        categoryRuleId: "fallback.otro",
        categorizerVersion: "batch10.v3",
        isInternalTransfer: 0,
        pending: 0,
      },
    ]);
    expect(requiresReview(tx as never)).toBe(true);

    const ok = await storage.updateTransactionCategory(tx.id, userId, "alimentacion", {
      subcategory: "Supermercado",
    });
    expect(ok).toBe(true);

    const [row] = await db.select().from(transactions).where(eq(transactions.id, tx.id));
    expect(row.category).toBe("alimentacion");
    expect(row.subcategory).toBe("Supermercado");
    expect(row.categoryRuleId).toBe(MANUAL_RULE_ID);
    expect(row.categoryConfidence).toBe(1);
    expect(row.categorizerVersion).toBe("manual");
    expect(requiresReview(row as never)).toBe(false);
  });

  it("rechaza actualizar una transacción de otro usuario", async () => {
    const { account } = await makeUserWithAccount();
    const other = await makeUserWithAccount();
    const prefix = unique("score-upload");
    const [tx] = await storage.createTransactionsBulk([
      {
        accountId: account.id,
        externalId: `${prefix}:0`,
        postedAt: "2026-05-10",
        description: "X",
        amount: -1000,
        currency: "CLP",
        category: "otro",
        pending: 0,
      },
    ]);
    const ok = await storage.updateTransactionCategory(tx.id, other.userId, "alimentacion");
    expect(ok).toBe(false);
    const [row] = await db.select().from(transactions).where(eq(transactions.id, tx.id));
    expect(row.category).toBe("otro");
    expect(row.categoryRuleId).not.toBe(MANUAL_RULE_ID);
  });
});

describe("recategorizeUserTransactions — no pisa correcciones manuales", () => {
  it("salta filas manuales por defecto y las recategoriza solo con force", async () => {
    const { userId, account } = await makeUserWithAccount();
    const prefix = unique("score-upload");
    const [manualTx, autoTx] = await storage.createTransactionsBulk([
      {
        accountId: account.id,
        externalId: `${prefix}:manual`,
        postedAt: "2026-05-10",
        // Glosa que el categorizador mandaría a "servicios", pero el usuario la fijó manual.
        description: "PAGO EN LINEA T.G.R.",
        amount: -120000,
        currency: "CLP",
        category: "alimentacion",
        categoryConfidence: 1,
        categoryRuleId: MANUAL_RULE_ID,
        categorizerVersion: "manual",
        isInternalTransfer: 0,
        pending: 0,
      },
      {
        accountId: account.id,
        externalId: `${prefix}:auto`,
        postedAt: "2026-05-11",
        description: "PAGO EN LINEA T.G.R.",
        amount: -120000,
        currency: "CLP",
        category: "otro",
        categoryConfidence: 0.2,
        categoryRuleId: "fallback.otro",
        categorizerVersion: "batch10.v1",
        isInternalTransfer: 0,
        pending: 0,
      },
    ]);

    const result = await recategorizeUserTransactions(userId);
    expect(result.skippedManual).toBe(1);

    // Manual intacta.
    const [manual] = await db.select().from(transactions).where(eq(transactions.id, manualTx.id));
    expect(manual.category).toBe("alimentacion");
    expect(manual.categoryRuleId).toBe(MANUAL_RULE_ID);
    // Automática sí se recategoriza.
    const [auto] = await db.select().from(transactions).where(eq(transactions.id, autoTx.id));
    expect(auto.category).toBe("servicios");
    expect(auto.categoryRuleId).toBe("cl.impuestos.tgr");

    // Con force, la manual también se recategoriza.
    const forced = await recategorizeUserTransactions(userId, { force: true });
    expect(forced.skippedManual).toBe(0);
    const [manualAfter] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, manualTx.id));
    expect(manualAfter.category).toBe("servicios");
    expect(manualAfter.categoryRuleId).toBe("cl.impuestos.tgr");
  });
});
