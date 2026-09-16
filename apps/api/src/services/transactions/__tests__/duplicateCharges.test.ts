import { describe, it, expect } from "vitest";
import { detectPossibleDuplicateCharges } from "../duplicateCharges";
import { row } from "./testRows";

describe("detectPossibleDuplicateCharges", () => {
  it("propone el mismo cobro dos veces el mismo día", () => {
    const a = row("2026-05-10", -45_990, "FALABELLA DEMO");
    const b = row("2026-05-10", -45_990, "FALABELLA DEMO");
    const out = detectPossibleDuplicateCharges([a, b, row("2026-05-11", -12_000, "OTRO DEMO")]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ amountClp: 45_990, daysApart: 0 });
    expect([out[0]!.first.id, out[0]!.second.id].sort()).toEqual([a.id, b.id].sort());
  });

  it("propone una transferencia hecha dos veces aunque una glosa traiga RUT y la otra no", () => {
    const out = detectPossibleDuplicateCharges([
      row("2026-05-10", -150_000, "Transf a PERSONA DEMO"),
      row("2026-05-11", -150_000, "76.543.210-3 Transf a PERSONA DEMO"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ label: "PERSONA DEMO", daysApart: 1 });
  });

  it("no propone: distinta cuenta, días de distancia, o bajo el piso", () => {
    expect(
      detectPossibleDuplicateCharges([
        row("2026-05-10", -45_990, "FALABELLA DEMO", { accountId: 1 }),
        row("2026-05-10", -45_990, "FALABELLA DEMO", { accountId: 2 }),
      ]),
    ).toEqual([]);
    expect(
      detectPossibleDuplicateCharges([
        row("2026-05-10", -45_990, "FALABELLA DEMO"),
        row("2026-05-13", -45_990, "FALABELLA DEMO"),
      ]),
    ).toEqual([]);
    expect(
      detectPossibleDuplicateCharges([
        row("2026-05-10", -800, "METRO DEMO"),
        row("2026-05-10", -800, "METRO DEMO"),
      ]),
    ).toEqual([]);
  });

  it("no propone lo que ya se reversó", () => {
    expect(
      detectPossibleDuplicateCharges([
        row("2026-05-10", -45_990, "FALABELLA DEMO"),
        row("2026-05-10", -45_990, "FALABELLA DEMO"),
        row("2026-05-14", 45_990, "FALABELLA DEMO"),
      ]),
    ).toEqual([]);
  });

  it("no propone una costumbre: el mismo par repetido en varios meses", () => {
    const almuerzos = ["2026-03", "2026-04"].flatMap((m) => [
      row(`${m}-08`, -12_500, "CASINO DEMO"),
      row(`${m}-08`, -12_500, "CASINO DEMO"),
    ]);
    expect(detectPossibleDuplicateCharges(almuerzos)).toEqual([]);
  });

  it("no propone transferencias internas", () => {
    expect(
      detectPossibleDuplicateCharges([
        row("2026-05-10", -300_000, "PAGO TARJETA DEMO", { internal: true }),
        row("2026-05-10", -300_000, "PAGO TARJETA DEMO", { internal: true }),
      ]),
    ).toEqual([]);
  });
});
