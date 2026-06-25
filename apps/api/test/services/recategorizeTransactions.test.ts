import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, transactions } from "../../src/db/index.js";
import { storage } from "../../src/storage.js";
import { recategorizeUserTransactions } from "../../src/services/recategorizeTransactions.js";
import { CATEGORIZER_VERSION } from "../../src/parsers/merchantCategorizer.js";

function unique(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("recategorizeUserTransactions", () => {
  it("updates only categorization fields for the authenticated user's normalized transactions", async () => {
    const userId = unique("recategorize-user");
    const otherUserId = unique("recategorize-other");

    await storage.createUser({
      id: userId,
      username: userId,
      email: `${userId}@example.com`,
      passwordHash: "test",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await storage.createUser({
      id: otherUserId,
      username: otherUserId,
      email: `${otherUserId}@example.com`,
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
    const otherAccount = await storage.createAccount({
      userId: otherUserId,
      name: "Santander",
      type: "depository",
      subtype: "checking",
      currency: "CLP",
      status: "active",
    });

    const externalPrefix = unique("score-upload");
    const inserted = await storage.createTransactionsBulk([
      {
        accountId: account.id,
        externalId: `${externalPrefix}:tgr`,
        postedAt: "2026-05-10",
        description: "PAGO EN LINEA T.G.R.",
        amount: -120000,
        currency: "CLP",
        category: "otro",
        subcategory: "legacy",
        categoryConfidence: 0.2,
        categoryRuleId: "fallback.otro",
        categorizerVersion: "batch10.v1",
        isInternalTransfer: 0,
        sourceDocumentId: "score-doc-user",
        originalAmount: 120000,
        originalCurrency: "CLP",
        amountClp: -120000,
        fxRate: 1,
        pending: 0,
      },
      {
        accountId: account.id,
        externalId: `${externalPrefix}:amazon`,
        postedAt: "2026-05-11",
        description: "AMZN PRIME VIDEO",
        amount: -9990,
        currency: "CLP",
        category: "otro",
        categoryConfidence: null,
        categoryRuleId: null,
        categorizerVersion: null,
        isInternalTransfer: 0,
        sourceDocumentId: "score-doc-user",
        pending: 0,
      },
      {
        accountId: account.id,
        externalId: `${externalPrefix}:internal`,
        postedAt: "2026-05-12",
        description: "MONTO CANCELADO",
        amount: 480947,
        currency: "CLP",
        category: "otro",
        categoryConfidence: null,
        categoryRuleId: null,
        categorizerVersion: null,
        isInternalTransfer: 1,
        sourceDocumentId: "score-doc-user",
        pending: 0,
      },
      {
        accountId: otherAccount.id,
        externalId: `${externalPrefix}:other`,
        postedAt: "2026-05-10",
        description: "PAGO EN LINEA T.G.R.",
        amount: -120000,
        currency: "CLP",
        category: "otro",
        categoryConfidence: 0.2,
        categoryRuleId: "fallback.otro",
        categorizerVersion: "batch10.v1",
        isInternalTransfer: 0,
        sourceDocumentId: "score-doc-other",
        pending: 0,
      },
    ]);

    const before = inserted[0];
    const result = await recategorizeUserTransactions(userId);

    expect(result).toEqual({ scanned: 3, updated: 3, version: CATEGORIZER_VERSION });

    const [tgr] = await db.select().from(transactions).where(eq(transactions.id, inserted[0].id));
    expect(tgr.category).toBe("servicios");
    expect(tgr.subcategory).toBeNull();
    expect(tgr.categoryConfidence).toBe(0.9);
    expect(tgr.categoryRuleId).toBe("cl.impuestos.tgr");
    expect(tgr.categorizerVersion).toBe(CATEGORIZER_VERSION);
    expect(tgr.amount).toBe(before.amount);
    expect(tgr.postedAt).toBe(before.postedAt);
    expect(tgr.description).toBe(before.description);
    expect(tgr.accountId).toBe(before.accountId);
    expect(tgr.externalId).toBe(before.externalId);
    expect(tgr.sourceDocumentId).toBe(before.sourceDocumentId);
    expect(tgr.isInternalTransfer).toBe(before.isInternalTransfer);
    expect(tgr.originalAmount).toBe(before.originalAmount);
    expect(tgr.originalCurrency).toBe(before.originalCurrency);
    expect(tgr.amountClp).toBe(before.amountClp);
    expect(tgr.fxRate).toBe(before.fxRate);

    const [amazon] = await db.select().from(transactions).where(eq(transactions.id, inserted[1].id));
    expect(amazon.category).toBe("suscripciones");
    expect(amazon.categoryRuleId).toBe("cl.suscripciones");
    expect(amazon.categorizerVersion).toBe(CATEGORIZER_VERSION);

    const [internal] = await db.select().from(transactions).where(eq(transactions.id, inserted[2].id));
    expect(internal.category).toBe("Transferencia interna");
    expect(internal.categoryRuleId).toBe("transfer.interna");
    expect(internal.isInternalTransfer).toBe(1);

    const [other] = await db.select().from(transactions).where(eq(transactions.id, inserted[3].id));
    expect(other.category).toBe("otro");
    expect(other.categoryRuleId).toBe("fallback.otro");
    expect(other.categorizerVersion).toBe("batch10.v1");
  });
});
