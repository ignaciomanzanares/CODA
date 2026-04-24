/**
 * GET /api/dashboard/summary
 *
 * Computes the four main panel cards from uploaded cartola data:
 *
 *   saldo_actual             — saldoFinal of most-recent uploaded cartola (integer CLP pesos)
 *   ingresos_promedio_mensual — mean monthly abono sum across all cartola months (integer CLP)
 *   gastos_promedio_mensual   — mean monthly cargo sum across all cartola months (integer CLP)
 *   tasa_ahorro_pct           — (ingresos - gastos) / ingresos * 100, rounded integer
 *
 * All monetary values are integer CLP pesos (Math.round applied, no fractional pesos).
 * Transactions are deduplicated by (fecha, descripcion, abono, cargo) to avoid
 * double-counting when multiple cartola uploads overlap.
 *
 * Returns 200 with zeroed values when no cartolas exist (no 404).
 */

import type { Express, Request, Response } from "express";
import { authenticate, type AuthenticatedRequest } from "./middleware/auth.js";
import { storage } from "./storage.js";
import { logger } from "./logger.js";

type RawTx = {
  fecha: string | Date;
  descripcion?: string;
  // CartolaExtraida format (documentUploadService.ts)
  abono?: number;
  cargo?: number;
  // ParseResult format (routes-scoring-documents.ts)
  tipo?: string;
  monto?: number;
};

/** Normalize a raw date value to YYYY-MM-DD string. */
function toDateStr(fecha: string | Date | undefined): string | null {
  if (!fecha) return null;
  if (fecha instanceof Date) {
    if (isNaN(fecha.getTime())) return null;
    return fecha.toISOString().slice(0, 10);
  }
  const s = String(fecha).trim();
  // DD/MM/YYYY or DD/MM/YY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmy) {
    const y = dmy[3]!.length === 2 ? `20${dmy[3]}` : dmy[3]!;
    return `${y}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  }
  // Already ISO-ish
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

export function registerDashboardRoutes(app: Express): void {
  app.get("/api/dashboard/summary", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = authReq.user?.userId;
      if (!userId) return res.status(401).json({ message: "No autorizado." });

      const cartolas = await storage.listDocumentUploadsByType(userId, "cartola");

      if (cartolas.length === 0) {
        return res.json({
          saldo_actual: 0,
          ingresos_promedio_mensual: 0,
          gastos_promedio_mensual: 0,
          tasa_ahorro_pct: 0,
          meta: { cartola_count: 0, months_analyzed: 0, data_source: "none" },
        });
      }

      // ── Deduplicate transactions across all cartolas ───────────────────────
      const seenKey = new Set<string>();
      const allTxs: Array<{ fechaStr: string; abono: number; cargo: number }> = [];

      for (const c of cartolas) {
        const pd = c.parsedData as { transacciones?: RawTx[] } | null;
        const txs: RawTx[] = pd?.transacciones ?? [];

        for (const t of txs) {
          // Support both storage formats:
          //   CartolaExtraida (documentUploadService): { abono, cargo }
          //   ParseResult     (routes-scoring-documents): { tipo, monto }
          const abono = Math.round(t.abono ?? (t.tipo === 'abono' ? (t.monto ?? 0) : 0));
          const cargo = Math.round(t.cargo ?? (t.tipo === 'cargo' ? (t.monto ?? 0) : 0));
          if (abono === 0 && cargo === 0) continue;

          const fechaStr = toDateStr(t.fecha);
          if (!fechaStr) continue;

          const key = `${fechaStr}|${(t.descripcion ?? "").trim().toLowerCase()}|${abono}|${cargo}`;
          if (seenKey.has(key)) continue;
          seenKey.add(key);

          allTxs.push({ fechaStr, abono, cargo });
        }
      }

      // ── Aggregate by calendar month (YYYY-MM) ─────────────────────────────
      const monthMap = new Map<string, { abono: number; cargo: number }>();
      for (const tx of allTxs) {
        const month = tx.fechaStr.slice(0, 7); // YYYY-MM
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

      // ── saldo_actual: saldoFinal of the most-recent cartola ───────────────
      // cartolas are returned sorted newest-first by storage
      let saldo_actual = 0;
      for (const c of cartolas) {
        const pd = c.parsedData as { saldoFinal?: number; saldo_final?: number } | null;
        const saldo = pd?.saldoFinal ?? pd?.saldo_final ?? null;
        if (saldo !== null && saldo > 0) {
          saldo_actual = Math.round(saldo);
          break;
        }
      }

      res.json({
        saldo_actual,
        ingresos_promedio_mensual: ingresos_promedio,
        gastos_promedio_mensual: gastos_promedio,
        tasa_ahorro_pct: tasa_ahorro,
        meta: {
          cartola_count: cartolas.length,
          months_analyzed: monthCount,
          data_source: "cartolas",
        },
      });
    } catch (e) {
      logger.error({ err: e }, "GET /api/dashboard/summary failed");
      res.status(500).json({ message: "Error al obtener el resumen del panel." });
    }
  });
}
