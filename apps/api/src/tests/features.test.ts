import { describe, it, expect, beforeEach } from "vitest";
import { buildUserFeatureVector } from "../ml/features.js";
import { storage } from "../storage.js";
import type { InsertAccount, InsertTransaction } from "../schema.js";

/**
 * Aislamiento de test: la BD SQLite de dev/test es un archivo persistente (packages/data/coda.db).
 * Cada corrida usa un userId aleatorio único (ver beforeEach) para no acumular datos entre corridas.
 */
describe("Feature Engineering", () => {
  let testUserId: string;

  beforeEach(async () => {
    testUserId = `test-user-features-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Create test user
    await storage.createUser({
      id: testUserId,
      username: testUserId,
      email: `${testUserId}@example.com`,
      passwordHash: "testhash",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Create test account
    const account = await storage.createAccount({
      userId: testUserId,
      name: "Test Checking",
      type: "checking",
      currency: "USD",
    } as InsertAccount);

    // Create test transactions
    const now = new Date();
    const transactions: InsertTransaction[] = [
      // Credits (income)
      {
        accountId: account.id as number,
        postedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        description: "Salary",
        amount: 5000.00,
        currency: "USD",
        category: "income",
        pending: 0,
      },
      {
        accountId: account.id as number,
        postedAt: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString(), // 35 days ago
        description: "Salary",
        amount: 5000.00,
        currency: "USD",
        category: "income",
        pending: 0,
      },
      // Debits (expenses)
      {
        accountId: account.id as number,
        postedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        description: "Rent",
        merchantName: "Landlord LLC",
        amount: -1500.00,
        currency: "USD",
        category: "housing",
        pending: 0,
      },
      {
        accountId: account.id as number,
        postedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        description: "Groceries",
        merchantName: "Whole Foods",
        amount: -150.00,
        currency: "USD",
        category: "groceries",
        pending: 0,
      },
      {
        accountId: account.id as number,
        postedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        description: "Groceries",
        merchantName: "Whole Foods",
        amount: -145.00,
        currency: "USD",
        category: "groceries",
        pending: 0,
      },
    ];

    await storage.createTransactionsBulk(transactions);
  });

  it("should compute basic transaction statistics", async () => {
    const features = await buildUserFeatureVector(testUserId, 90);

    expect(features.txCount).toBe(5);
    expect(features.debitCount).toBe(3);
    expect(features.creditCount).toBe(2);
    expect(features.windowDays).toBe(90);
  });

  it("should calculate total credits and debits correctly", async () => {
    const features = await buildUserFeatureVector(testUserId, 90);

    // The test creates transactions for "test-user-features" but also might pick up seeded data
    // So we check that credits are at least 10000 (our 2 salary transactions)
    expect(features.totalCredits).toBeGreaterThanOrEqual(10000); 
    expect(features.totalDebits).toBeGreaterThanOrEqual(1795); // 1500 + 150 + 145
  });

  it("should compute debit-to-credit ratio", async () => {
    const features = await buildUserFeatureVector(testUserId, 90);

    const expectedRatio = 1795 / 10000;
    expect(features.debitCreditRatio).toBeCloseTo(expectedRatio, 4);
  });

  it("should count active days correctly", async () => {
    const features = await buildUserFeatureVector(testUserId, 90);

    // We have transactions on 5 different days
    expect(features.activeDays).toBeGreaterThanOrEqual(4);
  });

  it("should calculate DTI-related features", async () => {
    const features = await buildUserFeatureVector(testUserId, 90);

    expect(features.monthlyIncome).toBeGreaterThan(0);
    expect(features.monthlyDebits).toBeGreaterThan(0);
    expect(features.dti).toBeGreaterThan(0);
    expect(features.dtiCapped).toBeLessThanOrEqual(5.0);
  });

  it("should identify recurring expenses", async () => {
    const features = await buildUserFeatureVector(testUserId, 90);

    // Whole Foods appears twice, should be marked as recurring
    expect(features.recurringExpenseShare).toBeGreaterThan(0);
  });

  it("should compute top category share", async () => {
    const features = await buildUserFeatureVector(testUserId, 90);

    // We have 2 income transactions and 2 grocery transactions out of 5 total
    expect(features.topCategoryShare).toBeGreaterThanOrEqual(0.4); // 2/5
  });

  it("should handle empty transaction history", async () => {
    const emptyUser = `empty-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await storage.createUser({
      id: emptyUser,
      username: "emptyuser",
      email: "empty@example.com",
      passwordHash: "testhash",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const features = await buildUserFeatureVector(emptyUser, 90);

    expect(features.txCount).toBe(0);
    expect(features.totalCredits).toBe(0);
    expect(features.totalDebits).toBe(0);
    expect(features.activeDays).toBe(0);
  });
});
