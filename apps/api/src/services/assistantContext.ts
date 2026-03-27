/**
 * Contexto financiero para el asistente: solo datos del usuario (cuentas, gastos, metas, score).
 */
import { storage } from "../storage.js";
import type { FinancialContext } from "./aiService.js";

/** Cuenta con saldo; incluye `type` para clasificar activos/pasivos. */
type AccountWithBalance = {
  id: number;
  type?: string | null;
  balance?: { current?: string } | null;
};

function txAmount(t: { amount?: unknown }): number {
  return parseFloat(String(t?.amount ?? 0));
}

export async function buildFinancialContextForAssistant(userId: string): Promise<FinancialContext> {
  const userAccounts = await storage.getAccounts(userId);
  const accountsWithBalances: AccountWithBalance[] = await Promise.all(
    userAccounts.map(async (account) => {
      const balances = await storage.getBalances(account.id);
      const balance = balances.length > 0 ? balances[balances.length - 1] : null;
      return { ...account, balance } as AccountWithBalance;
    })
  );

  const totalBalance = accountsWithBalances.reduce(
    (sum, a) => sum + parseFloat(a.balance?.current || "0"),
    0
  );

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const allTransactions = await Promise.all(
    userAccounts.map((account: { id: number }) =>
      storage.getTransactions(account.id, { from: ninetyDaysAgo })
    )
  );
  const transactions = allTransactions.flat().filter(
    (t) => t != null && t.postedAt && new Date(t.postedAt) >= ninetyDaysAgo
  );

  const recentTransactions = transactions.filter(
    (t) => t != null && t.postedAt && new Date(t.postedAt) >= thirtyDaysAgo
  );

  const monthlyIncome = recentTransactions
    .filter((t) => txAmount(t) > 0)
    .reduce((sum, t) => sum + txAmount(t), 0);

  const monthlyExpenses = Math.abs(
    recentTransactions
      .filter((t) => txAmount(t) < 0)
      .reduce((sum, t) => sum + txAmount(t), 0)
  );

  const savingsRate =
    monthlyIncome > 0
      ? Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100)
      : 0;

  const spendingByCategory: Record<string, number> = {};
  recentTransactions
    .filter((t) => txAmount(t) < 0)
    .forEach((t) => {
      const category = (t as { category?: string }).category || "Otro";
      spendingByCategory[category] =
        (spendingByCategory[category] || 0) + Math.abs(txAmount(t));
    });

  const topSpendingCategories = Object.entries(spendingByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }));

  const creditScoreData = await storage.getCreditScore(userId);
  const goals = await storage.getFinancialGoals(userId);

  const checkingTotal = accountsWithBalances
    .filter((a) => a.type === "checking" || a.type === "depository")
    .reduce((s, a) => s + parseFloat(a.balance?.current || "0"), 0);
  const savingsTotal = accountsWithBalances
    .filter((a) => a.type === "savings")
    .reduce((s, a) => s + parseFloat(a.balance?.current || "0"), 0);
  const investmentsTotal = accountsWithBalances
    .filter((a) => a.type === "investment" || a.type === "brokerage")
    .reduce((s, a) => s + parseFloat(a.balance?.current || "0"), 0);
  const creditCardDebt = Math.abs(
    accountsWithBalances
      .filter((a) => a.type === "credit")
      .reduce((s, a) => s + parseFloat(a.balance?.current || "0"), 0)
  );
  const loansTotal = Math.abs(
    accountsWithBalances
      .filter((a) => a.type === "loan")
      .reduce((s, a) => s + parseFloat(a.balance?.current || "0"), 0)
  );

  const totalAssets = checkingTotal + savingsTotal + investmentsTotal;
  const totalLiabilities = creditCardDebt + loansTotal;
  const netWorth = totalAssets - totalLiabilities;

  return {
    totalBalance: Math.round(totalBalance),
    monthlyIncome: Math.round(monthlyIncome),
    monthlyExpenses: Math.round(monthlyExpenses),
    savingsRate,
    netWorth: Math.round(netWorth),
    creditScore: creditScoreData?.score ?? undefined,
    topSpendingCategories,
    financialGoals: goals.slice(0, 5).map((g: { name?: string; currentAmount?: number; targetAmount?: number }) => ({
      name: g?.name ?? "Meta",
      progress: Math.round(((g?.currentAmount ?? 0) / (g?.targetAmount || 1)) * 100),
    })),
  };
}
