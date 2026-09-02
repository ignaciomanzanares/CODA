import { describe, it, expect } from "vitest";
import { buildCanonicalProfile } from "../buildCanonicalProfile";
import { assembleCanonicalProfile } from "../assembleCanonicalProfile";
import type { CanonicalInputs } from "../types";

const NOW = new Date("2026-08-31T00:00:00.000Z");

describe("buildCanonicalProfile — contrato con procedencia", () => {
  it("sin insumos → dominios vacíos, sin fuentes", () => {
    const p = buildCanonicalProfile("u1", {}, NOW);
    expect(p.userId).toBe("u1");
    expect(p.sources).toEqual([]);
    expect(p.renta.mensualClp).toBeUndefined();
    expect(p.deuda.totalClp).toBeUndefined();
    expect(p.assembledAt).toBe(NOW.toISOString());
  });

  it("renta reconciliada conserva fuente/confianza/frescura de D7", () => {
    const inp: CanonicalInputs = {
      income: { monthlyClp: 1_650_000, source: "sii", confidence: 0.95, asOf: "2026-07-01" },
    };
    const p = buildCanonicalProfile("u1", inp, NOW);
    expect(p.renta.mensualClp?.value).toBe(1_650_000);
    expect(p.renta.mensualClp?.provenance).toEqual({
      source: "sii",
      asOf: "2026-07-01",
      confidence: 0.95,
    });
    expect(p.sources).toContain("sii");
  });

  it("deuda desde CMF lleva procedencia cmf con confianza base", () => {
    const p = buildCanonicalProfile(
      "u1",
      { debtTotalClp: 5_000_000, moraActiva: true, debtAsOf: "2026-08-01" },
      NOW,
    );
    expect(p.deuda.totalClp?.value).toBe(5_000_000);
    expect(p.deuda.totalClp?.provenance.source).toBe("cmf");
    expect(p.deuda.totalClp?.provenance.confidence).toBe(0.9);
    expect(p.deuda.moraActiva?.value).toBe(true);
    expect(p.sources).toContain("cmf");
  });

  it("empleo desde AFP (meses cotizados)", () => {
    const p = buildCanonicalProfile(
      "u1",
      { cotizacionMeses: 48, employmentAsOf: "2026-06-01" },
      NOW,
    );
    expect(p.empleo.cotizacionMeses?.value).toBe(48);
    expect(p.empleo.cotizacionMeses?.provenance.source).toBe("afp");
    expect(p.sources).toContain("afp");
  });

  it("agrega y deduplica todas las fuentes que aportan", () => {
    const p = buildCanonicalProfile(
      "u1",
      {
        nombre: "Camila",
        income: { monthlyClp: 1_000_000, source: "cartola", confidence: 0.7, asOf: null },
        debtTotalClp: 2_000_000,
        cotizacionMeses: 12,
      },
      NOW,
    );
    expect(new Set(p.sources)).toEqual(new Set(["user_declared", "cartola", "cmf", "afp"]));
  });

  it("ignora renta ≤ 0 y deuda negativa", () => {
    const p = buildCanonicalProfile(
      "u1",
      { income: { monthlyClp: 0, source: "sii", confidence: 0.9, asOf: null }, debtTotalClp: -5 },
      NOW,
    );
    expect(p.renta.mensualClp).toBeUndefined();
    expect(p.deuda.totalClp).toBeUndefined();
  });
});

describe("assembleCanonicalProfile (DB) — sin datos", () => {
  it("usuario sin fuentes → perfil vacío bien formado", async () => {
    const p = await assembleCanonicalProfile(`canon-nodata-${Date.now()}`);
    expect(p.sources).toEqual([]);
    expect(p.renta.mensualClp).toBeUndefined();
    expect(p.deuda.totalClp).toBeUndefined();
    expect(typeof p.assembledAt).toBe("string");
  });
});
