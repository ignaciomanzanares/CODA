import { describe, it, expect } from "vitest";
import {
  detectUpcomingRecurringCharges,
  type ChargeTx,
} from "../../src/services/notifications/recurringDetector.js";

// Helper: genera N cargos mensuales de un comercio, día `day`, monto `amount`,
// terminando en el mes de `lastMonth` (YYYY-MM).
function monthly(
  description: string,
  {
    day,
    amount,
    months,
    endMonth,
  }: { day: number; amount: number; months: number; endMonth: string },
): ChargeTx[] {
  const [y, m] = endMonth.split("-").map(Number) as [number, number];
  const out: ChargeTx[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, day));
    out.push({
      description,
      postedAt: d.toISOString().slice(0, 10),
      amount: -Math.abs(amount),
    });
  }
  return out;
}

const TODAY = new Date("2026-08-10T12:00:00Z");
const detect = (txs: ChargeTx[], extra = {}) =>
  detectUpcomingRecurringCharges(txs, { today: TODAY, ...extra });

describe("detectUpcomingRecurringCharges", () => {
  it("detecta una suscripción mensual limpia con próximo cobro en la ventana", () => {
    // Netflix cobra ~día 12; últimos cobros may/jun/jul 2026 → próximo 12-ago (en 2 días).
    const txs = monthly("NETFLIX.COM", { day: 12, amount: 9990, months: 3, endMonth: "2026-07" });
    const r = detect(txs);
    expect(r).toHaveLength(1);
    expect(r[0]!.merchant).toBe("NETFLIX.COM");
    expect(r[0]!.typicalAmountClp).toBe(9990);
    expect(r[0]!.typicalDay).toBe(12);
    expect(r[0]!.nextChargeDate).toBe("2026-08-12");
    expect(r[0]!.daysUntil).toBe(2);
    expect(r[0]!.cycle).toBe("2026-08");
  });

  it("NO dispara si el próximo cobro cae fuera de la ventana", () => {
    // Cobra el día 28 → próximo 28-ago, a 18 días (fuera de windowDays=4).
    const txs = monthly("SPOTIFY", { day: 28, amount: 5990, months: 4, endMonth: "2026-07" });
    expect(detect(txs)).toHaveLength(0);
  });

  it("NO dispara con montos inconsistentes (no es cobro fijo)", () => {
    const txs = [
      { description: "TIENDA X", postedAt: "2026-05-12", amount: -5000 },
      { description: "TIENDA X", postedAt: "2026-06-12", amount: -40000 },
      { description: "TIENDA X", postedAt: "2026-07-12", amount: -120000 },
    ];
    expect(detect(txs)).toHaveLength(0);
  });

  it("NO dispara con día del mes inconsistente", () => {
    const txs = [
      { description: "CAFE Y", postedAt: "2026-05-02", amount: -9990 },
      { description: "CAFE Y", postedAt: "2026-06-19", amount: -9990 },
      { description: "CAFE Y", postedAt: "2026-07-11", amount: -9990 },
    ];
    expect(detect(txs)).toHaveLength(0);
  });

  it("NO dispara con menos de minOccurrences meses", () => {
    const txs = monthly("HBO MAX", { day: 12, amount: 7990, months: 2, endMonth: "2026-07" });
    expect(detect(txs)).toHaveLength(0);
  });

  it("NO dispara si la suscripción parece cancelada (último cobro viejo)", () => {
    // Últimos cobros hasta abril; a 10-ago ya pasaron >45 días del último.
    const txs = monthly("REVISTA Z", { day: 12, amount: 4990, months: 4, endMonth: "2026-04" });
    expect(detect(txs)).toHaveLength(0);
  });

  it("NO dispara para comercios con muchos cargos por mes (consumo variable)", () => {
    // Supermercado: varios cargos el mismo mes → no es suscripción.
    const txs: ChargeTx[] = [];
    for (const month of ["2026-05", "2026-06", "2026-07"]) {
      for (const day of [3, 12, 21, 28]) {
        txs.push({
          description: "JUMBO",
          postedAt: `${month}-${String(day).padStart(2, "0")}`,
          amount: -25000,
        });
      }
    }
    expect(detect(txs)).toHaveLength(0);
  });

  it("excluye ingresos y transferencias internas", () => {
    const txs: ChargeTx[] = [
      ...monthly("SUELDO", { day: 12, amount: -1, months: 3, endMonth: "2026-07" }).map((t) => ({
        ...t,
        amount: 1_500_000, // ingreso
      })),
      ...monthly("PAGO T. CREDITO", {
        day: 12,
        amount: 200000,
        months: 3,
        endMonth: "2026-07",
      }).map((t) => ({ ...t, isInternalTransfer: true })),
    ];
    expect(detect(txs)).toHaveLength(0);
  });

  it("maneja fin de mes sin desbordar (día 31 → clamp a fin de mes)", () => {
    // Cobra el 31; en meses de 30 días cae el 30. Próximo tras 31-jul es 31-ago.
    const txs = [
      { description: "GYM", postedAt: "2026-05-31", amount: -30000 },
      { description: "GYM", postedAt: "2026-06-30", amount: -30000 },
      { description: "GYM", postedAt: "2026-07-31", amount: -30000 },
    ];
    const r = detect(txs, { windowDays: 40 });
    expect(r).toHaveLength(1);
    expect(r[0]!.nextChargeDate).toBe("2026-08-31");
  });
});
