import { isInternalTransferTx } from "./assistantContext.js";

export interface MonthlyFlowTx {
  month: string;
  abono: number;
  cargo: number;
  product?: string | null;
  description?: string;
  descripcion?: string;
  category?: string;
  categoria?: string;
  es_transferencia?: boolean;
  is_internal_transfer?: number | boolean;
  isInternalTransfer?: number | boolean;
}

export interface MonthlyFlowEntry {
  month: string;
  label: string;
  ingresos: number;
  egresos: number;
  balance: number;
  ingresosReal: number;
  egresosReal: number;
  balanceReal: number;
}

export type MonthlyFlowView = "raw" | "real";

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function labelForMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  return `${MONTH_LABELS[monthIndex] ?? month.slice(5, 7)} ${String(year).slice(2)}`;
}

export function buildMonthlyFlow(
  txs: MonthlyFlowTx[],
  opts: { view?: MonthlyFlowView; product?: string | null } = {},
): MonthlyFlowEntry[] {
  const view = opts.view ?? "real";
  const byMonth = new Map<string, { rawIn: number; rawOut: number; realIn: number; realOut: number }>();

  for (const tx of txs) {
    if (!tx.month || (opts.product && tx.product !== opts.product)) continue;
    const entry = byMonth.get(tx.month) ?? { rawIn: 0, rawOut: 0, realIn: 0, realOut: 0 };
    entry.rawIn += tx.abono;
    entry.rawOut += tx.cargo;
    if (!isInternalTransferTx(tx)) {
      entry.realIn += tx.abono;
      entry.realOut += tx.cargo;
    }
    byMonth.set(tx.month, entry);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, entry]) => {
      const ingresos = view === "raw" ? entry.rawIn : entry.realIn;
      const egresos = view === "raw" ? entry.rawOut : entry.realOut;
      return {
        month,
        label: labelForMonth(month),
        ingresos: Math.round(ingresos),
        egresos: Math.round(egresos),
        balance: Math.round(ingresos - egresos),
        ingresosReal: Math.round(entry.realIn),
        egresosReal: Math.round(entry.realOut),
        balanceReal: Math.round(entry.realIn - entry.realOut),
      };
    });
}
