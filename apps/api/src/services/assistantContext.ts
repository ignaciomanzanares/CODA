/**
 * Contexto financiero enriquecido para el asistente IA.
 * Cuentas, gastos, cartolas, metas, score, deudas, transacciones recientes.
 */
import { storage } from "../storage.js";
import type { FinancialContext } from "./aiService.js";
import { isInternalTransferDesc } from "../parsers/merchantCategorizer.js";

type AccountWithBalance = {
  id: number;
  type?: string | null;
  balance?: { current?: string } | null;
};

function txAmount(t: { amount?: unknown }): number {
  return parseFloat(String(t?.amount ?? 0));
}

// Las transferencias entre cuentas propias del usuario aparecen dos veces:
// como cargo en la cuenta origen y como abono en la cuenta destino. Si las
// sumamos sin filtrar, inflan tanto "ingreso mensual" como "gasto mensual".
// Estos patrones cubren la mayoría de casos en bancos chilenos sin causar
// falsos positivos (transferencias a terceros tienen otra descripción).
//
// Consolidación entrada/salida (flujo único = entradas/salidas reales de la
// cuenta corriente + COMPRAS de tarjeta como salida, una sola vez):
//   - Fondeo de tarjeta desde la cuenta corriente es interno y se NETEA contra
//     el pago de la tarjeta. Pares de ejemplo (misma plata, dos filas):
//       CC "Traspaso Internet a T. Crédito"  ↔  TC "MONTO CANCELADO"
//       CC "Egreso por Compra de Divisas"    ↔  TC USD "ABONO DE DIVISAS"
//   - El consumo real PERMANECE: las compras de tarjeta (comercios) son gasto
//     real y el cargo recurrente "PAGO COOPEUCH" (dividendo hipotecario) es
//     gasto real → NO se netean (no calzan ninguno de los patrones de abajo).
export function isInternalTransfer(t: { description?: string; category?: string }): boolean {
  const desc = (t.description ?? "").toLowerCase();
  const cat = (t.category ?? "").toLowerCase();
  if (cat.includes("transfer") || cat.includes("traspaso")) return true;
  // Detección por glosa: fuente ÚNICA con el categorizador (pago de tarjeta /
  // MONTO CANCELADO, divisas, fondeo/pago "a T. Crédito", TRASPASO DEUDA, …),
  // para que ingesta, backfill y exclusión usen exactamente los mismos patrones.
  if (isInternalTransferDesc(t.description ?? "")) return true;
  return (
    desc.includes("transferencia a cuenta propia") ||
    desc.includes("traspaso entre cuentas") ||
    desc.includes("tef a propia") ||
    desc.includes("abono cuenta propia") ||
    desc.includes("cargo cuenta propia") ||
    desc.includes("traspaso a cuenta propia")
  );
}

// Patrón de transferencia dirigida a un TERCERO ("Transf a Juan", "Transf. de
// María", "Transferencia para ..."). Son movimientos reales y NUNCA se netean.
const THIRD_PARTY_TRANSFER_RE = /\btransf\w*\.?\s+(?:a|de|para)\s+\S/i;

// Predicado único de "transferencia interna" para transacciones PERSISTIDAS
// (cartola JSON y tabla `transactions`). Lo consumen todas las superficies que
// agregan flujo (monthly-flow, dashboard, insights) para mostrar SIEMPRE las
// mismas cifras consolidadas. Excluye SÓLO movimientos entre productos propios
// —fondeo/pago de tarjeta, "MONTO CANCELADO", compra/abono de divisas— que de
// otro modo se contarían dos veces. NO excluye transferencias a terceros
// ("Transf a <persona>"): ésas son ingresos/egresos reales.
//
// Tres señales (OR), todas conservadoras:
//   1. category === 'Transferencia interna' — etiqueta EXACTA de la taxonomía
//      nueva (jamás 'Transferencias', que es a terceros).
//   2. isInternalTransfer por glosa — patrones precisos. Se pasa SÓLO la
//      descripción (no la categoría) para no disparar el match laxo de categoría
//      de isInternalTransfer, que atraparía 'Transferencias' (terceros).
//   3. es_transferencia === true — lo marca el adaptador de tarjeta para
//      pago/fondeo/divisas (interno). OJO: el parser de la cuenta corriente
//      también marca es_transferencia en "Transf a <persona>" (terceros); por
//      eso esta señal se descarta cuando la categoría es 'Transferencias' o la
//      glosa es una transferencia dirigida a un tercero.
export function isInternalTransferTx(t: {
  description?: string;
  descripcion?: string;
  category?: string;
  categoria?: string;
  es_transferencia?: boolean;
  /** Flag autoritativo de la tabla normalizada `transactions` (snake o camel). */
  is_internal_transfer?: number | boolean;
  isInternalTransfer?: number | boolean;
}): boolean {
  // Señal autoritativa de la tabla normalizada (la marca normalizeCartola por glosa).
  if (t.is_internal_transfer === 1 || t.is_internal_transfer === true) return true;
  if (t.isInternalTransfer === 1 || t.isInternalTransfer === true) return true;
  const description = t.descripcion ?? t.description ?? "";
  // Etiqueta exacta de la taxonomía: `category` (motor nuevo) o `categoria`
  // (slug persistido en la cartola). La ingesta persiste 'Transferencia interna'.
  if (t.category === "Transferencia interna" || t.categoria === "Transferencia interna")
    return true;
  if (isInternalTransfer({ description })) return true;
  if (
    t.es_transferencia === true &&
    t.category !== "Transferencias" &&
    !THIRD_PARTY_TRANSFER_RE.test(description)
  ) {
    return true;
  }
  return false;
}

// Cache en memoria para evitar repetir N+1 queries por cada turno del chat.
const CONTEXT_TTL_MS = 5 * 60 * 1000;
const contextCache = new Map<string, { value: FinancialContext; expiresAt: number }>();

export function invalidateAssistantContext(userId: string): void {
  contextCache.delete(userId);
}

export async function buildFinancialContextForAssistant(userId: string): Promise<FinancialContext> {
  const cached = contextCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = await buildFinancialContextUncached(userId);
  contextCache.set(userId, { value, expiresAt: Date.now() + CONTEXT_TTL_MS });
  return value;
}

async function buildFinancialContextUncached(userId: string): Promise<FinancialContext> {
  const userAccounts = await storage.getAccounts(userId);
  const accountIds = userAccounts.map((account) => account.id);
  const latestBalanceByAccount = await storage.getLatestBalancesForAccounts(accountIds);
  const accountsWithBalances: AccountWithBalance[] = userAccounts.map(
    (account) =>
      ({
        ...account,
        balance: latestBalanceByAccount[account.id] ?? null,
      }) as AccountWithBalance,
  );

  const totalBalance = accountsWithBalances.reduce(
    (sum, a) => sum + parseFloat(a.balance?.current || "0"),
    0,
  );

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const transactions = (
    await storage.getTransactionsForAccounts(accountIds, { from: ninetyDaysAgo })
  ).filter((t) => t != null && t.postedAt && new Date(t.postedAt) >= ninetyDaysAgo);

  const recentTransactions = transactions.filter(
    (t) => t != null && t.postedAt && new Date(t.postedAt) >= thirtyDaysAgo,
  );

  // Filtramos transferencias entre cuentas propias para que no inflen ingreso
  // ni gasto. Ver isInternalTransfer arriba.
  const realRecent = recentTransactions.filter((t) => !isInternalTransfer(t));

  const monthlyIncome = realRecent
    .filter((t) => txAmount(t) > 0)
    .reduce((sum, t) => sum + txAmount(t), 0);

  const monthlyExpenses = Math.abs(
    realRecent.filter((t) => txAmount(t) < 0).reduce((sum, t) => sum + txAmount(t), 0),
  );

  const savingsRate =
    monthlyIncome > 0 ? Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100) : 0;

  const spendingByCategory: Record<string, number> = {};
  realRecent
    .filter((t) => txAmount(t) < 0)
    .forEach((t) => {
      const category = (t as { category?: string }).category || "Otro";
      spendingByCategory[category] = (spendingByCategory[category] || 0) + Math.abs(txAmount(t));
    });

  const topSpendingCategories = Object.entries(spendingByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }));

  const creditScoreData = await storage.getCreditScore(userId);
  const goals = await storage.getFinancialGoals(userId);
  const memorySummary = await storage.getAssistantSummary(userId);

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
      .reduce((s, a) => s + parseFloat(a.balance?.current || "0"), 0),
  );
  const loansTotal = Math.abs(
    accountsWithBalances
      .filter((a) => a.type === "loan")
      .reduce((s, a) => s + parseFloat(a.balance?.current || "0"), 0),
  );

  const totalAssets = checkingTotal + savingsTotal + investmentsTotal;
  const totalLiabilities = creditCardDebt + loansTotal;
  const netWorth = totalAssets - totalLiabilities;

  // ── Recent transactions for AI context (last 10 expenses) ──
  const recentTxForAI = realRecent
    .filter((t) => txAmount(t) < 0)
    .sort((a, b) => new Date(b.postedAt!).getTime() - new Date(a.postedAt!).getTime())
    .slice(0, 10)
    .map((t) => ({
      description: (t as { description?: string }).description || "Transacción",
      amount: Math.abs(txAmount(t)),
      category: (t as { category?: string }).category || "Otro",
      date: t.postedAt ? new Date(t.postedAt).toLocaleDateString("es-CL") : undefined,
    }));

  // ── Debts breakdown ──
  const debts: { type: string; balance: number; rate?: number }[] = [];
  if (creditCardDebt > 0) {
    debts.push({ type: "Tarjeta de crédito", balance: creditCardDebt });
  }
  if (loansTotal > 0) {
    debts.push({ type: "Préstamos", balance: loansTotal });
  }

  // ── Enrich with cartola data when fintoc is sparse ──
  let finalIncome = monthlyIncome;
  let finalExpenses = monthlyExpenses;
  let finalBalance = totalBalance;
  let finalNetWorth = netWorth;
  let finalSpendingCategories = topSpendingCategories;

  try {
    // Fuente de verdad: tabla `transactions` (no parsed_data). El saldo reportado
    // sigue siendo el único origen para "saldo actual" (snapshot del banco).
    const { getUserNormalizedTransactions, getReportedBalance } =
      await import("./normalizedTransactions.js");
    const { transactions: cartolaTxs } = await getUserNormalizedTransactions(userId);
    if (cartolaTxs.length > 0) {
      let cartolaIncome = 0;
      let cartolaExpenses = 0;
      const months = new Set<string>();
      const catTotals: Record<string, number> = {};

      const saldoFinal = await getReportedBalance(userId);
      if (saldoFinal != null && saldoFinal > 0) finalBalance = Math.max(finalBalance, saldoFinal);

      for (const t of cartolaTxs) {
        months.add(t.month);

        // Netear plomería entre productos propios (fondeo cuenta→tarjeta, pago
        // de tarjeta, divisas): la columna autoritativa is_internal_transfer lo
        // marca, así sus pagos no inflan el flujo vs las compras. Ver Task 4.
        if (isInternalTransferTx(t)) continue;

        const monto = t.tipo === "ingreso" ? t.abono : t.cargo;
        if (monto <= 0) continue;

        if (t.tipo === "ingreso") {
          cartolaIncome += monto;
        } else {
          cartolaExpenses += monto;
          catTotals[t.categoria] = (catTotals[t.categoria] ?? 0) + monto;
        }
      }

      const numMonths = Math.max(1, months.size);
      const avgCartolaIncome = Math.round(cartolaIncome / numMonths);
      const avgCartolaExpenses = Math.round(cartolaExpenses / numMonths);

      // Si fintoc tiene pocas transacciones y la cartola cubre >=2 meses,
      // confiamos en la cartola (es más completa). En cambio, si fintoc tiene
      // datos densos, sólo usamos cartola como fallback cuando supera al de
      // fintoc — evita pisar datos buenos con uno antiguo o incompleto.
      const fintocSparse = realRecent.length < 10;
      const cartolaSpansMultipleMonths = numMonths >= 2;
      const preferCartola = fintocSparse && cartolaSpansMultipleMonths;

      if (preferCartola) {
        finalIncome = avgCartolaIncome;
        finalExpenses = avgCartolaExpenses;
      } else {
        if (avgCartolaIncome > finalIncome) finalIncome = avgCartolaIncome;
        if (avgCartolaExpenses > finalExpenses) finalExpenses = avgCartolaExpenses;
      }

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

  const finalSavingsRate =
    finalIncome > 0 ? Math.round(((finalIncome - finalExpenses) / finalIncome) * 100) : savingsRate;

  return {
    totalBalance: Math.round(finalBalance),
    monthlyIncome: Math.round(finalIncome),
    monthlyExpenses: Math.round(finalExpenses),
    savingsRate: finalSavingsRate,
    netWorth: Math.round(finalNetWorth),
    creditScore: creditScoreData?.score ?? undefined,
    topSpendingCategories: finalSpendingCategories,
    recentTransactions: recentTxForAI,
    financialGoals: goals
      .slice(0, 5)
      .map((g: { name?: string; currentAmount?: number; targetAmount?: number }) => ({
        name: g?.name ?? "Meta",
        progress: Math.round(((g?.currentAmount ?? 0) / (g?.targetAmount || 1)) * 100),
      })),
    debts: debts.length > 0 ? debts : undefined,
    accountSummary:
      checkingTotal > 0 || savingsTotal > 0 || creditCardDebt > 0 || investmentsTotal > 0
        ? {
            checking: Math.round(checkingTotal),
            savings: Math.round(savingsTotal),
            credit: Math.round(creditCardDebt),
            investment: Math.round(investmentsTotal),
          }
        : undefined,
    userSummary: memorySummary?.summary,
  };
}
