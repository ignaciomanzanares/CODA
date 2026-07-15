/**
 * PART A — guard idempotente del create de activos + dedup.
 *
 * Valida la FIRMA de identidad que comparten el guard del POST /api/assets y el
 * script dedupeAssets: dos activos son "el mismo" sólo si coinciden EXACTO en
 * (userId, type, descripción normalizada, costo, garantía). Activos
 * legítimamente parecidos deben seguir permitidos (firma distinta).
 */
import { describe, it, expect } from "vitest";
import {
  assetSignature,
  normalizeAssetDescription,
  effectiveAssetValueClp,
  type UserAsset,
} from "../../src/services/assets/types.js";
import { deriveHealthInput } from "../../src/services/healthEvaluation/index.js";

const base = {
  userId: "u1",
  type: "property",
  name: "Depto 306 Bilbao",
  acquisitionCostClp: 104_313_182,
  lienAmountClp: 70_000_000,
};

describe("assetSignature (guard idempotente + dedup)", () => {
  it("normaliza la descripción: trim, minúsculas y espacios colapsados", () => {
    expect(normalizeAssetDescription("  Depto   306   Bilbao ")).toBe("depto 306 bilbao");
  });

  it("considera IDÉNTICOS dos activos que sólo difieren en formato de descripción", () => {
    const a = assetSignature(base);
    const b = assetSignature({ ...base, name: "  DEPTO  306   bilbao  " });
    expect(a).toBe(b); // el guard devolvería el existente, no insertaría duplicado
  });

  it("trata garantía ausente y garantía 0 como equivalentes, pero distinta de una garantía real", () => {
    expect(assetSignature({ ...base, lienAmountClp: null })).toBe(
      assetSignature({ ...base, lienAmountClp: 0 }),
    );
    expect(assetSignature({ ...base, lienAmountClp: null })).not.toBe(assetSignature(base));
  });

  it("NO marca como duplicados activos legítimamente distintos", () => {
    const sig = assetSignature(base);
    expect(assetSignature({ ...base, acquisitionCostClp: 104_313_183 })).not.toBe(sig); // otro costo
    expect(assetSignature({ ...base, type: "vehicle" })).not.toBe(sig); // otro tipo
    expect(assetSignature({ ...base, name: "Depto 307 Bilbao" })).not.toBe(sig); // otra descripción
    expect(assetSignature({ ...base, lienAmountClp: 50_000_000 })).not.toBe(sig); // otra garantía
    expect(assetSignature({ ...base, userId: "u2" })).not.toBe(sig); // otro usuario
  });
});

// Prueba que la ELIMINACIÓN de la fila duplicada mueve el ratio Deuda/Activos
// del ~47% inflado al ~90% real, usando la MISMA fórmula canónica
// (deriveHealthInput) que consume el script dedupeAssets. El 47% venía de contar
// el mismo inmueble dos veces, lo que inflaba la base de activos y bajaba el ratio.
describe("Deuda/Activos tras quitar el activo duplicado (47% → 90%)", () => {
  const propiedad: UserAsset = {
    id: "a1",
    userId: "u1",
    type: "property",
    name: "Depto 306 Bilbao",
    acquisitionCostClp: 100_000_000,
    estimatedValueClp: 100_000_000,
    hasLien: true,
    lienAmountClp: 70_000_000,
    currency: "CLP",
    documentId: null,
    notes: null,
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
  };
  const duplicado: UserAsset = { ...propiedad, id: "a2", createdAt: "2025-02-01" }; // huérfano idéntico

  // Deuda total y líquidos fijos; sólo cambia el set de activos.
  const deudaTotalClp = 98_360_000;
  const liquidosClp = 9_290_000;
  const cmf = {
    deuda_total: deudaTotalClp,
    deuda_directa: [],
    deuda_indirecta: [],
    lineas_credito: [],
    metricas: {
      porcentaje_al_dia: 100,
      score_cmf: 85,
      tiene_mora: false,
      credito_disponible_total: 0,
      utilizacion_promedio: 0,
    },
  } as any;

  function ratio(assets: UserAsset[]): number {
    return deriveHealthInput({
      ingresoMensualClp: 3_000_000,
      deudaMensualClp: deudaTotalClp / 36,
      deudaTotalClp,
      ahorroMensualClp: 500_000,
      cmf,
      sfaProductBalancesClp: liquidosClp,
      userAssets: assets,
    }).deudaActivos;
  }

  it("cuenta cada inmueble una sola vez (effectiveAssetValueClp no suma ambas columnas)", () => {
    expect(effectiveAssetValueClp(propiedad)).toBe(100_000_000);
  });

  it("ANTES (con duplicado) ≈ 47%, DESPUÉS (deduplicado) ≈ 90%", () => {
    const before = ratio([propiedad, duplicado]); // base inflada: 2× inmueble
    const after = ratio([propiedad]); // base real: 1× inmueble

    console.log(
      `Deuda/Activos  ANTES=${(before * 100).toFixed(1)}%  DESPUÉS=${(after * 100).toFixed(1)}%`,
    );

    expect(before).toBeCloseTo(0.47, 2);
    expect(after).toBeCloseTo(0.9, 2);
    expect(after).toBeGreaterThan(before); // quitar duplicados sube el ratio (deuda relativa real)
  });
});
