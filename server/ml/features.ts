import { storage } from "../storage";
import type { Transaction } from "@shared/schema";

export type FeatureVector = {
  windowDays: number;
  txCount: number;
  debitCount: number;
  creditCount: number;
  totalDebits: number;     // absolute sum of negative amounts
  totalCredits: number;    // sum of positive amounts
  avgAmount: number;
  stdAmount: number;
  activeDays: number;
  debitCreditRatio: number; // |debits| / (credits + 1)
  incomeRegularity: number; // heuristic 0..1
  topCategoryShare: number; // max share by category (0..1)
};

export async function buildUserFeatureVector(userId: string, windowDays = 90): Promise<FeatureVector> {
  const accounts = await storage.getAccounts(userId);
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - windowDays);

  let txs: Transaction[] = [];
  for (const acc of accounts) {
    const accId = acc.id as number;
    const part = await storage.getTransactions(accId, { from, to, limit: undefined, offset: undefined });
    txs = txs.concat(part);
  }

  // Basic stats
  const amounts = txs.map(t => parseFloat(String(t.amount)));
  const debitAmounts = amounts.filter(a => a < 0);
  const creditAmounts = amounts.filter(a => a > 0);

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const mean = (arr: number[]) => (arr.length ? sum(arr) / arr.length : 0);
  const variance = (arr: number[]) => {
    if (!arr.length) return 0;
    const m = mean(arr);
    return mean(arr.map(x => (x - m) ** 2));
  };

  // Active days
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const activeDaySet = new Set(txs.map(t => dayKey(new Date(t.postedAt))));

  // Category distribution
  const categoryCounts = new Map<string, number>();
  for (const t of txs) {
    const key = (t.category || "uncategorized").toLowerCase();
    categoryCounts.set(key, (categoryCounts.get(key) || 0) + 1);
  }
  const maxCategoryCount = Math.max(0, ...Array.from(categoryCounts.values()));
  const topCategoryShare = txs.length ? maxCategoryCount / txs.length : 0;

  // Income regularity heuristic: look at positive transactions dispersion
  // lower std/mean -> more regular -> closer to 1
  const posMean = mean(creditAmounts);
  const posStd = Math.sqrt(variance(creditAmounts));
  let incomeRegularity = 0;
  if (creditAmounts.length >= 3 && posMean > 0) {
    const coeffVar = posStd / posMean; // lower is better
    incomeRegularity = Math.max(0, Math.min(1, 1 - coeffVar));
  }

  const fv: FeatureVector = {
    windowDays,
    txCount: txs.length,
    debitCount: debitAmounts.length,
    creditCount: creditAmounts.length,
    totalDebits: Math.abs(sum(debitAmounts)),
    totalCredits: sum(creditAmounts),
    avgAmount: mean(amounts),
    stdAmount: Math.sqrt(variance(amounts)),
    activeDays: activeDaySet.size,
    debitCreditRatio: Math.abs(sum(debitAmounts)) / (sum(creditAmounts) + 1e-6),
    incomeRegularity,
    topCategoryShare,
  };
  return fv;
}
