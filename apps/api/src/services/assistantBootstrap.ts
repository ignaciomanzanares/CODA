/**
 * Mensaje inicial y chips del asistente según datos reales del usuario.
 */
import { buildFinancialContextForAssistant } from "./assistantContext.js";

function formatClp(n: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

export async function buildAssistantBootstrap(userId: string): Promise<{
  welcome: string;
  chips: string[];
}> {
  const ctx = await buildFinancialContextForAssistant(userId);
  const inc = ctx.monthlyIncome ?? 0;
  const exp = ctx.monthlyExpenses ?? 0;
  const hasData =
    inc > 0 ||
    exp > 0 ||
    (ctx.topSpendingCategories?.length ?? 0) > 0 ||
    (ctx.totalBalance ?? 0) !== 0;

  const chips: string[] = [];
  const top = ctx.topSpendingCategories?.[0];
  if (top?.name) {
    chips.push(`¿Cómo puedo reducir gastos en ${top.name}?`);
  }
  if (ctx.savingsRate !== undefined && ctx.savingsRate < 20 && inc > 0) {
    chips.push(`Mi tasa de ahorro es ${ctx.savingsRate}%. ¿Qué puedo hacer?`);
  }
  if ((ctx.financialGoals?.length ?? 0) > 0) {
    chips.push("¿Cómo voy con mis metas financieras?");
  }
  chips.push("Resume mis ingresos y gastos del último mes");

  const welcome = hasData
    ? `Hola. Con **tus movimientos y datos cargados** (últimos ~30 días): ingresos aprox. **${formatClp(inc)}**, gastos aprox. **${formatClp(exp)}**, tasa de ahorro **${ctx.savingsRate ?? 0}%**. Pregunta lo que necesites y lo enlazo con estos números.`
    : `Hola. **Aún no hay bastantes datos** para un análisis con cifras: registra gastos, importa una cartola o sincroniza cuentas. Cuando haya información, las respuestas se basarán en eso.`;

  return {
    welcome,
    chips: chips.slice(0, 4),
  };
}
