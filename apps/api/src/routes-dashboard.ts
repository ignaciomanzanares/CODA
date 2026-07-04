/**
 * GET /api/dashboard/summary
 *
 * Computes the four main panel cards from normalized cartola data:
 *
 *   saldo_actual             — saldoFinal of most-recent uploaded cartola (integer CLP pesos)
 *   ingresos_promedio_mensual — mean monthly abono sum across all cartola months (integer CLP)
 *   gastos_promedio_mensual   — mean monthly cargo sum across all cartola months (integer CLP)
 *   tasa_ahorro_pct           — (ingresos - gastos) / ingresos * 100, rounded integer
 *
 * All monetary values are integer CLP pesos (Math.round applied, no fractional pesos).
 * Transactions come from `transactions + accounts` (source of truth). parsed_data
 * is used only for the bank-reported balance snapshot.
 *
 * Returns 200 with zeroed values when no cartolas exist (no 404).
 */

import type { Express, Request, Response } from "express";
import { authenticate, type AuthenticatedRequest } from "./middleware/auth.js";
import { logger } from "./logger.js";
import { storage } from "./storage.js";

export function registerDashboardRoutes(app: Express): void {
  app.get("/api/dashboard/summary", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user?.userId;
      if (!userId) return res.status(401).json({ message: "No autorizado." });

      const { getReportedBalance, getUserNormalizedTransactions } = await import("./services/normalizedTransactions.js");
      const { isInternalTransferTx } = await import("./services/assistantContext.js");
      const cartolas = await storage.listDocumentUploadsByType(userId, "cartola");
      const { transactions } = await getUserNormalizedTransactions(userId);

      if (cartolas.length === 0 || transactions.length === 0) {
        return res.json({
          saldo_actual: 0,
          ingresos_promedio_mensual: 0,
          gastos_promedio_mensual: 0,
          tasa_ahorro_pct: 0,
          meta: { cartola_count: 0, months_analyzed: 0, data_source: "none" },
        });
      }

      // ── Aggregate by calendar month (YYYY-MM) ─────────────────────────────
      const monthMap = new Map<string, { abono: number; cargo: number }>();
      for (const tx of transactions) {
        if (isInternalTransferTx(tx)) continue;
        const month = tx.month;
        const cur = monthMap.get(month) ?? { abono: 0, cargo: 0 };
        monthMap.set(month, {
          abono: cur.abono + tx.abono,
          cargo: cur.cargo + tx.cargo,
        });
      }

      const months = [...monthMap.values()];
      const monthCount = months.length;

      const totalAbono = months.reduce((s, m) => s + m.abono, 0);
      const totalCargo = months.reduce((s, m) => s + m.cargo, 0);

      const ingresos_promedio = monthCount > 0
        ? Math.round(totalAbono / monthCount)
        : 0;
      const gastos_promedio = monthCount > 0
        ? Math.round(totalCargo / monthCount)
        : 0;
      const tasa_ahorro = ingresos_promedio > 0
        ? Math.round(((ingresos_promedio - gastos_promedio) / ingresos_promedio) * 100)
        : 0;

      // ── saldo_actual: saldoFinal reportado por la cartola más reciente ─────
      const saldo_actual = Math.round((await getReportedBalance(userId)) ?? 0);

      res.json({
        saldo_actual,
        ingresos_promedio_mensual: ingresos_promedio,
        gastos_promedio_mensual: gastos_promedio,
        tasa_ahorro_pct: tasa_ahorro,
        meta: {
          cartola_count: cartolas.length,
          months_analyzed: monthCount,
          data_source: "transactions",
        },
      });
    } catch (e) {
      logger.error({ err: e }, "GET /api/dashboard/summary failed");
      res.status(500).json({ message: "Error al obtener el resumen del panel." });
    }
  });
}
