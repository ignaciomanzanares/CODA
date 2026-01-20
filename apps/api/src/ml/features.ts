import { storage } from "../storage.js";
import type { Transaction } from "../schema.js";

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
  // DTI & liquidity/volatility extensions
  monthlyIncome: number;     // inferred from credits per 30d
  monthlyDebits: number;     // inferred from debits per 30d
  dti: number;               // monthlyDebits / monthlyIncome
  dtiCapped: number;         // capped dti for numerical stability
  incomeTrend30_90: number;  // last 30d income / last 90d income
  netCashflowVolatility: number; // std(daily net) / (|mean daily net| + eps)
  recurringExpenseShare: number; // share of debits from recurring merchants
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

  // DTI-style features
  const months = Math.max(1e-6, windowDays / 30);
  const totalCreditsSum = sum(creditAmounts);
  const totalDebitsAbs = Math.abs(sum(debitAmounts));
  const monthlyIncome = totalCreditsSum / months;
  const monthlyDebits = totalDebitsAbs / months;
  const dti = monthlyDebits / (monthlyIncome + 1e-6);
  const dtiCapped = Math.min(dti, 5.0);

  // Income trend (30d vs 90d)
  const toDate = to;
  const from30 = new Date(toDate.getTime());
  from30.setDate(toDate.getDate() - 30);
  const credits30 = txs
    .filter(t => parseFloat(String(t.amount)) > 0 && new Date(t.postedAt) >= from30)
    .map(t => parseFloat(String(t.amount)));
  const income30 = sum(credits30);
  const income90 = totalCreditsSum;
  const incomeTrend30_90 = income90 > 0 ? income30 / income90 : 0;

  // Daily net cashflow volatility
  const dailyMap = new Map<string, number>();
  for (const t of txs) {
    const k = dayKey(new Date(t.postedAt));
    const val = dailyMap.get(k) || 0;
    dailyMap.set(k, val + parseFloat(String(t.amount)));
  }
  const dailyVals = Array.from(dailyMap.values());
  const dailyMean = mean(dailyVals);
  const dailyStd = Math.sqrt(variance(dailyVals));
  const netCashflowVolatility = dailyStd / (Math.abs(dailyMean) + 1e-6);

  // Recurring expense share: merchants with >=2 negative transactions
  const merchantNegTotals = new Map<string, { count: number; total: number }>();
  for (const t of txs) {
    const amt = parseFloat(String(t.amount));
    if (amt < 0) {
      const key = (t.merchantName || t.description || "unknown").toLowerCase();
      const cur = merchantNegTotals.get(key) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Math.abs(amt);
      merchantNegTotals.set(key, cur);
    }
  }
  let recurringTotal = 0;
  for (const { count, total } of Array.from(merchantNegTotals.values())) {
    if (count >= 2) recurringTotal += total;
  }
  const recurringExpenseShare = totalDebitsAbs > 0 ? recurringTotal / totalDebitsAbs : 0;

  const fv: FeatureVector = {
    windowDays,
    txCount: txs.length,
    debitCount: debitAmounts.length,
    creditCount: creditAmounts.length,
    totalDebits: totalDebitsAbs,
    totalCredits: totalCreditsSum,
    avgAmount: mean(amounts),
    stdAmount: Math.sqrt(variance(amounts)),
    activeDays: activeDaySet.size,
    debitCreditRatio: totalDebitsAbs / (totalCreditsSum + 1e-6),
    incomeRegularity,
    topCategoryShare,
    monthlyIncome,
    monthlyDebits,
    dti,
    dtiCapped,
    incomeTrend30_90,
    netCashflowVolatility,
    recurringExpenseShare,
  };
  return fv;
}
