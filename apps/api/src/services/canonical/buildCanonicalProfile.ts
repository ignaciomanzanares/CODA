/**
 * Construye el perfil canónico (D1) a partir de insumos ya obtenidos. PURO y testeable: no toca
 * la DB. El assembler (`assembleCanonicalProfile`) hace el fetch y llama a esto.
 */

import type { CanonicalProfile, CanonicalInputs, CanonicalFact, DataSourceId } from "./types.js";

/** Confianza base por fuente para dominios sin score propio (la renta ya trae confianza de D7). */
const BASE_CONFIDENCE: Partial<Record<DataSourceId, number>> = {
  registro_civil: 0.95,
  cmf: 0.9,
  sii: 0.9,
  tgr: 0.9,
  afp: 0.85,
  afc: 0.85,
  reconciled: 0.8,
  cartola: 0.7,
  user_declared: 0.6,
};

function fact<T>(
  value: T,
  source: DataSourceId,
  asOf: string | null,
  confidence?: number,
): CanonicalFact<T> {
  return {
    value,
    provenance: { source, asOf, confidence: confidence ?? BASE_CONFIDENCE[source] ?? 0.5 },
  };
}

export function buildCanonicalProfile(
  userId: string,
  inp: CanonicalInputs,
  now: Date = new Date(),
): CanonicalProfile {
  const sources = new Set<DataSourceId>();

  const identidad: CanonicalProfile["identidad"] = {};
  if (inp.rut) {
    identidad.rut = fact(inp.rut, "user_declared", null);
    sources.add("user_declared");
  }
  if (inp.nombre) {
    identidad.nombre = fact(inp.nombre, "user_declared", null);
    sources.add("user_declared");
  }

  const renta: CanonicalProfile["renta"] = {};
  if (inp.income && inp.income.monthlyClp > 0) {
    renta.mensualClp = {
      value: inp.income.monthlyClp,
      provenance: {
        source: inp.income.source,
        asOf: inp.income.asOf,
        confidence: inp.income.confidence,
      },
    };
    sources.add(inp.income.source);
  }

  const deuda: CanonicalProfile["deuda"] = {};
  if (inp.debtTotalClp != null && inp.debtTotalClp >= 0) {
    deuda.totalClp = fact(inp.debtTotalClp, "cmf", inp.debtAsOf ?? null);
    sources.add("cmf");
  }
  if (inp.moraActiva != null) {
    deuda.moraActiva = fact(inp.moraActiva, "cmf", inp.debtAsOf ?? null);
    sources.add("cmf");
  }

  const empleo: CanonicalProfile["empleo"] = {};
  if (inp.cotizacionMeses != null && inp.cotizacionMeses >= 0) {
    empleo.cotizacionMeses = fact(inp.cotizacionMeses, "afp", inp.employmentAsOf ?? null);
    sources.add("afp");
  }

  return {
    userId,
    identidad,
    renta,
    deuda,
    empleo,
    sources: [...sources],
    assembledAt: now.toISOString(),
  };
}
