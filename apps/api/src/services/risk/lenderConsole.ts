/**
 * R4 + R5 — Consola del prestador (capa de servicio).
 *
 * Une el registro de variables (R4: qué es exponible vs protegido) con el motor de políticas
 * (R5: aplicar/simular) para alimentar la consola B2B. La simulación corre SIEMPRE sobre un
 * COHORTE SINTÉTICO generado acá — nunca sobre perfiles de usuarios reales: un prestador jamás
 * ve datos individuales de personas. El cohorte es determinista (PRNG sembrado) para que la misma
 * política dé el mismo resultado, y su distribución es representativa pero inventada.
 */

import {
  B2B_VARIABLE_REGISTRY,
  type B2BVariable,
  type VariableClass,
} from "./b2bVariableRegistry.js";
import {
  applyLenderPolicy,
  simulateLenderPolicy,
  validateLenderPolicy,
  type LenderPolicy,
  type PolicyValidation,
  type SimulationResult,
  type VariableValues,
  type PolicyDecision,
} from "./lenderPolicy.js";

/** PRNG determinista (mulberry32) — reproducible sin dependencias. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Muestra de una normal truncada a [min, max] (Box–Muller con el PRNG dado). */
function normal(rnd: () => number, mean: number, sd: number, min: number, max: number): number {
  const u1 = Math.max(rnd(), 1e-9);
  const u2 = rnd();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.min(max, Math.max(min, mean + z * sd));
}

/**
 * Genera un cohorte sintético representativo (distribuciones plausibles, NO datos reales).
 * Cada perfil trae las variables exponibles que una política típica usaría.
 */
export function generateSyntheticCohort(n = 500, seed = 42): VariableValues[] {
  const rnd = mulberry32(seed);
  const cohort: VariableValues[] = [];
  for (let i = 0; i < n; i++) {
    const moraActiva = rnd() < 0.14; // ~14% con mora vigente
    const deudaFlujo = normal(rnd, 0.32, 0.18, 0, 1.3);
    cohort.push({
      deudaFlujo,
      dti: deudaFlujo,
      deudaActivos: normal(rnd, 0.45, 0.28, 0, 1.6),
      ahorroIngreso: normal(rnd, 0.08, 0.14, -0.35, 0.5),
      moraActiva,
      diasMora: moraActiva ? Math.round(normal(rnd, 35, 30, 1, 120)) : 0,
      historialCmf: Math.round(normal(rnd, 620, 130, 150, 850)),
      tiposCredito: Math.max(0, Math.round(normal(rnd, 2, 1.2, 0, 6))),
      incomeRegularity: normal(rnd, 0.7, 0.2, 0, 1),
    });
  }
  return cohort;
}

/** Catálogo de variables agrupado por clase, para poblar la consola (R4). */
export function lenderVariableCatalog(): Record<VariableClass, B2BVariable[]> {
  const groups: Record<VariableClass, B2BVariable[]> = {
    exposable: [],
    proxy_risk: [],
    protected: [],
    internal: [],
  };
  for (const v of B2B_VARIABLE_REGISTRY) groups[v.clazz].push(v);
  return groups;
}

export interface LenderConsoleSimulation {
  /** Validación de la política (variables no exponibles, errores). */
  validation: PolicyValidation;
  /** Resultado de la simulación sobre el cohorte sintético. */
  simulation: SimulationResult;
  /** Tamaño y naturaleza del cohorte (siempre sintético). */
  cohort: { size: number; synthetic: true };
  /** Muestra de decisiones (perfiles sintéticos anonimizados) para ilustrar el detalle. */
  examples: Array<{ values: VariableValues; decision: PolicyDecision["decision"]; failed: string[] }>;
}

/**
 * Valida + simula una política del prestador sobre el cohorte sintético. El guard de fairness de
 * R5 ignora cualquier criterio sobre variables no exponibles (protegidas/proxy/internas).
 */
export function runLenderConsoleSimulation(
  policy: LenderPolicy,
  cohortSize = 500,
): LenderConsoleSimulation {
  const validation = validateLenderPolicy(policy);
  const cohort = generateSyntheticCohort(cohortSize);
  const simulation = simulateLenderPolicy(policy, cohort);

  // Unas pocas decisiones de ejemplo (los primeros del cohorte), para ilustrar el porqué.
  const examples = cohort.slice(0, 6).map((values) => {
    const d = applyLenderPolicy(policy, values);
    return { values, decision: d.decision, failed: d.failed.map((f) => f.criterion.variable) };
  });

  return {
    validation,
    simulation,
    cohort: { size: cohort.length, synthetic: true },
    examples,
  };
}
