import { describe, it, expect } from "vitest";
import { counterpartyLabel, detectRecurringSeries } from "../recurringSeries";
import { monthly, row } from "./testRows";

const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe("counterpartyLabel", () => {
  it("saca RUT (con y sin puntos), número de cuenta y el prefijo de transferencia", () => {
    expect(counterpartyLabel("76.543.210-3 Transf. SERVI TELE")).toBe("SERVI TELE");
    expect(counterpartyLabel("076543210K Transf. EJEMPLO SPA")).toBe("EJEMPLO SPA");
    expect(counterpartyLabel("Transf a ARRIENDO DEMO")).toBe("ARRIENDO DEMO");
    expect(counterpartyLabel("O.Gerencia 0123456789 Transf a PERSONA DEMO")).toBe("PERSONA DEMO");
    expect(counterpartyLabel("NETFLIX.COM")).toBe("NETFLIX.COM");
  });
});

describe("detectRecurringSeries — egresos (suscripciones y cobros fijos)", () => {
  it("detecta una suscripción de monto fijo, activa", () => {
    const inv = detectRecurringSeries([
      ...monthly("NETFLIX.COM", -9_990, 15, 5, "2026-05"),
      row("2026-05-20", -25_000, "SUPERMERCADO DEMO"),
    ]);
    const netflix = inv.charges.find((c) => c.label === "NETFLIX.COM");
    expect(netflix).toMatchObject({
      typicalAmountClp: 9_990,
      typicalDay: 15,
      occurrences: 5,
      active: true,
      fixedAmount: true,
    });
    expect(netflix!.transactionIds).toHaveLength(5);
  });

  it("el consumo variable (muchas compras al mes) no es una serie", () => {
    const compras = ["01", "04", "09", "13", "18", "22", "27"].flatMap((d, i) =>
      ["2026-02", "2026-03", "2026-04"].map((m) =>
        row(`${m}-${d}`, -(15_000 + i * 3_000), "LIDER DEMO"),
      ),
    );
    expect(labels(detectRecurringSeries(compras).charges)).not.toContain("LIDER DEMO");
  });

  it("una suscripción cancelada queda inactiva y no suma al total mensual", () => {
    const inv = detectRecurringSeries([
      ...monthly("SPOTIFY DEMO", -5_990, 3, 3, "2026-02"),
      ...monthly("NETFLIX.COM", -9_990, 15, 5, "2026-05"),
    ]);
    expect(inv.charges.find((c) => c.label === "SPOTIFY DEMO")?.active).toBe(false);
    expect(inv.monthlyChargesClp).toBe(9_990);
    expect(inv.asOf).toBe("2026-05-15");
  });

  it("el arriendo pagado por transferencia cuenta como cobro fijo", () => {
    const inv = detectRecurringSeries(monthly("Transf a ARRIENDO DEMO", -450_000, 5, 4, "2026-05"));
    expect(inv.charges[0]).toMatchObject({ label: "ARRIENDO DEMO", typicalAmountClp: 450_000 });
  });

  it("excluye transferencias internas", () => {
    const inv = detectRecurringSeries(
      monthly("PAGO TARJETA DEMO", -300_000, 10, 4, "2026-05", { internal: true }),
    );
    expect(inv.charges).toEqual([]);
  });
});

describe("detectRecurringSeries — ingresos recurrentes", () => {
  it("sueldo con anticipo: dos depósitos al mes se SUMAN, no se descartan", () => {
    const txs = ["2026-01", "2026-02", "2026-03", "2026-04"].flatMap((m) => [
      row(`${m}-15`, 400_000, "Transf. EMPLEADOR DEMO SPA"),
      row(`${m}-${m === "2026-02" ? "27" : "30"}`, 800_000, "Transf. EMPLEADOR DEMO SPA"),
    ]);
    const inv = detectRecurringSeries(txs);
    expect(inv.income).toHaveLength(1);
    expect(inv.income[0]).toMatchObject({
      label: "EMPLEADOR DEMO SPA",
      typicalAmountClp: 1_200_000,
      occurrences: 4,
    });
    expect(inv.monthlyIncomeClp).toBe(1_200_000);
  });

  it("sueldo de fin de mes que a veces cae el 1º del mes siguiente sigue siendo UNA serie mensual", () => {
    // Por mes calendario, abril tendría dos depósitos y marzo ninguno.
    const fechas = ["2026-01-30", "2026-02-27", "2026-04-01", "2026-04-30", "2026-05-29"];
    const inv = detectRecurringSeries(fechas.map((f) => row(f, 1_000_000, "Transf. EMPRESA DEMO")));
    expect(inv.income[0]).toMatchObject({
      label: "EMPRESA DEMO",
      typicalAmountClp: 1_000_000,
      occurrences: 5,
    });
  });

  it("la misma contraparte con y sin RUT en la glosa es una sola serie", () => {
    const txs = [
      row("2026-02-05", 350_000, "76.543.210-3 Transf. ARRIENDO RECIBIDO DEMO"),
      row("2026-03-05", 350_000, "Transf. ARRIENDO RECIBIDO DEMO"),
      row("2026-04-06", 350_000, "76.543.210-3 Transf. ARRIENDO RECIBIDO DEMO"),
      row("2026-05-05", 350_000, "Transf. ARRIENDO RECIBIDO DEMO"),
    ];
    const inv = detectRecurringSeries(txs);
    expect(inv.income).toHaveLength(1);
    expect(inv.income[0]).toMatchObject({ label: "ARRIENDO RECIBIDO DEMO", occurrences: 4 });
  });

  it("no cuenta ingresos que el usuario confirmó como extraordinarios", () => {
    const inv = detectRecurringSeries(
      monthly("Transf. APORTE DEMO", 2_500_000, 19, 3, "2026-05", { extraordinary: 1 }),
    );
    expect(inv.income).toEqual([]);
  });
});
