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

  // Smart chips based on user's actual financial situation
  const top = ctx.topSpendingCategories?.[0];
  if (top?.name) {
    chips.push(`¿Cómo reduzco gastos en ${top.name}?`);
  }

  if (ctx.savingsRate != null && ctx.savingsRate < 20 && inc > 0) {
    chips.push("¿Cómo puedo ahorrar más cada mes?");
  } else if (ctx.savingsRate != null && ctx.savingsRate >= 20) {
    chips.push("¿Dónde me conviene invertir?");
  }

  if (ctx.debts && ctx.debts.length > 0) {
    chips.push("¿Cómo pago mis deudas más rápido?");
  }

  if (ctx.creditScore && ctx.creditScore < 650) {
    chips.push("¿Cómo mejoro mi score crediticio?");
  }

  if ((ctx.financialGoals?.length ?? 0) > 0) {
    chips.push("¿Cómo voy con mis metas?");
  }

  // Fill remaining slots
  if (chips.length < 4) chips.push("¿Qué productos financieros me convienen?");
  if (chips.length < 4) chips.push("Resume mis finanzas del mes");

  // Build welcome message with key stats
  let welcome: string;
  if (hasData) {
    const parts: string[] = [
      `¡Hola! 👋 Soy tu asistente financiero de CODA.`,
      "",
      `Según tus datos del último mes:`,
    ];

    if (inc > 0) parts.push(`• Ingresos: **${formatClp(inc)}**`);
    if (exp > 0) parts.push(`• Gastos: **${formatClp(exp)}**`);
    if (ctx.savingsRate != null) {
      const emoji = ctx.savingsRate >= 20 ? "✅" : ctx.savingsRate >= 10 ? "⚠️" : "🔴";
      parts.push(`• Tasa de ahorro: **${ctx.savingsRate}%** ${emoji}`);
    }
    if (ctx.creditScore) {
      parts.push(`• Score crediticio: **${ctx.creditScore}/850**`);
    }

    parts.push(
      "",
      "Pregúntame lo que necesites — conozco tus números y te doy consejos personalizados.",
    );
    welcome = parts.join("\n");
  } else {
    welcome = `¡Hola! 👋 Soy tu asistente financiero de CODA.\n\nAún no tienes datos cargados. Para darte consejos personalizados, puedes:\n• **Subir una cartola bancaria** desde tu perfil\n• **Sincronizar cuentas** vía Open Finance\n• **Registrar gastos** manualmente\n\nMientras tanto, pregúntame lo que quieras sobre finanzas personales en Chile.`;
  }

  return {
    welcome,
    chips: chips.slice(0, 4),
  };
}
