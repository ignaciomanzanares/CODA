import { storage } from "../storage.js";
import { MockProvider, type OBProvider } from "../connectors/openbanking/mockProvider.js";
import type { InsertAccount, InsertBalance, InsertTransaction } from "@coda/db";

/**
 * Ingest accounts, latest balance, and last 90-day transactions into storage for a given user.
 * Provider-agnostic: any OBProvider will do.
 */
export async function ingestOpenBankingForUser(userId: string, provider: OBProvider = new MockProvider()) {
  // 1) List provider accounts
  const pAccounts = await provider.listAccounts(userId);

  for (const pa of pAccounts) {
    // 2) Create or update local account
    const account: InsertAccount = {
      userId,
      bankConnectionId: null,
      providerAccountId: pa.providerAccountId,
      name: pa.name || null,
      officialName: pa.officialName || null,
      type: pa.type || null,
      subtype: pa.subtype || null,
      currency: pa.currency || null,
      mask: pa.mask || null,
      status: "active",
      openedAt: pa.openedAt || null,
    } as unknown as InsertAccount;

    // Try to find by providerAccountId; since we don't have a lookup, create blindly (demo)
    const created = await storage.createAccount(account);

    // 3) Upsert balance
    const bal = await provider.getBalance(pa.providerAccountId);
    const balance: InsertBalance = {
      accountId: created.id as number,
      asOf: bal.asOf || new Date(),
      current: String(bal.current),
      available: bal.available != null ? String(bal.available) : null,
      creditLimit: bal.creditLimit != null ? String(bal.creditLimit) : null,
      currency: bal.currency || null,
    } as unknown as InsertBalance;
    await storage.upsertBalance(balance);

    // 4) Transactions (last 90 days)
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 90);
    const pTxs = await provider.listTransactions(pa.providerAccountId, from, to);

    const items: InsertTransaction[] = pTxs.map((t: any) => ({
      accountId: created.id as number,
      externalId: t.externalId,
      postedAt: t.postedAt,
      description: t.description || null,
      merchantName: t.merchantName || null,
      amount: String(t.amount),
      currency: t.currency || null,
      category: t.category || null,
      subcategory: t.subcategory || null,
      pending: t.pending ?? false,
      raw: t.raw as any,
    })) as unknown as InsertTransaction[];

    if (items.length) {
      await storage.createTransactionsBulk(items);
    }
  }
}

// Small helper to run from CLI if needed
// Allow direct CLI execution only in CJS environments
// (tsx/ESM import path guard)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
if (typeof require !== 'undefined' && require.main === module) {
  const userId = process.argv[2] || "demo-user";
  ingestOpenBankingForUser(userId).then(() => {
    console.log(`Ingestion completed for ${userId}`);
    process.exit(0);
  }).catch((err) => {
    console.error("Ingestion error", err);
    process.exit(1);
  });
}
