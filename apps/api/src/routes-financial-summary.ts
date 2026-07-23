import type { Express } from "express";
import { storage } from "./storage.js";

import { authenticate } from "./middleware/auth.js";

import { logger } from "./logger.js";

import { getUserIdFromAuth } from "./routes-shared.js";

export async function registerFinancialSummaryRoutes(app: Express): Promise<void> {
  // ==========================================================================
  // FINANCIAL SUMMARY & DASHBOARD DATA
  // ==========================================================================

  /**
   * GET /api/financial-summary
   * Comprehensive financial overview for dashboard
   * Returns: accounts by type, balances, net worth, trends, cash flow
   */
  app.get("/api/financial-summary", authenticate, async (req, res) => {
    try {
      const userId = getUserIdFromAuth(req);

      // Get all accounts for user
      const userAccounts = await storage.getAccounts(userId);

      // Bulk-fetch latest balances (single query instead of one per account)
      const accountIds = userAccounts.map((a: { id: number }) => a.id);
      const latestBalanceByAccount = await storage.getLatestBalancesForAccounts(accountIds);
      const accountsWithBalances = userAccounts.map(
        (account: {
          id: number;
          type?: string;
          subtype?: string;
          name?: string;
          officialName?: string;
          bankConnectionId?: number;
        }) => ({
          ...account,
          balance: latestBalanceByAccount[account.id] ?? null,
        }),
      );

      // Categorize accounts
      const accountsByType = {
        checking: accountsWithBalances.filter(
          (a: any) => a.type === "checking" || a.type === "depository",
        ),
        savings: accountsWithBalances.filter((a: any) => a.type === "savings"),
        creditCards: accountsWithBalances.filter(
          (a: any) => a.type === "credit" || a.subtype === "credit card",
        ),
        loans: accountsWithBalances.filter(
          (a: any) => a.type === "loan" || a.subtype === "line of credit",
        ),
        investments: accountsWithBalances.filter(
          (a: any) => a.type === "investment" || a.type === "brokerage",
        ),
      };

      // Calculate totals
      const calculateTotal = (accounts: any[]) =>
        accounts.reduce((sum: number, a: any) => sum + parseFloat(a.balance?.current || "0"), 0);

      const checkingTotal = calculateTotal(accountsByType.checking);
      const savingsTotal = calculateTotal(accountsByType.savings);
      const investmentsTotal = calculateTotal(accountsByType.investments);
      const creditCardDebt = Math.abs(calculateTotal(accountsByType.creditCards));
      const loansTotal = Math.abs(calculateTotal(accountsByType.loans));

      const totalAssets = checkingTotal + savingsTotal + investmentsTotal;
      const totalLiabilities = creditCardDebt + loansTotal;
      const netWorth = totalAssets - totalLiabilities;

      // Activos declarados por el usuario (propiedad, vehículo, cripto, etc.).
      // Son patrimonio igual que los saldos bancarios, pero viven en otra tabla;
      // se suman al net worth para que el "Patrimonio neto" del panel sea real y
      // no solo bancario. La salud financiera calcula su ratio deuda/activos
      // aparte con estos mismos activos, así que no hay doble conteo.
      let declaredAssetsTotal = 0;
      try {
        const { db, userAssets, eq } = await import("./db/index.js");
        const assetRows = await db.select().from(userAssets).where(eq(userAssets.userId, userId));
        declaredAssetsTotal = assetRows.reduce(
          (sum: number, r: any) => sum + Number(r.estimatedValueClp ?? r.acquisitionCostClp ?? 0),
          0,
        );
      } catch (assetErr) {
        logger.warn({ assetErr }, "Failed to load declared assets for net worth");
      }

      // ANCLAJE TEMPORAL: las ventanas de "últimos N días/meses" se anclan a la
      // ÚLTIMA fecha con datos del usuario, NO a hoy. Así una cartola histórica
      // (p. ej. may/jun 2025) sigue mostrando ingresos/gastos/tendencias en lugar de
      // devolver 0 sólo porque hoy es 2026. Sin transacciones → anchor = hoy (estado vacío).
      const allUserTx = await storage.getTransactionsForAccounts(accountIds);
      const { latestPostedAt } = await import("./services/dashboard/anchorDate.js");
      const anchorDate = latestPostedAt(allUserTx) ?? new Date();

      // Transacciones de los últimos 90 días CON DATOS (relativo al anchor).
      const ninetyDaysAgo = new Date(anchorDate);
      ninetyDaysAgo.setDate(anchorDate.getDate() - 90);
      const transactions = allUserTx.filter(
        (t: { postedAt?: string | null }) =>
          t?.postedAt != null && new Date(t.postedAt) >= ninetyDaysAgo,
      );

      // Flujo consolidado: descarta transferencias entre productos propios para
      // que ingreso/gasto/categorías no se cuenten doble (mismo predicado que
      // monthly-flow / insights). Las transferencias a terceros se conservan.
      const { isInternalTransferTx } = await import("./services/assistantContext.js");

      // Ingreso/gasto del último mes CON DATOS (30 días relativos al anchor, no a hoy).
      const thirtyDaysAgo = new Date(anchorDate);
      thirtyDaysAgo.setDate(anchorDate.getDate() - 30);
      const recentTransactions = transactions.filter(
        (t: any) =>
          t != null &&
          t.postedAt &&
          new Date(t.postedAt) >= thirtyDaysAgo &&
          !isInternalTransferTx(t),
      );

      const txAmount = (t: any) => parseFloat(String(t?.amount ?? 0));
      const monthlyIncome = recentTransactions
        .filter((t: any) => txAmount(t) > 0)
        .reduce((sum: number, t: any) => sum + txAmount(t), 0);

      const monthlyExpenses = Math.abs(
        recentTransactions
          .filter((t: any) => txAmount(t) < 0)
          .reduce((sum: number, t: any) => sum + txAmount(t), 0),
      );

      const savingsRate =
        monthlyIncome > 0
          ? Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100)
          : 0;

      // Vista BRUTA (últimos 30 días): TODO lo que aparece en cartolas, incluidas las
      // transferencias internas (pagos de tarjeta, divisas). La vista REAL de arriba
      // (monthlyIncome/Expenses) las excluye para no inflar ingresos/gastos del score.
      const windowTx = transactions.filter(
        (t: any) => t != null && t.postedAt && new Date(t.postedAt) >= thirtyDaysAgo,
      );
      const grossIncome = windowTx
        .filter((t: any) => txAmount(t) > 0)
        .reduce((s: number, t: any) => s + txAmount(t), 0);
      const grossExpenses = Math.abs(
        windowTx
          .filter((t: any) => txAmount(t) < 0)
          .reduce((s: number, t: any) => s + txAmount(t), 0),
      );
      const gross = {
        income: Math.round(grossIncome),
        expenses: Math.round(grossExpenses),
        balance: Math.round(grossIncome - grossExpenses),
      };

      // Spending by category (last 30 days)
      const spendingByCategory: Record<string, number> = {};
      recentTransactions
        .filter((t: any) => txAmount(t) < 0)
        .forEach((t: any) => {
          const category = t?.category || "Other";
          spendingByCategory[category] =
            (spendingByCategory[category] || 0) + Math.abs(txAmount(t));
        });

      // Últimos 6 meses calendario TERMINANDO en el mes de la última cartola (anchor),
      // no en el mes actual: así no se inventan meses vacíos entre la última cartola y hoy.
      // Patrimonio: mismo valor actual por mes (no hay series históricas de saldos en BD).
      const netWorthTrend: {
        month: string;
        netWorth: number;
        assets: number;
        liabilities: number;
      }[] = [];
      const cashFlowTrend: { month: string; income: number; expenses: number }[] = [];
      const now = anchorDate;
      for (let i = 5; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
        const monthLabelNw = monthStart.toLocaleDateString("es-CL", {
          month: "short",
          year: "2-digit",
        });
        const monthLabelCf = monthStart.toLocaleDateString("es-CL", { month: "short" });
        const inMonth = transactions.filter(
          (t: any) =>
            t != null &&
            t.postedAt &&
            new Date(t.postedAt) >= monthStart &&
            new Date(t.postedAt) <= monthEnd &&
            !isInternalTransferTx(t),
        );
        const inc = inMonth
          .filter((t: any) => txAmount(t) > 0)
          .reduce((s: number, t: any) => s + txAmount(t), 0);
        const exp = Math.abs(
          inMonth
            .filter((t: any) => txAmount(t) < 0)
            .reduce((s: number, t: any) => s + txAmount(t), 0),
        );
        cashFlowTrend.push({
          month: monthLabelCf,
          income: Math.round(inc),
          expenses: Math.round(exp),
        });
        netWorthTrend.push({
          month: monthLabelNw,
          netWorth: Math.round(netWorth),
          assets: Math.round(totalAssets),
          liabilities: Math.round(totalLiabilities),
        });
      }

      // Top spending categories
      const topCategories = Object.entries(spendingByCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, amount]) => ({
          name,
          amount: Math.round(amount * 100) / 100,
          percentage: monthlyExpenses > 0 ? Math.round((amount / monthlyExpenses) * 100) || 0 : 0,
        }));

      // --- Legacy fallback: only when there are no normalized accounts yet ---
      let finalTotalBalance = Math.round(checkingTotal + savingsTotal);
      let finalMonthlyIncome = Math.round(monthlyIncome);
      let finalMonthlyExpenses = Math.round(monthlyExpenses);
      let finalSavingsRate = savingsRate;
      let finalNetWorth = Math.round(netWorth);
      let finalTotalAssets = Math.round(totalAssets);
      const finalTotalLiabilities = Math.round(totalLiabilities);
      const docAccountCount = userAccounts.length;

      if (userAccounts.length === 0) {
        try {
          const { isInternalTransferTx } = await import("./services/assistantContext.js");
          const cartolas = await storage.listDocumentUploadsByType(userId, "cartola");
          if (cartolas.length > 0) {
            // Legacy parsed_data fallback for old, non-backfilled cartolas.
            interface RawTx {
              fecha: string;
              cargo: number;
              abono: number;
              saldo?: number;
              descripcion?: string;
              categoria?: string;
              es_transferencia?: boolean;
            }
            const seenDoc = new Set<string>();
            const allRaw: RawTx[] = [];
            for (const c of cartolas) {
              const pd = c.parsedData as { transacciones?: RawTx[] } | null;
              for (const t of pd?.transacciones ?? []) {
                if (isInternalTransferTx(t)) continue;
                const key = `${t.fecha}|${(t.descripcion ?? "").trim().toLowerCase()}|${t.abono ?? 0}|${t.cargo ?? 0}`;
                if (seenDoc.has(key)) continue;
                seenDoc.add(key);
                allRaw.push(t);
              }
            }

            // Determine the most recent month that has transaction data
            const txDates = allRaw
              .map((t) => {
                try {
                  return new Date(t.fecha);
                } catch {
                  return null;
                }
              })
              .filter((d): d is Date => d != null && !isNaN(d.getTime()));

            let windowStart: Date;
            let windowEnd: Date;
            if (txDates.length > 0) {
              // Use the latest transaction date as the "end" of the window
              const latestTxDate = new Date(Math.max(...txDates.map((d) => d.getTime())));
              windowEnd = new Date(
                latestTxDate.getFullYear(),
                latestTxDate.getMonth() + 1,
                0,
                23,
                59,
                59,
              );
              windowStart = new Date(latestTxDate.getFullYear(), latestTxDate.getMonth(), 1);
            } else {
              // Fallback to last 30 days from today
              windowEnd = new Date();
              windowStart = new Date();
              windowStart.setDate(windowStart.getDate() - 30);
            }

            let docIncome = 0;
            let docExpenses = 0;
            for (const tx of allRaw) {
              let txDate: Date | null = null;
              try {
                txDate = new Date(tx.fecha);
              } catch {
                /* skip */
              }
              const inWindow =
                txDate && !isNaN(txDate.getTime()) && txDate >= windowStart && txDate <= windowEnd;
              if (inWindow) {
                docIncome += tx.abono ?? 0;
                docExpenses += tx.cargo ?? 0;
              }
            }

            // Use saldoFinal from the most recent cartola as balance
            const latestCartola = cartolas[0] as any;
            const latestSaldoFinal: number = (latestCartola?.parsedData as any)?.saldoFinal ?? 0;

            const docSavingsRate =
              docIncome > 0 ? Math.round(((docIncome - docExpenses) / docIncome) * 100) : 0;

            finalTotalBalance = Math.round(latestSaldoFinal);
            finalTotalAssets = Math.round(latestSaldoFinal);
            finalMonthlyIncome = Math.round(docIncome);
            finalMonthlyExpenses = Math.round(docExpenses);
            finalSavingsRate = docSavingsRate;
            finalNetWorth = Math.round(latestSaldoFinal);
            // docAccountCount stays 0 so frontend knows there are no linked bank accounts
          }
        } catch (docErr) {
          logger.warn({ docErr }, "Failed to augment financial-summary from cartola data");
        }
      }
      // -----------------------------------------------------------------------

      // Sumar los activos declarados al patrimonio, consistente tanto con la ruta
      // normal como con el fallback legacy de arriba (que reescribe los finales).
      const roundedDeclaredAssets = Math.round(declaredAssetsTotal);
      finalTotalAssets += roundedDeclaredAssets;
      finalNetWorth += roundedDeclaredAssets;

      res.json({
        summary: {
          totalBalance: finalTotalBalance,
          totalAssets: finalTotalAssets,
          totalLiabilities: finalTotalLiabilities,
          netWorth: finalNetWorth,
          declaredAssets: roundedDeclaredAssets,
          monthlyIncome: finalMonthlyIncome,
          monthlyExpenses: finalMonthlyExpenses,
          savingsRate: finalSavingsRate,
          accountCount: docAccountCount,
          // Vista bruta (incluye transferencias internas) vs real (las excluye, arriba).
          gross,
        },
        accountsByType: {
          checking: {
            count: accountsByType.checking.length,
            total: Math.round(checkingTotal),
            accounts: accountsByType.checking.map((a: any) => ({
              id: a.id,
              name: a.name || a.officialName,
              balance: parseFloat(a.balance?.current || "0"),
              institution: a.bankConnectionId,
            })),
          },
          savings: {
            count: accountsByType.savings.length,
            total: Math.round(savingsTotal),
            accounts: accountsByType.savings.map((a: any) => ({
              id: a.id,
              name: a.name || a.officialName,
              balance: parseFloat(a.balance?.current || "0"),
            })),
          },
          creditCards: {
            count: accountsByType.creditCards.length,
            total: Math.round(creditCardDebt),
            accounts: accountsByType.creditCards.map((a: any) => ({
              id: a.id,
              name: a.name || a.officialName,
              balance: Math.abs(parseFloat(a.balance?.current || "0")),
              limit: parseFloat(a.balance?.creditLimit || "0"),
            })),
          },
          loans: {
            count: accountsByType.loans.length,
            total: Math.round(loansTotal),
            accounts: accountsByType.loans.map((a: any) => ({
              id: a.id,
              name: a.name || a.officialName,
              balance: Math.abs(parseFloat(a.balance?.current || "0")),
            })),
          },
          investments: {
            count: accountsByType.investments.length,
            total: Math.round(investmentsTotal),
            accounts: accountsByType.investments.map((a: any) => ({
              id: a.id,
              name: a.name || a.officialName,
              balance: parseFloat(a.balance?.current || "0"),
            })),
          },
        },
        trends: {
          netWorth: netWorthTrend,
          cashFlow: cashFlowTrend,
        },
        spending: {
          total: Math.round(monthlyExpenses),
          byCategory: topCategories,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching financial summary");
      res.status(500).json({ message: "Failed to fetch financial summary" });
    }
  });
}
