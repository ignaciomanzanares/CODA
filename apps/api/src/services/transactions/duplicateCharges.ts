/**
 * B6 — Posibles cargos duplicados: el mismo cobro dos veces (un POS que reintentó, una
 * transferencia hecha dos veces, un PAC que corrió doble). Insumo de Billshark.
 *
 * Sólo PROPONE para revisión — nunca marca ni revierte nada. Conservador a propósito: comprar
 * dos veces lo mismo el mismo día es normal (dos cafés, dos pasajes), así que un falso positivo
 * acusa al usuario de un error que no cometió. Un par es candidato sólo si:
 *  - misma CUENTA, misma contraparte normalizada y MISMO monto exacto;
 *  - separados por ≤ `maxDaysApart` días;
 *  - el monto supera un piso (bajo eso, repetir es consumo cotidiano);
 *  - el patrón NO es habitual: si ese mismo par (contraparte + monto) se repite en ≥
 *    `habitualCycles` meses distintos, es costumbre, no un error;
 *  - NO hay un abono del mismo monto y contraparte en la ventana posterior: ya se reversó.
 */
import { isInternalTransferTx } from "../assistantContext.js";
import { counterpartyKey, counterpartyLabel } from "./recurringSeries.js";

export interface DuplicateInputTx {
  id: string;
  accountId: number;
  description: string;
  postedAt: string; // YYYY-MM-DD
  amount: number; // firmado
  isInternalTransfer?: boolean | number;
}

export interface DuplicateCandidate {
  label: string;
  accountId: number;
  amountClp: number;
  daysApart: number;
  first: { id: string; postedAt: string; description: string };
  second: { id: string; postedAt: string; description: string };
}

export interface DuplicateOptions {
  /** Días máximos entre los dos cargos (default 1: mismo día o el siguiente). */
  maxDaysApart?: number;
  /** Piso en CLP (default $10.000). */
  minAmountClp?: number;
  /** Meses distintos con el mismo par para considerarlo costumbre (default 2). */
  habitualCycles?: number;
  /** Ventana para buscar la reversa después del segundo cargo (default 15 días). */
  reversalWindowDays?: number;
  limit?: number;
}

const DAY_MS = 86_400_000;
const toTime = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getTime();
const daysBetween = (a: string, b: string) => Math.round((toTime(b) - toTime(a)) / DAY_MS);

export function detectPossibleDuplicateCharges(
  txs: DuplicateInputTx[],
  opts: DuplicateOptions = {},
): DuplicateCandidate[] {
  const maxDaysApart = opts.maxDaysApart ?? 1;
  const minAmount = opts.minAmountClp ?? 10_000;
  const habitualCycles = opts.habitualCycles ?? 2;
  const reversalWindow = opts.reversalWindowDays ?? 15;
  const limit = opts.limit ?? 20;

  const valid = txs.filter((t) => t.description && !isInternalTransferTx(t));
  const keyOf = (t: DuplicateInputTx) =>
    `${t.accountId}|${counterpartyKey(t.description)}|${Math.round(Math.abs(t.amount))}`;

  const charges = new Map<string, DuplicateInputTx[]>();
  const credits = new Map<string, DuplicateInputTx[]>();
  for (const t of valid) {
    if (Math.abs(t.amount) < minAmount) continue;
    const target = t.amount < 0 ? charges : credits;
    const k = keyOf(t);
    (target.get(k) ?? target.set(k, []).get(k)!).push(t);
  }

  const out: DuplicateCandidate[] = [];
  for (const [k, list] of charges) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.postedAt.localeCompare(b.postedAt));

    const pairs: Array<[DuplicateInputTx, DuplicateInputTx]> = [];
    for (let i = 1; i < sorted.length; i++) {
      if (daysBetween(sorted[i - 1]!.postedAt, sorted[i]!.postedAt) <= maxDaysApart) {
        pairs.push([sorted[i - 1]!, sorted[i]!]);
      }
    }
    if (pairs.length === 0) continue;

    // Costumbre: el mismo par repetido en varios meses no es un error del banco.
    const cycles = new Set(pairs.map(([a]) => a.postedAt.slice(0, 7)));
    if (cycles.size >= habitualCycles) continue;

    for (const [a, b] of pairs) {
      const reversed = (credits.get(k) ?? []).some((c) => {
        const d = daysBetween(a.postedAt, c.postedAt);
        return d >= 0 && d <= daysBetween(a.postedAt, b.postedAt) + reversalWindow;
      });
      if (reversed) continue;

      out.push({
        label: counterpartyLabel(b.description),
        accountId: a.accountId,
        amountClp: Math.round(Math.abs(a.amount)),
        daysApart: daysBetween(a.postedAt, b.postedAt),
        first: { id: a.id, postedAt: a.postedAt, description: a.description },
        second: { id: b.id, postedAt: b.postedAt, description: b.description },
      });
    }
  }

  return out.sort((x, y) => y.second.postedAt.localeCompare(x.second.postedAt)).slice(0, limit);
}
