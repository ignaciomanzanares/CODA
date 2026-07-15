/**
 * Decision tree for Chilean government financial assistance programs.
 *
 * Evaluates user financial health from cartola/score data and returns
 * eligible programs with requirements and action links.
 */

export interface ProgramEligibility {
  id: string;
  name: string;
  category: "ahorro" | "vivienda" | "educacion" | "empleo" | "proteccion_social";
  description: string;
  eligible: boolean;
  /** Why the user qualifies / doesn't qualify */
  reason: string;
  /** What the user needs to do to apply or improve eligibility */
  actionTip: string;
  /** External link for more info */
  url: string;
  /** Priority: 1 = most relevant */
  priority: number;
}

export interface FinancialHealthInput {
  monthlyIncome: number;
  monthlyExpenses: number;
  savingsRate: number;
  saldoActual: number;
  creditScore: number | null;
  transactionalScore: number | null;
  hasEducationExpenses: boolean;
  educationExpensesPct: number;
  hasMortgage: boolean;
  age: number | null; // null if unknown
  mesesCubiertos: number; // emergency fund months
}

export type HealthLevel = "critico" | "en_riesgo" | "estable" | "saludable";

export function evaluateFinancialHealth(input: FinancialHealthInput): HealthLevel {
  const { savingsRate, mesesCubiertos, creditScore, transactionalScore } = input;

  // Decision tree for health level
  if (savingsRate < 0 || mesesCubiertos < 0.5) return "critico";
  if (savingsRate < 10 || mesesCubiertos < 1) return "en_riesgo";
  if (
    savingsRate >= 20 &&
    mesesCubiertos >= 3 &&
    (creditScore === null || creditScore >= 650) &&
    (transactionalScore === null || transactionalScore >= 70)
  ) {
    return "saludable";
  }
  return "estable";
}

const HEALTH_LABELS: Record<HealthLevel, string> = {
  critico: "Situación crítica",
  en_riesgo: "En riesgo",
  estable: "Estable",
  saludable: "Saludable",
};

const HEALTH_DESCRIPTIONS: Record<HealthLevel, string> = {
  critico:
    "Tus gastos superan tus ingresos o tu saldo no cubre ni medio mes de gastos. Prioriza estabilizar tu flujo de caja antes de cualquier otra decisión financiera.",
  en_riesgo:
    "Tu situación financiera tiene señales de alerta. Construir un fondo de emergencia y reducir gastos variables debería ser tu foco principal.",
  estable:
    "Tu flujo de caja es positivo y tienes un colchón mínimo. El siguiente paso es optimizar tu tasa de ahorro y considerar inversiones de bajo riesgo.",
  saludable:
    "Ahorras consistentemente, tienes un fondo de emergencia sólido y tus scores son buenos. Estás en posición de buscar oportunidades de inversión o crédito en condiciones favorables.",
};

export function evaluateGovernmentPrograms(input: FinancialHealthInput): {
  healthLevel: HealthLevel;
  healthLabel: string;
  healthDescription: string;
  programs: ProgramEligibility[];
  savingsTips: string[];
} {
  const healthLevel = evaluateFinancialHealth(input);
  const programs: ProgramEligibility[] = [];

  const income = input.monthlyIncome;
  const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 0 });

  // ── Subsidio Habitacional DS1 (compra vivienda sin deuda) ────────────
  const ds1Eligible = income > 0 && income <= 900_000 && !input.hasMortgage;
  programs.push({
    id: "ds1",
    name: "Subsidio Habitacional DS1",
    category: "vivienda",
    description:
      "Subsidio estatal para compra de vivienda sin crédito hipotecario. Cubre hasta 500 UF. Requiere ahorro mínimo en cuenta de vivienda.",
    eligible: ds1Eligible,
    reason: ds1Eligible
      ? `Tu ingreso mensual ($${fmt(income)}) está dentro del rango elegible y no tienes crédito hipotecario.`
      : income > 900_000
        ? `Tu ingreso mensual ($${fmt(income)}) supera el tope de $900.000 para este subsidio.`
        : "Se requiere información de ingresos para evaluar elegibilidad.",
    actionTip: ds1Eligible
      ? "Abre una cuenta de ahorro para la vivienda en BancoEstado y acumula al menos 30 UF."
      : "Evalúa tu situación cuando tu ingreso esté dentro del rango o considera el DS19.",
    url: "https://www.minvu.gob.cl/subsidio-habitacional/",
    priority: ds1Eligible ? 1 : 5,
  });

  // ── Subsidio DS19 (crédito hipotecario con subsidio) ─────────────────
  const ds19Eligible =
    income >= 400_000 && (input.creditScore === null || input.creditScore >= 550);
  programs.push({
    id: "ds19",
    name: "Crédito Hipotecario DS19 (BancoEstado)",
    category: "vivienda",
    description:
      "Financiamiento hasta 90% del valor de la vivienda con subsidio estatal. Tasa preferencial ~3.5% anual en UF. Para primera vivienda.",
    eligible: ds19Eligible,
    reason: ds19Eligible
      ? `Ingresos suficientes y ${input.creditScore != null ? `score crediticio ${input.creditScore}` : "score por evaluar"}.`
      : income < 400_000
        ? "Tu ingreso mensual es inferior al mínimo requerido (~$400.000)."
        : "Tu score crediticio está por debajo del mínimo sugerido (550).",
    actionTip: ds19Eligible
      ? "Acumula al menos 10% del valor de la vivienda como pie. Consulta la oferta en BancoEstado."
      : "Trabaja en mejorar tu score crediticio y aumentar tu capacidad de ahorro.",
    url: "https://www.bancoestado.cl/imagenes/_personas/productos/creditos/hipotecario/ds19.asp",
    priority: ds19Eligible ? 2 : 6,
  });

  // ── CAE (Crédito con Aval del Estado para educación superior) ────────
  const caeRelevant = input.hasEducationExpenses && input.educationExpensesPct >= 10;
  programs.push({
    id: "cae",
    name: "CAE — Crédito con Aval del Estado",
    category: "educacion",
    description:
      "Crédito estatal para financiar educación superior en instituciones acreditadas. Tasa regulada del 2% real anual.",
    eligible: caeRelevant,
    reason: caeRelevant
      ? `Tienes gastos de educación significativos (${input.educationExpensesPct}% de tus ingresos).`
      : "No se detectaron gastos relevantes de educación en tus movimientos.",
    actionTip: caeRelevant
      ? "Verifica si tu institución está acreditada. Postula en ingresa.cl entre noviembre y enero."
      : "Este beneficio aplica si tú o un familiar cursan educación superior acreditada.",
    url: "https://portal.ingresa.cl/",
    priority: caeRelevant ? 2 : 7,
  });

  // ── Gratuidad ────────────────────────────────────────────────────────
  const gratuidadEligible = input.hasEducationExpenses && income <= 800_000;
  programs.push({
    id: "gratuidad",
    name: "Gratuidad en Educación Superior",
    category: "educacion",
    description:
      "Financiamiento completo de arancel y matrícula para familias del 60% más vulnerable. Sin devolución.",
    eligible: gratuidadEligible,
    reason: gratuidadEligible
      ? `Ingreso familiar dentro del rango y gastos de educación detectados.`
      : income > 800_000
        ? "Tu ingreso podría superar el umbral de elegibilidad."
        : "No se detectaron gastos de educación.",
    actionTip: gratuidadEligible
      ? "Verifica elegibilidad completando tu FAFSA en FUAS (fuas.cl) entre octubre y noviembre."
      : "Consulta el portal fuas.cl para evaluar si cumples los requisitos socioeconómicos.",
    url: "https://portal.beneficiosestudiantiles.cl/",
    priority: gratuidadEligible ? 1 : 7,
  });

  // ── Subsidio Empleo Joven (18-25 años) ──────────────────────────────
  const sejEligible =
    (input.age === null || (input.age >= 18 && input.age <= 25)) && income > 0 && income <= 600_000;
  programs.push({
    id: "sej",
    name: "Subsidio Empleo Joven (18-25 años)",
    category: "empleo",
    description:
      "Subsidio monetario mensual para trabajadores jóvenes con ingresos bajos. Complementa tu sueldo con un aporte estatal.",
    eligible: sejEligible,
    reason: sejEligible
      ? "Tu perfil de ingresos es compatible con este subsidio."
      : income > 600_000
        ? "Tu ingreso mensual supera el tope del subsidio."
        : "Este subsidio requiere ser trabajador dependiente o independiente entre 18 y 25 años.",
    actionTip: sejEligible
      ? "Postula en sence.cl con tu cédula de identidad y último pago de cotizaciones."
      : "Consulta los requisitos actualizados en sence.cl.",
    url: "https://www.sence.cl/subsidio-empleo-joven/",
    priority: sejEligible ? 2 : 8,
  });

  // ── Bono Invierno / IFE ────────────────────────────────────────────
  const bonoEligible = income > 0 && income <= 500_000;
  programs.push({
    id: "bono_invierno",
    name: "Bonos Sociales (Invierno, IFE, Canasta Básica)",
    category: "proteccion_social",
    description:
      "Transferencias directas del Estado para familias de menores ingresos. Se asignan por Registro Social de Hogares.",
    eligible: bonoEligible,
    reason: bonoEligible
      ? "Tu nivel de ingresos podría calificar para bonos sociales."
      : "Tu ingreso mensual supera el umbral habitual de estos beneficios.",
    actionTip: bonoEligible
      ? "Actualiza tu Registro Social de Hogares en registrosocial.gob.cl y consulta bonos disponibles."
      : "Mantén actualizado tu RSH por si las condiciones cambian.",
    url: "https://www.registrosocial.gob.cl/",
    priority: bonoEligible ? 1 : 8,
  });

  // ── Cuenta de Ahorro Voluntario (Cuenta 2 AFP) ─────────────────────
  const apvEligible = input.savingsRate >= 5 && income >= 300_000;
  programs.push({
    id: "apv",
    name: "APV / Cuenta 2 AFP — Ahorro con beneficio tributario",
    category: "ahorro",
    description:
      "Ahorro previsional voluntario con bonificación fiscal del 15% (Régimen B) o descuento tributario (Régimen A). Ideal para construir patrimonio a largo plazo.",
    eligible: apvEligible,
    reason: apvEligible
      ? `Con tasa de ahorro del ${input.savingsRate}%, tienes margen para destinar un porcentaje a APV.`
      : "Primero estabiliza tu flujo de caja mensual antes de comprometer ahorro a largo plazo.",
    actionTip: apvEligible
      ? "Consulta tu AFP sobre Cuenta 2 o APV Régimen B (bonificación 15% del Estado, tope 6 UTM/año)."
      : "Cuando tu tasa de ahorro supere el 5%, evalúa destinar una parte a APV.",
    url: "https://www.spensiones.cl/portal/institucional/594/w3-propertyvalue-10429.html",
    priority: apvEligible ? 2 : 6,
  });

  // ── Depósito a plazo (for healthy profiles) ────────────────────────
  const dapEligible = input.mesesCubiertos >= 3 && input.savingsRate >= 15;
  programs.push({
    id: "dap",
    name: "Depósito a Plazo — Rentabiliza tu excedente",
    category: "ahorro",
    description:
      "Con tu fondo de emergencia cubierto, el excedente puede generar intereses en un depósito a plazo. Tasas entre 0.3% y 0.6% mensual según plazo e institución.",
    eligible: dapEligible,
    reason: dapEligible
      ? `Tienes ${Math.round(input.mesesCubiertos)} meses de fondo de emergencia y ahorras ${input.savingsRate}%. Puedes destinar el excedente a rentar.`
      : "Primero construye un fondo de emergencia de al menos 3 meses antes de inmovilizar dinero.",
    actionTip: dapEligible
      ? "Compara tasas entre bancos en cmfchile.cl. Prefiere plazos de 30-90 días si necesitas liquidez."
      : "Cuando tu fondo de emergencia cubra 3+ meses, evalúa un depósito a plazo con tu excedente.",
    url: "https://www.cmfchile.cl/portal/estadisticas/617/w3-propertyvalue-29865.html",
    priority: dapEligible ? 3 : 7,
  });

  // Sort by priority (eligible first, then by priority)
  programs.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return a.priority - b.priority;
  });

  // ── Savings tips based on health level ──────────────────────────────
  const savingsTips: string[] = [];

  if (healthLevel === "critico") {
    savingsTips.push(
      "Congela todo gasto no esencial esta semana. Haz una lista de los 5 gastos más altos y elimina o reduce al menos 2.",
      "Negocia plazos con acreedores antes de acumular mora — la mora daña tu score crediticio.",
      "Si tienes deudas en tarjeta de crédito, prioriza pagar la de mayor tasa primero (método avalancha).",
    );
  } else if (healthLevel === "en_riesgo") {
    savingsTips.push(
      "Define un presupuesto mensual fijo: 50% necesidades, 30% deseos, 20% ahorro (regla 50/30/20).",
      "Automatiza una transferencia de ahorro el mismo día que recibes tu sueldo — así no lo gastas.",
      "Revisa suscripciones activas (streaming, apps, seguros): los cargos recurrentes pequeños suman más de lo que crees.",
    );
  } else if (healthLevel === "estable") {
    savingsTips.push(
      "Estás en buen camino. Sube tu tasa de ahorro un 2% cada trimestre — es un cambio casi imperceptible que acumula mucho.",
      "Considera un APV Régimen B: el Estado te bonifica el 15% de lo que ahorres (tope 6 UTM/año).",
      "Si no tienes fondo de emergencia, constrúyelo antes de invertir: 3 meses de gastos en una cuenta de fácil acceso.",
    );
  } else {
    savingsTips.push(
      "Con tu fondo de emergencia cubierto, diversifica: un mix de depósito a plazo y fondos mutuos balancea riesgo y retorno.",
      "Evalúa portabilidad financiera: compara tu hipoteca, seguros y cuentas con las ofertas del mercado.",
      "Un APV Régimen A puede reducir tu carga tributaria si estás en un tramo alto de impuesto a la renta.",
    );
  }

  return {
    healthLevel,
    healthLabel: HEALTH_LABELS[healthLevel],
    healthDescription: HEALTH_DESCRIPTIONS[healthLevel],
    programs,
    savingsTips,
  };
}
