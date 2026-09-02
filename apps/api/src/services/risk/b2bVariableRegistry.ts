/**
 * R4 — Registro de variables del modelo B2B (qué ve el prestador).
 *
 * Cuando un prestador use la consola de fine-tuning (R5) para fijar sus propios cortes, SOLO puede
 * ver/ajustar variables que sean predictores financieros LEGÍTIMOS. Este registro clasifica cada
 * variable candidata y `filterLenderExposable` la hace cumplir (defensa en profundidad: una variable
 * demográfica o proxy de atributo protegido NO llega al prestador aunque alguien la agregue al output).
 *
 * Clases:
 *   - `exposable`   → comportamiento financiero directo; ok exponer al prestador.
 *   - `proxy_risk`  → puede CORRELACIONAR con un atributo protegido → NO exponer sin justificación.
 *   - `protected`   → atributo protegido directo → NUNCA exponer (guard documentado; hoy NO son features).
 *   - `internal`    → interno del modelo, sin sentido para el prestador.
 *
 * Base regulatoria: Ley 21.719 (datos personales) + no discriminación (evitar discriminación
 * indirecta vía proxies). El fundamento por variable es la defensa escrita que pide la tesis.
 */

export type VariableClass = "exposable" | "proxy_risk" | "protected" | "internal";

export interface B2BVariable {
  id: string;
  label: string;
  clazz: VariableClass;
  /** Fundamento: por qué es (o no) un predictor legítimo. */
  rationale: string;
}

export const B2B_VARIABLE_REGISTRY: readonly B2BVariable[] = [
  // ── Predictores financieros legítimos (exposable) ──
  {
    id: "deudaFlujo",
    label: "Deuda/Flujo (DSTI)",
    clazz: "exposable",
    rationale: "Carga de deuda sobre ingreso: predictor directo de capacidad de pago.",
  },
  {
    id: "deudaActivos",
    label: "Deuda/Patrimonio",
    clazz: "exposable",
    rationale: "Apalancamiento: predictor directo de solvencia.",
  },
  {
    id: "ahorroIngreso",
    label: "Ahorro/Ingreso",
    clazz: "exposable",
    rationale: "Capacidad de generar excedente: comportamiento financiero.",
  },
  {
    id: "moraActiva",
    label: "Mora activa",
    clazz: "exposable",
    rationale: "Atraso vigente en CMF: predictor crediticio estándar.",
  },
  {
    id: "diasMora",
    label: "Días de mora",
    clazz: "exposable",
    rationale: "Severidad del atraso: comportamiento de pago.",
  },
  {
    id: "historialCmf",
    label: "Historial CMF",
    clazz: "exposable",
    rationale: "Historial de deuda formal: base del score crediticio.",
  },
  {
    id: "tiposCredito",
    label: "Diversificación de crédito",
    clazz: "exposable",
    rationale: "Mix de productos de crédito: comportamiento crediticio.",
  },
  {
    id: "dti",
    label: "DTI",
    clazz: "exposable",
    rationale: "Deuda/ingreso: variable crediticia central.",
  },
  {
    id: "dtiCapped",
    label: "DTI (acotado)",
    clazz: "exposable",
    rationale: "DTI winsorizado para estabilidad; mismo fundamento que DTI.",
  },
  {
    id: "incomeRegularity",
    label: "Regularidad de ingreso",
    clazz: "exposable",
    rationale: "Estabilidad del ingreso: predictor de capacidad de pago.",
  },
  {
    id: "incomeTrend30_90",
    label: "Tendencia de ingreso",
    clazz: "exposable",
    rationale: "Evolución reciente del ingreso: comportamiento financiero.",
  },
  {
    id: "netCashflowVolatility",
    label: "Volatilidad de flujo neto",
    clazz: "exposable",
    rationale: "Estabilidad del flujo de caja: riesgo de liquidez.",
  },
  {
    id: "recurringExpenseShare",
    label: "Gasto fijo recurrente",
    clazz: "exposable",
    rationale: "Rigidez del gasto: capacidad de absorber shocks.",
  },
  {
    id: "debitCreditRatio",
    label: "Ratio gasto/ingreso",
    clazz: "exposable",
    rationale: "Consumo relativo al ingreso: comportamiento financiero.",
  },
  {
    id: "txPerMonth",
    label: "Transacciones/mes",
    clazz: "exposable",
    rationale: "Uso de la cuenta: actividad financiera neutral.",
  },
  {
    id: "debitPerMonth",
    label: "Cargos/mes",
    clazz: "exposable",
    rationale: "Frecuencia de gasto: comportamiento financiero.",
  },
  {
    id: "creditPerMonth",
    label: "Abonos/mes",
    clazz: "exposable",
    rationale: "Frecuencia de ingresos: comportamiento financiero.",
  },
  {
    id: "activeDaysShare",
    label: "Días activos",
    clazz: "exposable",
    rationale: "Actividad de la cuenta: neutral respecto de atributos protegidos.",
  },

  // ── Proxies de riesgo (NO exponer sin justificación) ──
  {
    id: "topCategoryShare",
    label: "Concentración en categoría top",
    clazz: "proxy_risk",
    rationale:
      "La composición del gasto puede correlacionar con estilo de vida / atributos demográficos → riesgo de discriminación indirecta. Se usa internamente pero NO se expone al prestador.",
  },

  // ── Atributos protegidos (NUNCA exponer; hoy NO son features — guard documentado) ──
  {
    id: "edad",
    label: "Edad",
    clazz: "protected",
    rationale: "Atributo protegido. No es feature del modelo; se lista para bloquear su ingreso.",
  },
  {
    id: "genero",
    label: "Género",
    clazz: "protected",
    rationale: "Atributo protegido. No es feature.",
  },
  {
    id: "nacionalidad",
    label: "Nacionalidad",
    clazz: "protected",
    rationale: "Atributo protegido. No es feature.",
  },
  {
    id: "estadoCivil",
    label: "Estado civil",
    clazz: "protected",
    rationale: "Atributo protegido. No es feature.",
  },
  {
    id: "comuna",
    label: "Comuna / domicilio",
    clazz: "protected",
    rationale:
      "Proxy socioeconómico fuerte (discriminación indirecta). No es feature; guard explícito.",
  },
  {
    id: "discapacidad",
    label: "Discapacidad",
    clazz: "protected",
    rationale: "Atributo protegido. No es feature.",
  },

  // ── Internos del modelo (no exponer) ──
  {
    id: "rawPd",
    label: "PD cruda",
    clazz: "internal",
    rationale: "Salida interna del modelo antes de calibración; sin sentido para el prestador.",
  },
  {
    id: "scoreInterno",
    label: "Score interno",
    clazz: "internal",
    rationale: "Componente intermedio del motor de salud.",
  },
] as const;

const BY_ID = new Map(B2B_VARIABLE_REGISTRY.map((v) => [v.id, v]));

/** True solo si la variable está registrada como `exposable`. Desconocida → false (fail-closed). */
export function isLenderExposable(id: string): boolean {
  return BY_ID.get(id)?.clazz === "exposable";
}

/** Filtra una lista de variables al subconjunto exponible al prestador (fail-closed). */
export function filterLenderExposable(ids: string[]): string[] {
  return ids.filter(isLenderExposable);
}

/** Las variables exponibles del registro (para poblar la consola del prestador en R5). */
export function lenderExposableVariables(): B2BVariable[] {
  return B2B_VARIABLE_REGISTRY.filter((v) => v.clazz === "exposable");
}
