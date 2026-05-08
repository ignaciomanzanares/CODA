/**
 * Contexto financiero enriquecido para el asistente IA.
 * Cuentas, gastos, cartolas, metas, score, deudas, transacciones recientes.
 */
import { storage } from "../storage.js";
import type { FinancialContext } from "./aiService.js";

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

  // ── Account summary by type ──
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

  // ── Recent transactions for AI context (last 10 expenses) ──
  const recentTxForAI = recentTransactions
    .filter((t) => txAmount(t) < 0)
    .sort((a, b) => new Date(b.postedAt!).getTime() - new Date(a.postedAt!).getTime())
    .slice(0, 10)
    .map((t) => ({
      description: (t as { description?: string }).description || 'Transacción',
      amount: Math.abs(txAmount(t)),
      category: (t as { category?: string }).category || 'Otro',
      date: t.postedAt ? new Date(t.postedAt).toLocaleDateString('es-CL') : undefined,
    }));

  // ── Debts breakdown ──
  const debts: { type: string; balance: number; rate?: number }[] = [];
  if (creditCardDebt > 0) {
    debts.push({ type: 'Tarjeta de crédito', balance: creditCardDebt });
  }
  if (loansTotal > 0) {
    debts.push({ type: 'Préstamos', balance: loansTotal });
  }

  // ── Enrich with cartola data when fintoc is sparse ──
  let finalIncome = monthlyIncome;
  let finalExpenses = monthlyExpenses;
  let finalBalance = totalBalance;
  let finalNetWorth = netWorth;
  let finalSpendingCategories = topSpendingCategories;

  try {
    const cartolas = await storage.listDocumentUploadsByType(userId, "cartola");
    if (cartolas.length > 0) {
      let cartolaIncome = 0;
      let cartolaExpenses = 0;
      const months = new Set<string>();
      const catTotals: Record<string, number> = {};

      for (const c of cartolas) {
        const pd = c.parsedData as { transacciones?: any[]; saldoFinal?: number; saldo_final?: number } | null;
        if (!pd) continue;

        const saldoFinal = pd.saldoFinal ?? pd.saldo_final;
        if (saldoFinal != null && saldoFinal > 0) finalBalance = Math.max(finalBalance, saldoFinal);

        for (const t of pd.transacciones ?? []) {
          const fecha = typeof t.fecha === "string" ? t.fecha.slice(0, 7) : "";
          if (fecha) months.add(fecha);

          let monto = 0;
          let esAbono = false;
          let cat = "otro";

          if ("tipo" in t && typeof t.monto === "number") {
            monto = t.monto;
            esAbono = t.tipo === "abono";
            cat = t.categoria ?? "otro";
          } else {
            const abono = t.abono ?? 0;
            const cargo = t.cargo ?? 0;
            if (abono > 0) { monto = abono; esAbono = true; }
            else { monto = cargo; esAbono = false; }
            cat = "otro";
          }

          if (monto <= 0) continue;

          if (esAbono) {
            cartolaIncome += monto;
          } else {
            cartolaExpenses += monto;
            catTotals[cat] = (catTotals[cat] ?? 0) + monto;
          }
        }
      }

      const numMonths = Math.max(1, months.size);
      const avgCartolaIncome = Math.round(cartolaIncome / numMonths);
      const avgCartolaExpenses = Math.round(cartolaExpenses / numMonths);

      if (avgCartolaIncome > finalIncome) finalIncome = avgCartolaIncome;
      if (avgCartolaExpenses > finalExpenses) finalExpenses = avgCartolaExpenses;

      if (finalSpendingCategories.length === 0 && Object.keys(catTotals).length > 0) {
        finalSpendingCategories = Object.entries(catTotals)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, total]) => ({ name, amount: Math.round(total / numMonths) }));
      }

      if (userAccounts.length === 0 && finalBalance > 0) {
        finalNetWorth = finalBalance;
      }
    }
  } catch (_e) {
    // Non-critical: continue without cartola enrichment
  }

  const finalSavingsRate = finalIncome > 0
    ? Math.round(((finalIncome - finalExpenses) / finalIncome) * 100)
    : savingsRate;

  return {
    totalBalance: Math.round(finalBalance),
    monthlyIncome: Math.round(finalIncome),
    monthlyExpenses: Math.round(finalExpenses),
    savingsRate: finalSavingsRate,
    netWorth: Math.round(finalNetWorth),
    creditScore: creditScoreData?.score ?? undefined,
    topSpendingCategories: finalSpendingCategories,
    recentTransactions: recentTxForAI,
    financialGoals: goals.slice(0, 5).map((g: { name?: string; currentAmount?: number; targetAmount?: number }) => ({
      name: g?.name ?? "Meta",
      progress: Math.round(((g?.currentAmount ?? 0) / (g?.targetAmount || 1)) * 100),
    })),
    debts: debts.length > 0 ? debts : undefined,
    accountSummary: (checkingTotal > 0 || savingsTotal > 0 || creditCardDebt > 0 || investmentsTotal > 0)
      ? { checking: Math.round(checkingTotal), savings: Math.round(savingsTotal), credit: Math.round(creditCardDebt), investment: Math.round(investmentsTotal) }
      : undefined,
  };
}
