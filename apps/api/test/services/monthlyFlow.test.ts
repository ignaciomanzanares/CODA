import { describe, expect, it } from "vitest";
import { buildMonthlyFlow, type MonthlyFlowTx } from "../../src/services/monthlyFlow.js";

const txs: MonthlyFlowTx[] = [
  {
    month: "2025-05",
    abono: 0,
    cargo: 12_000,
    product: "tc_internacional",
    descripcion: "Prime Video",
    category: "suscripciones",
    isInternalTransfer: false,
  },
  {
    month: "2025-06",
    abono: 2_500_000,
    cargo: 0,
    product: "checking",
    descripcion: "Pago sueldo",
    category: "ingreso_principal",
    isInternalTransfer: false,
  },
  {
    month: "2025-06",
    abono: 0,
    cargo: 480_000,
    product: "checking",
    descripcion: "Traspaso Internet a T. Crédito",
    category: "Transferencia interna",
    isInternalTransfer: true,
  },
  {
    month: "2025-06",
    abono: 480_000,
    cargo: 0,
    product: "tc_nacional",
    descripcion: "MONTO CANCELADO",
    category: "Transferencia interna",
    isInternalTransfer: true,
  },
  {
    month: "2025-06",
    abono: 0,
    cargo: 31_000,
    product: "tc_nacional",
    descripcion: "UBER",
    category: "transporte",
    isInternalTransfer: false,
  },
];

describe("buildMonthlyFlow", () => {
  it("uses data months only and does not create current-month ghosts", () => {
    const months = buildMonthlyFlow(txs, { view: "raw" });
    expect(months.map((m) => m.month)).toEqual(["2025-05", "2025-06"]);
    expect(months.map((m) => m.month)).not.toContain("2026-06");
  });

  it("can return raw movement flow while also exposing real balance", () => {
    const months = buildMonthlyFlow(txs, { view: "raw" });
    const june = months.find((m) => m.month === "2025-06")!;

    expect(june.ingresos).toBe(2_980_000);
    expect(june.egresos).toBe(511_000);
    expect(june.balance).toBe(2_469_000);
    expect(june.balanceReal).toBe(2_469_000);
  });

  it("keeps consolidated real flow as the default", () => {
    const months = buildMonthlyFlow(txs);
    const june = months.find((m) => m.month === "2025-06")!;

    expect(june.ingresos).toBe(2_500_000);
    expect(june.egresos).toBe(31_000);
    expect(june.balance).toBe(2_469_000);
  });

  it("supports filtering by product without affecting table filters", () => {
    const months = buildMonthlyFlow(txs, { view: "raw", product: "tc_internacional" });

    expect(months).toHaveLength(1);
    expect(months[0]).toMatchObject({
      month: "2025-05",
      ingresos: 0,
      egresos: 12_000,
      balance: -12_000,
    });
  });
});
