/**
 * R5 — Consola de fine-tuning del prestador.
 *
 * El prestador (banco/cooperativa) fija SUS propios cortes sobre las variables EXPONIBLES (R4):
 * una política = lista de criterios (variable, operador, umbral). `applyLenderPolicy` la evalúa
 * contra el perfil de un usuario → aprobar/rechazar, con el detalle de qué criterios pasaron/
 * fallaron y un SNAPSHOT de la política aplicada (registro por evaluación, defensa regulatoria).
 *
 * Guard de fairness: cualquier criterio sobre una variable NO exponible (comuna, edad, género,
 * proxy…) se IGNORA — el prestador no puede discriminar por atributos protegidos aunque lo intente.
 * `simulateLenderPolicy` corre la política sobre una muestra (tasa de aprobación).
 */

import { isLenderExposable } from "./b2bVariableRegistry.js";

export type PolicyOperator = ">=" | "<=" | ">" | "<" | "==";

export interface PolicyCriterion {
  /** Debe ser una variable exponible (R4); si no, se ignora. */
  variable: string;
  op: PolicyOperator;
  threshold: number | boolean;
  /** Etiqueta legible opcional para el detalle. */
  label?: string;
}

export interface LenderPolicy {
  lenderId: string;
  name: string;
  version: string;
  criteria: PolicyCriterion[];
}

export type VariableValues = Record<string, number | boolean | undefined>;

export interface FailedCriterion {
  criterion: PolicyCriterion;
  actual: number | boolean | undefined;
  reason: string;
}

export interface PolicyDecision {
  decision: "approve" | "reject";
  passed: PolicyCriterion[];
  failed: FailedCriterion[];
  /** Criterios descartados por apuntar a variables NO exponibles (guard de fairness). */
  ignored: PolicyCriterion[];
  /** Snapshot inmutable de la política aplicada (para registrar por evaluación). */
  policySnapshot: LenderPolicy;
  evaluatedAt: string;
}

export interface PolicyValidation {
  valid: boolean;
  /** Criterios que apuntan a variables no exponibles (rechazados). */
  nonExposable: string[];
  errors: string[];
}

/** Valida que la política solo use variables exponibles y operadores conocidos. */
export function validateLenderPolicy(policy: LenderPolicy): PolicyValidation {
  const errors: string[] = [];
  const nonExposable: string[] = [];
  if (!policy.criteria?.length) errors.push("La política no tiene criterios.");
  const ops: PolicyOperator[] = [">=", "<=", ">", "<", "=="];
  for (const c of policy.criteria ?? []) {
    if (!isLenderExposable(c.variable)) nonExposable.push(c.variable);
    if (!ops.includes(c.op)) errors.push(`Operador inválido: ${c.op} (${c.variable}).`);
  }
  return { valid: errors.length === 0 && nonExposable.length === 0, nonExposable, errors };
}

function evalCriterion(
  op: PolicyOperator,
  actual: number | boolean | undefined,
  threshold: number | boolean,
): { pass: boolean; reason: string } {
  if (actual === undefined || actual === null)
    return { pass: false, reason: "sin dato disponible" };
  if (typeof actual === "boolean" || typeof threshold === "boolean") {
    if (op !== "==") return { pass: false, reason: "operador no aplica a booleano" };
    return { pass: actual === threshold, reason: actual === threshold ? "ok" : "no coincide" };
  }
  const a = actual as number;
  const t = threshold as number;
  const pass =
    op === ">=" ? a >= t : op === "<=" ? a <= t : op === ">" ? a > t : op === "<" ? a < t : a === t;
  return { pass, reason: pass ? "ok" : `${a} ${op} ${t} no se cumple` };
}

/**
 * Aplica la política al perfil de un usuario. Aprueba solo si TODOS los criterios aplicables
 * (sobre variables exponibles) pasan. Los criterios sobre variables no exponibles se ignoran.
 */
export function applyLenderPolicy(
  policy: LenderPolicy,
  values: VariableValues,
  now: Date = new Date(),
): PolicyDecision {
  const passed: PolicyCriterion[] = [];
  const failed: FailedCriterion[] = [];
  const ignored: PolicyCriterion[] = [];

  for (const c of policy.criteria) {
    if (!isLenderExposable(c.variable)) {
      ignored.push(c);
      continue;
    }
    const actual = values[c.variable];
    const { pass, reason } = evalCriterion(c.op, actual, c.threshold);
    if (pass) passed.push(c);
    else failed.push({ criterion: c, actual, reason });
  }

  return {
    decision: failed.length === 0 ? "approve" : "reject",
    passed,
    failed,
    ignored,
    policySnapshot: {
      lenderId: policy.lenderId,
      name: policy.name,
      version: policy.version,
      criteria: policy.criteria.map((c) => ({ ...c })),
    },
    evaluatedAt: now.toISOString(),
  };
}

export interface SimulationResult {
  total: number;
  approved: number;
  rejected: number;
  approvalRate: number;
  /** Conteo de cuántas veces falló cada variable (para calibrar la política). */
  failuresByVariable: Record<string, number>;
}

/** Simula la política sobre una muestra de perfiles → tasa de aprobación + rechazos por variable. */
export function simulateLenderPolicy(
  policy: LenderPolicy,
  sample: VariableValues[],
  now: Date = new Date(),
): SimulationResult {
  let approved = 0;
  const failuresByVariable: Record<string, number> = {};
  for (const values of sample) {
    const d = applyLenderPolicy(policy, values, now);
    if (d.decision === "approve") approved++;
    for (const f of d.failed) {
      failuresByVariable[f.criterion.variable] =
        (failuresByVariable[f.criterion.variable] ?? 0) + 1;
    }
  }
  const total = sample.length;
  return {
    total,
    approved,
    rejected: total - approved,
    approvalRate: total > 0 ? approved / total : 0,
    failuresByVariable,
  };
}
