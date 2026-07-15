/**
 * Recomendaciones y textos del Plan financiero a partir de datos reales del usuario.
 */
import { storage } from "../storage.js";
import { buildFinancialContextForAssistant } from "./assistantContext.js";

export type PlanRecommendationIcon =
  "trending" | "landmark" | "shield" | "piggy" | "target" | "alert" | "wallet";

export type PlanRecommendation = {
  id: string;
  title: string;
  description: string;
  actionText: string;
  actionLink: string;
  icon: PlanRecommendationIcon;
};

function formatClp(n: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function parseUtilizationPct(u: string | undefined | null): number | null {
  if (u == null || u === "" || u === "Unknown") return null;
  const m = String(u).match(/(\d+)/);
  return m ? parseInt(m[1]!, 10) : null;
}

export async function buildPlanInsights(userId: string): Promise<{
  recommendations: PlanRecommendation[];
  summaryBanner: string;
  hasData: boolean;
  estimatedAnnualSavingsHint: number | null;
}> {
  const ctx = await buildFinancialContextForAssistant(userId);
  const allExpenses = await storage.getExpenses(userId);
  const credit = await storage.getCreditScore(userId);
  const insurance = await storage.getInsuranceRisk(userId);
  const txScore = await storage.getTransactionalScore(userId);
  const goals = await storage.getFinancialGoals(userId);

  const expenseCount = Array.isArray(allExpenses) ? allExpenses.length : 0;
  const hasExpenses = expenseCount > 0;
  const hasFlow =
    (ctx.monthlyIncome ?? 0) > 0 || (ctx.monthlyExpenses ?? 0) > 0 || (ctx.totalBalance ?? 0) !== 0;
  const hasData = hasExpenses || hasFlow;

  const recommendations: PlanRecommendation[] = [];

  const top = ctx.topSpendingCategories?.[0];
  const monthlyExp = ctx.monthlyExpenses ?? 0;
  const monthlyInc = ctx.monthlyIncome ?? 0;
  const savingsRate = ctx.savingsRate ?? 0;

  if (top && monthlyExp > 0) {
    const share = Math.round(((top.amount || 0) / monthlyExp) * 100);
    if (share >= 25) {
      recommendations.push({
        id: "top-category",
        title: "Revisar tu mayor rubro de gasto",
        description: `En los últimos ~30 días, **${top.name}** concentra **${share}%** de tus salidas (${formatClp(top.amount)}). Comparar suscripciones y compras recurrentes puede liberar presión mensual.`,
        actionText: "Ir a gastos",
        actionLink: "/gastos",
        icon: "wallet",
      });
    }
  }

  if (monthlyInc > 0 && savingsRate < 20) {
    const targetSave = monthlyInc * 0.2;
    const actualSave = monthlyInc - monthlyExp;
    const gap = Math.max(0, Math.round(targetSave - actualSave));
    recommendations.push({
      id: "savings-rate",
      title: "Subir la tasa de ahorro",
      description: `Tu tasa de ahorro estimada es **${savingsRate}%** (referencia orientativa 20%). Ingresos **${formatClp(monthlyInc)}**, gastos **${formatClp(monthlyExp)}**. Para acercarte al 20%, podrías orientar unos **${formatClp(gap)}** adicionales al mes al ahorro (estimación).`,
      actionText: "Ver plan",
      actionLink: "/plan",
      icon: "piggy",
    });
  }

  if (credit?.score != null) {
    const utilPct = parseUtilizationPct(credit.utilization);
    if (utilPct != null && utilPct > 30) {
      recommendations.push({
        id: "credit-util",
        title: "Bajar la utilización de crédito",
        description: `Tu utilización reportada es **${utilPct}%**. Por debajo del 30% suele favorecer el score (tu puntaje actual: **${credit.score}**).`,
        actionText: "Ver productos",
        actionLink: "/productos?category=credit_cards",
        icon: "trending",
      });
    } else if (credit.score < 700 && credit.score > 0) {
      recommendations.push({
        id: "credit-score",
        title: "Mejorar tu puntaje crediticio",
        description: `Tu score actual es **${credit.score}**. Pagar a tiempo y reducir deuda de tarjetas ayuda a subirlo; revisa el informe CMF si subiste documentos.`,
        actionText: "Ver panel",
        actionLink: "/panel",
        icon: "landmark",
      });
    }
  }

  if (insurance?.autoRisk === "Medium" || insurance?.autoRisk === "High") {
    recommendations.push({
      id: "insurance-auto",
      title: "Revisar cobertura de seguros",
      description: `Tu perfil marca riesgo automotriz **${insurance.autoRisk}**. Comparar coberturas puede alinear prima y protección.`,
      actionText: "Seguros",
      actionLink: "/productos?category=insurance",
      icon: "shield",
    });
  }

  if (txScore?.mainInsights?.length) {
    const first = txScore.mainInsights[0];
    if (typeof first === "string" && first.trim()) {
      recommendations.push({
        id: "transactional",
        title: "Análisis transaccional (cartola / movimientos)",
        description: first,
        actionText: "Ver panel",
        actionLink: "/panel",
        icon: "target",
      });
    }
  }

  if (!goals?.length && hasData) {
    recommendations.push({
      id: "goals",
      title: "Definir metas de ahorro",
      description:
        "Aún no registramos metas. Definir una meta con monto y fecha ayuda a medir avance con tus datos reales.",
      actionText: "Crear metas",
      actionLink: "/metas",
      icon: "target",
    });
  }

  if (!hasData) {
    recommendations.length = 0;
  }

  let estimatedAnnualSavingsHint: number | null = null;
  if (top && monthlyExp > 0) {
    estimatedAnnualSavingsHint = Math.round(top.amount * 0.1 * 12);
  }

  let summaryBanner: string;
  if (!hasData) {
    summaryBanner =
      "Añade gastos manualmente, importa movimientos desde cartola o sincroniza cuentas para generar recomendaciones con tus cifras reales.";
  } else if (recommendations.length === 0) {
    summaryBanner =
      "Con los datos actuales no detectamos alertas fuertes. Sigue registrando gastos y movimientos para afinar el análisis.";
  } else {
    const extra =
      estimatedAnnualSavingsHint != null && estimatedAnnualSavingsHint > 0
        ? ` Si redujes un 10% en tu mayor rubro durante un año, el ahorro orientativo sería unos **${formatClp(estimatedAnnualSavingsHint)}** (estimación, no garantía).`
        : "";
    summaryBanner = `Hemos identificado **${recommendations.length}** ideas accionables con la información que cargaste (gastos, cuentas y documentos).${extra}`;
  }

  return {
    recommendations,
    summaryBanner,
    hasData,
    estimatedAnnualSavingsHint,
  };
}
