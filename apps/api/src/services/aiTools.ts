/**
 * Herramientas (tool use) para el asistente IA de CODA.
 * Formato compatible con OpenAI / Groq tool calling.
 *
 * Cada herramienta declara su esquema JSON y un handler que recibe los
 * argumentos parseados + el userId del usuario autenticado, y devuelve un
 * string (típicamente JSON serializado) que se envía como `tool` message
 * de vuelta al modelo para que componga la respuesta final.
 */
import { storage } from "../storage.js";
import { logger } from "../logger.js";

// ── Tipos compatibles con OpenAI tool-calling ────────────────────────────────

export interface ToolFunctionDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolDefinition {
  type: "function";
  function: ToolFunctionDef;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

// ── Esquemas de las herramientas disponibles ─────────────────────────────────

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "query_transactions",
      description:
        "Consulta transacciones bancarias del usuario filtrando por comercio (substring en descripción), categoría y rango de fechas. Útil cuando el usuario pregunta por gastos específicos fuera del resumen de 30 días ya incluido en el contexto (p. ej. 'cuánto gasté en Falabella en agosto', 'mis pagos a Netflix este año').",
      parameters: {
        type: "object",
        properties: {
          merchant_contains: {
            type: "string",
            description: "Substring case-insensitive a buscar en la descripción de la transacción. Ej: 'Falabella', 'Netflix', 'Uber'.",
          },
          category: {
            type: "string",
            description: "Categoría exacta de la transacción (p. ej. 'Restaurantes', 'Transporte', 'Suscripciones').",
          },
          from: {
            type: "string",
            description: "Fecha inicial en formato YYYY-MM-DD. Default: hace 90 días.",
          },
          to: {
            type: "string",
            description: "Fecha final en formato YYYY-MM-DD. Default: hoy.",
          },
          limit: {
            type: "number",
            description: "Máximo de transacciones a devolver en el detalle (default 20, máx 100). El resumen agregado siempre cubre todas las transacciones del filtro.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "simulate_loan",
      description:
        "Simula un crédito de consumo en pesos chilenos: calcula cuota mensual, costo total, intereses totales y CAE estimada usando la fórmula de cuota fija (sistema francés). Usar cuando el usuario pregunta '¿cuánto me costaría un crédito de X a Y meses?' o quiere comparar opciones.",
      parameters: {
        type: "object",
        properties: {
          amount_clp: {
            type: "number",
            description: "Monto del crédito en pesos chilenos. Requerido.",
          },
          term_months: {
            type: "number",
            description: "Plazo en meses. Requerido (típico: 12 a 60).",
          },
          annual_rate_percent: {
            type: "number",
            description: "Tasa de interés anual en porcentaje (no decimal). Si se omite, se usa 28% como aproximación promedio de mercado para crédito de consumo (la tasa máxima convencional CMF ronda 36%).",
          },
        },
        required: ["amount_clp", "term_months"],
      },
    },
  },
];

// ── Handlers ─────────────────────────────────────────────────────────────────

interface QueryTxArgs {
  merchant_contains?: string;
  category?: string;
  from?: string;
  to?: string;
  limit?: number;
}

function parseDateOr(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return isNaN(d.getTime()) ? fallback : d;
}

async function queryTransactions(args: QueryTxArgs, userId: string): Promise<string> {
  const to = parseDateOr(args.to, new Date());
  const from = parseDateOr(
    args.from,
    new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000),
  );
  const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 20)));
  const merchant = args.merchant_contains?.trim().toLowerCase();
  const category = args.category?.trim().toLowerCase();

  const accounts = await storage.getAccounts(userId);
  if (accounts.length === 0) {
    return JSON.stringify({ matches: 0, note: "El usuario no tiene cuentas conectadas." });
  }

  const accountIds = accounts.map((a: { id: number }) => a.id);
  const all = await storage.getTransactionsForAccounts(accountIds, { from });

  const filtered = all.filter((t: { postedAt?: string; description?: string; category?: string }) => {
    if (!t?.postedAt) return false;
    const d = new Date(t.postedAt);
    if (d < from || d > to) return false;
    if (merchant && !(t.description ?? "").toLowerCase().includes(merchant)) return false;
    if (category && (t.category ?? "").toLowerCase() !== category) return false;
    return true;
  });

  let totalIncome = 0;
  let totalExpense = 0;
  for (const t of filtered) {
    const amt = parseFloat(String((t as { amount?: unknown }).amount ?? 0));
    if (amt > 0) totalIncome += amt;
    else totalExpense += Math.abs(amt);
  }

  const sample = filtered
    .sort(
      (a: { postedAt?: string }, b: { postedAt?: string }) =>
        new Date(b.postedAt!).getTime() - new Date(a.postedAt!).getTime(),
    )
    .slice(0, limit)
    .map((t: { postedAt?: string; description?: string; category?: string; amount?: unknown }) => ({
      date: t.postedAt ? new Date(t.postedAt).toISOString().slice(0, 10) : null,
      description: t.description ?? "",
      category: t.category ?? null,
      amount_clp: Math.round(parseFloat(String(t.amount ?? 0))),
    }));

  return JSON.stringify({
    filters: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      merchant_contains: args.merchant_contains ?? null,
      category: args.category ?? null,
    },
    matches: filtered.length,
    total_income_clp: Math.round(totalIncome),
    total_expense_clp: Math.round(totalExpense),
    net_clp: Math.round(totalIncome - totalExpense),
    transactions: sample,
  });
}

interface SimulateLoanArgs {
  amount_clp?: number;
  term_months?: number;
  annual_rate_percent?: number;
}

function simulateLoan(args: SimulateLoanArgs): string {
  const amount = Number(args.amount_clp);
  const months = Math.floor(Number(args.term_months));
  const annualPct = args.annual_rate_percent != null ? Number(args.annual_rate_percent) : 28;

  if (!isFinite(amount) || amount <= 0) {
    return JSON.stringify({ error: "amount_clp debe ser un número positivo." });
  }
  if (!isFinite(months) || months <= 0 || months > 600) {
    return JSON.stringify({ error: "term_months debe estar entre 1 y 600." });
  }
  if (!isFinite(annualPct) || annualPct < 0 || annualPct > 200) {
    return JSON.stringify({ error: "annual_rate_percent debe estar entre 0 y 200." });
  }

  const monthlyRate = annualPct / 100 / 12;
  let monthlyPayment: number;
  if (monthlyRate === 0) {
    monthlyPayment = amount / months;
  } else {
    const factor = Math.pow(1 + monthlyRate, months);
    monthlyPayment = (amount * monthlyRate * factor) / (factor - 1);
  }
  const totalPaid = monthlyPayment * months;
  const totalInterest = totalPaid - amount;

  return JSON.stringify({
    amount_clp: Math.round(amount),
    term_months: months,
    annual_rate_percent: annualPct,
    monthly_payment_clp: Math.round(monthlyPayment),
    total_paid_clp: Math.round(totalPaid),
    total_interest_clp: Math.round(totalInterest),
    note:
      args.annual_rate_percent == null
        ? "Tasa asumida: 28% anual (aprox. promedio mercado consumo Chile). La tasa máxima convencional CMF ronda 36%."
        : undefined,
  });
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  argsJson: string,
  userId: string,
): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch (_e) {
    return JSON.stringify({ error: `Argumentos inválidos para ${name}: no es JSON.` });
  }

  try {
    switch (name) {
      case "query_transactions":
        return await queryTransactions(args as QueryTxArgs, userId);
      case "simulate_loan":
        return simulateLoan(args as SimulateLoanArgs);
      default:
        return JSON.stringify({ error: `Herramienta desconocida: ${name}` });
    }
  } catch (err) {
    logger.error({ err, tool: name }, "Tool execution failed");
    return JSON.stringify({ error: `Error ejecutando ${name}.` });
  }
}
