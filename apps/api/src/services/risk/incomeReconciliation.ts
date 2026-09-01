/**
 * D7 — Motor de reconciliación de ingresos.
 *
 * Cruza las señales de ingreso mensual de las distintas fuentes (SII declarado, AFP renta
 * imponible, cartola bancaria observada, proxy CMF) y emite:
 *   - un ingreso reconciliado (elige la fuente de mayor confianza, con regla explícita),
 *   - una CONFIANZA por fuente (base × frescura × acuerdo),
 *   - las DISCREPANCIAS detectadas con reglas explícitas (informalidad, no declarado, obsoleto,
 *     brecha grande).
 *
 * Es lo que "convierte tres archivos en un perfil". Función pura y auditable: todos los cortes
 * viven en `RECONCILIATION_CONFIG` con su racional.
 */

export type IncomeSourceId = "sii" | "afp" | "cartola" | "cmf_proxy";

export interface IncomeSignal {
  source: IncomeSourceId;
  /** Ingreso mensual en CLP (> 0 para contar). */
  monthlyClp: number;
  /** ISO timestamp de la extracción/observación (para penalizar datos viejos). */
  asOf?: string | null;
}

export type DiscrepancyKind =
  | "informal_income" // cartola >> SII declarado → ingreso informal/no declarado
  | "possible_undeclared_account" // declarado >> cartola → ingreso que no pasa por esta cuenta
  | "stale_source" // fuente con datos viejos
  | "large_gap"; // dos fuentes difieren demasiado

export interface IncomeDiscrepancy {
  kind: DiscrepancyKind;
  sources: IncomeSourceId[];
  severity: "info" | "warn";
  detail: string;
}

export interface SourceConfidence {
  source: IncomeSourceId;
  monthlyClp: number;
  /** 0–1: qué tanto confiamos en esta fuente para el ingreso reconciliado. */
  confidence: number;
  stale: boolean;
}

export interface ReconciledIncome {
  /** Ingreso mensual reconciliado (0 si no hay señales válidas). */
  monthlyClp: number;
  /** Fuente elegida (la de mayor confianza) o null si no hay señales. */
  chosenSource: IncomeSourceId | null;
  confidenceBySource: SourceConfidence[];
  discrepancies: IncomeDiscrepancy[];
  rationale: string;
}

/** Cortes y pesos del motor. FUENTE ÚNICA, cada valor con su racional. */
export const RECONCILIATION_CONFIG = {
  /** Confianza base por fuente (fiabilidad intrínseca del origen del dato). */
  baseConfidence: {
    sii: 0.9, // renta declarada al SII: formal y verificable [criterio propio]
    afp: 0.85, // renta imponible: formal pero topada al imponible; omite lo no imponible
    cartola: 0.7, // flujo observado: captura informalidad pero es ruidoso (incluye transferencias)
    cmf_proxy: 0.3, // deuda/12: no es ingreso real, último recurso
  } as Record<IncomeSourceId, number>,
  /** Meses tras los cuales una fuente se considera OBSOLETA (penaliza confianza). */
  staleMonths: 6,
  /** Multiplicador de confianza para una fuente obsoleta. */
  staleFactor: 0.6,
  /** Dos fuentes "concuerdan" si difieren ≤ este %. Sube la confianza de la elegida. */
  agreePct: 0.15,
  agreeBonus: 0.05,
  /** cartola > SII × esto → probable ingreso informal. */
  informalRatio: 1.3,
  /** declarado (SII/AFP) > cartola × esto → probable ingreso que no pasa por esta cuenta. */
  undeclaredRatio: 1.3,
  /** max/min de las señales > esto → brecha grande. */
  largeGapRatio: 1.4,
} as const;

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function isStale(asOf: string | null | undefined, now: number): boolean {
  if (!asOf) return false; // sin fecha → no penalizamos (no asumimos que sea vieja)
  const t = new Date(asOf).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t > RECONCILIATION_CONFIG.staleMonths * MONTH_MS;
}

/** Confianza de una fuente = base × (obsoleta ? staleFactor : 1). */
function sourceConfidence(sig: IncomeSignal, now: number): SourceConfidence {
  const base = RECONCILIATION_CONFIG.baseConfidence[sig.source] ?? 0.3;
  const stale = isStale(sig.asOf, now);
  const confidence = base * (stale ? RECONCILIATION_CONFIG.staleFactor : 1);
  return { source: sig.source, monthlyClp: sig.monthlyClp, confidence, stale };
}

function pctGap(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi <= 0) return 0;
  return (hi - lo) / hi;
}

function detectDiscrepancies(
  valid: IncomeSignal[],
  confidences: SourceConfidence[],
): IncomeDiscrepancy[] {
  const out: IncomeDiscrepancy[] = [];
  const cfg = RECONCILIATION_CONFIG;
  const by = (s: IncomeSourceId) => valid.find((v) => v.source === s);
  const sii = by("sii");
  const afp = by("afp");
  const cartola = by("cartola");
  const declared = sii ?? afp; // el declarado formal más fuerte disponible

  // Informalidad: la cartola ve bastante más de lo declarado.
  if (cartola && sii && cartola.monthlyClp > sii.monthlyClp * cfg.informalRatio) {
    out.push({
      kind: "informal_income",
      sources: ["cartola", "sii"],
      severity: "warn",
      detail: `La cartola observa ${Math.round((cartola.monthlyClp / sii.monthlyClp - 1) * 100)}% más ingreso que lo declarado al SII — posible ingreso informal/no declarado.`,
    });
  }

  // No declarado en esta cuenta: se declara más de lo que pasa por la cartola.
  if (declared && cartola && declared.monthlyClp > cartola.monthlyClp * cfg.undeclaredRatio) {
    out.push({
      kind: "possible_undeclared_account",
      sources: [declared.source, "cartola"],
      severity: "info",
      detail: `Se declara más ingreso (${declared.source.toUpperCase()}) del que pasa por esta cuenta — puede haber otra cuenta o pago en efectivo.`,
    });
  }

  // Fuentes obsoletas.
  for (const c of confidences) {
    if (c.stale) {
      out.push({
        kind: "stale_source",
        sources: [c.source],
        severity: "info",
        detail: `La fuente ${c.source.toUpperCase()} tiene datos con más de ${cfg.staleMonths} meses; su confianza se redujo.`,
      });
    }
  }

  // Brecha grande entre el máximo y el mínimo de las señales válidas.
  if (valid.length >= 2) {
    const vals = valid.map((v) => v.monthlyClp);
    const hi = Math.max(...vals);
    const lo = Math.min(...vals);
    if (lo > 0 && hi / lo > cfg.largeGapRatio) {
      out.push({
        kind: "large_gap",
        sources: valid.map((v) => v.source),
        severity: "warn",
        detail: `Las fuentes difieren hasta ${Math.round((hi / lo - 1) * 100)}% entre sí; revisar cuál refleja el ingreso real.`,
      });
    }
  }

  return out;
}

/**
 * Reconcilia las señales de ingreso. Ignora señales con monto ≤ 0.
 * Regla de elección: la fuente de MAYOR confianza. Si dos fuentes concuerdan (≤ agreePct),
 * la elegida gana un pequeño bono de confianza.
 */
export function reconcileIncome(signals: IncomeSignal[], now: Date = new Date()): ReconciledIncome {
  const nowMs = now.getTime();
  const valid = signals.filter((s) => Number.isFinite(s.monthlyClp) && s.monthlyClp > 0);

  if (valid.length === 0) {
    return {
      monthlyClp: 0,
      chosenSource: null,
      confidenceBySource: [],
      discrepancies: [],
      rationale: "Sin señales de ingreso válidas.",
    };
  }

  const confidences = valid.map((s) => sourceConfidence(s, nowMs));

  // Bono de acuerdo: si la fuente top concuerda con otra, sube su confianza.
  const sorted = [...confidences].sort((a, b) => b.confidence - a.confidence);
  const top = sorted[0];
  const agrees = confidences.some(
    (c) =>
      c.source !== top.source &&
      pctGap(c.monthlyClp, top.monthlyClp) <= RECONCILIATION_CONFIG.agreePct,
  );
  if (agrees) {
    top.confidence = Math.min(0.99, top.confidence + RECONCILIATION_CONFIG.agreeBonus);
  }

  const discrepancies = detectDiscrepancies(valid, confidences);

  const rationale = agrees
    ? `Se eligió ${top.source.toUpperCase()} (mayor confianza), respaldada por otra fuente que concuerda.`
    : `Se eligió ${top.source.toUpperCase()} por ser la fuente de mayor confianza${
        discrepancies.length ? "; hay discrepancias entre fuentes (ver detalle)." : "."
      }`;

  return {
    monthlyClp: top.monthlyClp,
    chosenSource: top.source,
    confidenceBySource: confidences.sort((a, b) => b.confidence - a.confidence),
    discrepancies,
    rationale,
  };
}
