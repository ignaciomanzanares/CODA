import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { storage } from "../storage.js";
import {
  db,
  eq,
  inArray,
  users,
  accounts,
  balances,
  transactions,
  bankConnections,
  creditScores,
  transactionalScores,
  notifications,
  documentUploads,
  scoreDocumentUploads,
  userScores,
  algorithmModelVersions,
  algorithmPredictionLogs,
  auditLogs,
  financialGoals,
  goalProgress,
  expenses,
  billSplits,
  billSplitParticipants,
  assistantSummaries,
  userAssets,
} from "../db/index.js";

/**
 * Regression test for the production bug where DELETE /api/profile/account
 * responded 200 "Account deleted successfully" but never removed the user (nor
 * most associated rows) from Postgres/Neon: the old deleteUserData only touched
 * in-memory Maps and 3 tables, leaving `users` and the rest intact.
 *
 * These tests run against the SQLite test DB (no DATABASE_URL), exercising the
 * same Drizzle `db.delete(...)` path used in production Postgres.
 */

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

async function seedUserWithData(userId: string) {
  await storage.createUser({
    id: userId,
    username: userId,
    email: `${userId}@example.com`,
    passwordHash: "testhash",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Account + transitive children (transactions, balances reference accounts.id).
  const account = await storage.createAccount({
    userId,
    name: "Test Checking",
    type: "checking",
    currency: "CLP",
  } as any);
  const accountId = account.id as number;

  await db.insert(transactions).values({
    accountId,
    postedAt: new Date().toISOString(),
    description: "Test tx",
    amount: -1000,
    currency: "CLP",
  } as any);
  await db.insert(balances).values({
    accountId,
    current: 50000,
    currency: "CLP",
  } as any);

  await db.insert(bankConnections).values({
    userId,
    bankName: "Test Bank",
    accountType: "checking",
  } as any);

  await db.insert(creditScores).values({
    userId,
    score: 700,
    paymentHistory: "good",
    utilization: "low",
    ageOfCredit: "5y",
  } as any);

  await db.insert(transactionalScores).values({
    userId,
    transactionalScore: 80,
  } as any);

  await db.insert(notifications).values({
    userId,
    title: "Hi",
    message: "msg",
    type: "info",
    category: "system",
  } as any);

  await db.insert(documentUploads).values({
    id: uid("doc"),
    userId,
    tipo: "cartola",
    parsedData: "{}",
  } as any);
  await db.insert(scoreDocumentUploads).values({
    id: uid("sdoc"),
    userId,
    tipo: "cartola",
    parsedData: "{}",
  } as any);
  await db.insert(userScores).values({
    id: uid("uscore"),
    userId,
    scoreTransaccional: 80,
  } as any);

  // algorithm_prediction_logs.model_version_id is a NOT NULL FK to
  // algorithm_model_versions — seed a model version first (per-user unique id).
  const modelVersionId = uid("mv");
  await db.insert(algorithmModelVersions).values({
    id: modelVersionId,
    modelType: "sfa",
    version: "1.0",
    deployedAt: new Date().toISOString(),
    deployedBy: "test",
  } as any);
  await db.insert(algorithmPredictionLogs).values({
    id: uid("log"),
    userId,
    requestId: uid("req"),
    kind: "transactional_sfa",
    modelVersionId,
    modelVersion: "1.0",
    modelType: "sfa",
    inputFeatures: "{}",
    outputSnapshot: "{}",
  } as any);

  await db.insert(auditLogs).values({
    userId,
    action: "login",
  } as any);

  const [goal] = await db
    .insert(financialGoals)
    .values({
      userId,
      name: "Casa",
      targetAmount: 1000000,
      targetDate: "2030-01-01",
      category: "vivienda",
    } as any)
    .returning({ id: financialGoals.id });
  await db.insert(goalProgress).values({
    goalId: goal.id,
    userId,
    amount: 1000,
  } as any);

  await db.insert(expenses).values({
    userId,
    amount: 5000,
    description: "comida",
    category: "food",
    date: new Date().toISOString(),
  } as any);

  const [split] = await db
    .insert(billSplits)
    .values({
      name: "Cena",
      totalAmount: 30000,
      date: new Date().toISOString(),
      createdBy: userId,
    } as any)
    .returning({ id: billSplits.id });
  await db.insert(billSplitParticipants).values({
    billSplitId: split.id,
    userId,
    name: "Yo",
    amountOwed: 10000,
  } as any);

  await db.insert(assistantSummaries).values({
    userId,
    summary: "resumen",
  } as any);

  await db.insert(userAssets).values({
    id: uid("asset"),
    userId,
    type: "vehiculo",
    name: "Auto",
    acquisitionCostClp: 5000000,
  } as any);

  return { accountId };
}

async function countByUser(table: any, userId: string): Promise<number> {
  const rows = await db.select().from(table).where(eq(table.userId, userId));
  return rows.length;
}

describe("storage.deleteUserData", () => {
  it("removes the user and ALL associated rows from the database", async () => {
    const userId = uid("del-user");
    const { accountId } = await seedUserWithData(userId);

    // Sanity: data exists before deletion.
    expect(await storage.getUser(userId)).toBeTruthy();
    expect(await countByUser(transactionalScores, userId)).toBe(1);

    await storage.deleteUserData(userId);

    // The user row itself is gone (the core of the production bug).
    expect(await storage.getUser(userId)).toBeUndefined();
    const remainingUsers = await db.select().from(users).where(eq(users.id, userId));
    expect(remainingUsers.length).toBe(0);

    // Every user-linked table is empty for this user.
    for (const table of [
      bankConnections,
      accounts,
      creditScores,
      transactionalScores,
      notifications,
      documentUploads,
      scoreDocumentUploads,
      userScores,
      algorithmPredictionLogs,
      auditLogs,
      financialGoals,
      goalProgress,
      expenses,
      assistantSummaries,
      userAssets,
      billSplitParticipants,
    ]) {
      expect(await countByUser(table, userId)).toBe(0);
    }
    expect((await db.select().from(billSplits).where(eq(billSplits.createdBy, userId))).length).toBe(0);

    // Transitive children (by accountId) are gone too.
    expect((await db.select().from(transactions).where(inArray(transactions.accountId, [accountId]))).length).toBe(0);
    expect((await db.select().from(balances).where(inArray(balances.accountId, [accountId]))).length).toBe(0);
  });

  it("does not delete another user's data", async () => {
    const victimId = uid("victim");
    const bystanderId = uid("bystander");
    await seedUserWithData(victimId);
    const { accountId: bystanderAccountId } = await seedUserWithData(bystanderId);

    await storage.deleteUserData(victimId);

    // Bystander is fully intact.
    expect(await storage.getUser(bystanderId)).toBeTruthy();
    expect(await countByUser(transactionalScores, bystanderId)).toBe(1);
    expect(await countByUser(creditScores, bystanderId)).toBe(1);
    expect((await db.select().from(transactions).where(inArray(transactions.accountId, [bystanderAccountId]))).length).toBe(1);
  });

  it("is idempotent: deleting an already-deleted user does not throw", async () => {
    const userId = uid("idem");
    await seedUserWithData(userId);

    await storage.deleteUserData(userId);
    await expect(storage.deleteUserData(userId)).resolves.not.toThrow();
    expect(await storage.getUser(userId)).toBeUndefined();
  });
});
