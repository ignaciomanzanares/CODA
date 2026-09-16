/**
 * Filas de prueba con la forma EXACTA de producción: pasan por `toNormalizedTx`, el mismo mapper
 * de getUserNormalizedTransactions. Un fixture armado a mano ya dejó pasar un bug (el detector
 * de extraordinarios saltaba todo en prod y los tests pasaban).
 */
import { toNormalizedTx, type NormalizedTx } from "../../normalizedTransactions";

let seq = 5000;

export function row(
  postedAt: string,
  amount: number,
  description: string,
  extra: { accountId?: number; internal?: boolean; extraordinary?: 0 | 1 | null } = {},
): NormalizedTx {
  const accountId = extra.accountId ?? 1;
  return toNormalizedTx(
    {
      id: ++seq,
      accountId,
      postedAt,
      amount,
      description,
      category: "otro",
      isInternalTransfer: extra.internal ? 1 : 0,
      isExtraordinary: extra.extraordinary ?? null,
    },
    { id: accountId, name: "Cuenta", subtype: "checking" },
  );
}

/** N movimientos mensuales terminando en `endMonth` (YYYY-MM); el día se acota al fin de mes. */
export function monthly(
  description: string,
  amount: number,
  day: number,
  months: number,
  endMonth: string,
  extra: Parameters<typeof row>[3] = {},
): NormalizedTx[] {
  const [y, m] = endMonth.split("-").map(Number) as [number, number];
  return Array.from({ length: months }, (_, i) => {
    const lastDay = new Date(Date.UTC(y, m - i, 0)).getUTCDate();
    const d = new Date(Date.UTC(y, m - 1 - i, Math.min(day, lastDay)));
    return row(d.toISOString().slice(0, 10), amount, description, extra);
  });
}
