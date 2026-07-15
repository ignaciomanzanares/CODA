import type { Express, Request, Response } from "express";
import { storage } from "./storage.js";

import { authenticate, ensureUserForToken, type AuthenticatedRequest } from "./middleware/auth.js";

import { logger } from "./logger.js";

export async function registerTransactionsInsightsRoutes(app: Express): Promise<void> {
  /** Prevents duplicate financial alert notifications (max 1 per user per day). */
  const financialAlertsSent = new Set<string>();
  app.get("/api/transactions/parsed", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });

      // Lee de la tabla normalizada `transactions` (fuente de verdad) + `accounts`,
      // para mostrar cuenta/producto y filtrar por él. Antes leía parsed_data (JSON).
      const userAccounts = await storage.getAccounts(userId);
      const accById = new Map<
        number,
        { id: number; name?: string | null; type?: string | null; subtype?: string | null }
      >(userAccounts.map((a: { id: number }) => [a.id as number, a as never]));
      const accIds = userAccounts.map((a: { id: number }) => a.id as number);
      const rows = accIds.length ? await storage.getTransactionsForAccounts(accIds) : [];

      // Producto legible + clave de filtro (Cuenta corriente / TC Nacional / TC Internacional).
      function productOf(a: { name?: string | null; subtype?: string | null } | undefined): {
        key: string;
        label: string;
      } {
        const name = a?.name ?? "Cuenta";
        if (a?.subtype === "credit_card") {
          if (/internacional/i.test(name))
            return { key: "tc_internacional", label: `${name} \u00b7 Tarjeta cr\u00e9dito` };
          if (/nacional/i.test(name))
            return { key: "tc_nacional", label: `${name} \u00b7 Tarjeta cr\u00e9dito` };
          return { key: "tc", label: `${name} \u00b7 Tarjeta cr\u00e9dito` };
        }
        return { key: "checking", label: `${name} \u00b7 Cuenta corriente` };
      }

      function parseNumberLike(value: unknown): number | null {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value !== "string") return null;
        const normalized = value
          .replace(/\./g, "")
          .replace(",", ".")
          .replace(/[^\d.-]/g, "");
        const n = Number(normalized);
        return Number.isFinite(n) ? n : null;
      }

      function rawBalance(raw: unknown, subtype?: string | null): number | null {
        if (subtype === "credit_card") return null;
        const data =
          typeof raw === "string"
            ? (() => {
                try {
                  return JSON.parse(raw) as Record<string, unknown>;
                } catch {
                  return null;
                }
              })()
            : raw && typeof raw === "object"
              ? (raw as Record<string, unknown>)
              : null;
        if (!data) return null;
        for (const key of [
          "saldo",
          "balance",
          "saldoFinal",
          "saldo_final",
          "saldoDisponible",
          "saldo_disponible",
          "saldoContable",
          "saldo_contable",
        ]) {
          const value = parseNumberLike(data[key]);
          if (value != null) return value;
        }
        return null;
      }

      // Flag de revisión manual de categoría (fuente única: reviewStatus).
      const { requiresReview, isManualCategory } =
        await import("./services/transactions/reviewStatus.js");

      const transactions = (rows as Array<Record<string, unknown>>).map((t) => {
        const acc = accById.get(t.accountId as number);
        const monto = Number(t.amount);
        const prod = productOf(acc);
        const reviewTx = {
          category: (t.category as string) ?? null,
          categoryConfidence:
            typeof t.categoryConfidence === "number" ? t.categoryConfidence : null,
          categoryRuleId: (t.categoryRuleId as string) ?? null,
          categorizerVersion: (t.categorizerVersion as string) ?? null,
        };
        return {
          id: String(t.id),
          fecha: String(t.postedAt).slice(0, 10),
          descripcion: (t.description as string) ?? "",
          monto,
          tipo: monto >= 0 ? "ingreso" : "egreso",
          saldo: rawBalance(t.raw, acc?.subtype ?? null),
          banco: acc?.name ?? null,
          accountId: t.accountId as number,
          accountName: acc?.name ?? null,
          accountType: acc?.type ?? null,
          accountSubtype: acc?.subtype ?? null,
          product: prod.key,
          productLabel: prod.label,
          categoria: (t.category as string) ?? "otro",
          category_confidence: reviewTx.categoryConfidence,
          requiresReview: requiresReview(reviewTx),
          isManual: isManualCategory(reviewTx),
          isInternalTransfer: Number(t.isInternalTransfer ?? 0) === 1,
          periodoDesde: null,
          periodoHasta: null,
        };
      });

      transactions.sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : 0));
      res.json({ transactions, count: transactions.length });
    } catch (e) {
      logger.error({ err: e }, "Failed to get parsed transactions");
      res.status(500).json({ message: "Error al obtener transacciones." });
    }
  });

  // PATCH /api/transactions/:id/category — update a single transaction's category
  const VALID_CATEGORIES = new Set([
    "vivienda",
    "alimentacion",
    "transporte",
    "seguros",
    "servicios_basicos",
    "salud_bienestar",
    "educacion",
    "cuidado_personal",
    "diversion",
    "hobbies",
    "suscripciones",
    "deudas",
    "inversiones",
    "ahorros",
    "regalos",
    "reparaciones",
    "imprevistos",
    "telecomunicaciones",
    "transferencia_enviada",
    "transferencia_recibida",
    "comercio",
    "entretenimiento",
    "restaurantes",
    "salud",
    "ingreso_principal",
    "servicios",
    "otro",
  ]);

  app.patch("/api/transactions/:id/category", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });

      const { category, subcategory } = req.body as {
        category?: string;
        subcategory?: string | null;
      };
      if (!category || !VALID_CATEGORIES.has(category)) {
        return res
          .status(400)
          .json({ message: `Categoría inválida. Opciones: ${[...VALID_CATEGORIES].join(", ")}` });
      }
      const sub = typeof subcategory === "string" ? subcategory.trim() || null : null;

      // El id es el de la fila en la tabla `transactions` (fuente de verdad), igual
      // que el que devuelve GET /api/transactions/parsed. Se actualiza ahí (no en
      // parsed_data) verificando que la cuenta sea del usuario. La corrección queda
      // marcada como MANUAL (rule_id=manual:user) para que el recategorizador no la pise.
      const txId = req.params.id;
      const idNum = parseInt(txId, 10);
      if (isNaN(idNum)) return res.status(400).json({ message: "ID de transacción inválido." });

      const ok = await storage.updateTransactionCategory(idNum, userId, category, {
        subcategory: sub,
      });
      if (!ok) return res.status(404).json({ message: "Transacción no encontrada." });

      res.json({ id: txId, category, subcategory: sub, manual: true });
    } catch (e) {
      logger.error({ err: e }, "Failed to update transaction category");
      res.status(500).json({ message: "Error al actualizar categoría." });
    }
  });

  // GET /api/transactions/summary — income, expenses, and balance summary
  app.get("/api/transactions/summary", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });

      // Fuente de verdad: tabla `transactions` (no parsed_data). Este resumen es BRUTO
      // (incluye todo lo que aparece en cartolas) y alimenta la vista Movimientos; el
      // Panel/Salud usan los endpoints que excluyen transferencias internas.
      const { getUserNormalizedTransactions, getReportedBalance } =
        await import("./services/normalizedTransactions.js");
      const { transactions: txs } = await getUserNormalizedTransactions(userId);
      const documentCount = (await storage.listDocumentUploadsByType(userId, "cartola")).length;

      let totalIncome = 0;
      let totalExpenses = 0;
      let transactionCount = 0;
      const categoryBreakdown: Record<string, { count: number; total: number }> = {};
      const monthlyData: Record<string, { income: number; expenses: number }> = {};

      for (const t of txs) {
        const monto = t.tipo === "ingreso" ? t.abono : t.cargo;
        if (monto === 0) continue;
        transactionCount++;

        if (t.tipo === "ingreso") totalIncome += monto;
        else totalExpenses += monto;

        if (!categoryBreakdown[t.categoria])
          categoryBreakdown[t.categoria] = { count: 0, total: 0 };
        categoryBreakdown[t.categoria].count++;
        categoryBreakdown[t.categoria].total += monto;

        if (!monthlyData[t.month]) monthlyData[t.month] = { income: 0, expenses: 0 };
        if (t.tipo === "ingreso") monthlyData[t.month].income += monto;
        else monthlyData[t.month].expenses += monto;
      }

      // Sort monthly data by date
      const sortedMonthlyData = Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({ month, ...data }));

      const currentBalance = await getReportedBalance(userId);

      // Compute monthly averages using the last 3 months (more stable than all-time totals)
      const recentMonths = sortedMonthlyData.slice(-3);
      const avgMonthlyIncome =
        recentMonths.length > 0
          ? Math.round(recentMonths.reduce((s, m) => s + m.income, 0) / recentMonths.length)
          : Math.round(totalIncome / Math.max(1, sortedMonthlyData.length));
      const avgMonthlyExpenses =
        recentMonths.length > 0
          ? Math.round(recentMonths.reduce((s, m) => s + m.expenses, 0) / recentMonths.length)
          : Math.round(totalExpenses / Math.max(1, sortedMonthlyData.length));

      res.json({
        summary: {
          totalIncome,
          totalExpenses,
          netBalance: totalIncome - totalExpenses,
          currentBalance,
          transactionCount,
          documentCount,
          avgMonthlyIncome,
          avgMonthlyExpenses,
        },
        categoryBreakdown,
        monthlyData: sortedMonthlyData,
      });
    } catch (e) {
      logger.error({ err: e }, "Failed to get transactions summary");
      res.status(500).json({ message: "Error al obtener el resumen de transacciones." });
    }
  });

  // GET /api/transactions/monthly-comparison — per-category monthly spending for MoM comparison
  app.get(
    "/api/transactions/monthly-comparison",
    authenticate,
    async (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;
      try {
        const userId = await ensureUserForToken(authReq.user!);
        if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });

        // Fuente de verdad: tabla `transactions`. Comparación de GASTO por categoría →
        // excluye transferencias internas (pago de tarjeta/divisas) para no inflar.
        const { isInternalTransferTx } = await import("./services/assistantContext.js");
        const { getUserNormalizedTransactions } =
          await import("./services/normalizedTransactions.js");
        const { transactions: txs } = await getUserNormalizedTransactions(userId);

        // month → category → total
        const grid: Record<string, Record<string, number>> = {};
        const allCategories = new Set<string>();

        for (const t of txs) {
          if (isInternalTransferTx(t)) continue;
          if (t.tipo !== "egreso" || t.cargo <= 0) continue;
          if (!grid[t.month]) grid[t.month] = {};
          grid[t.month][t.categoria] = (grid[t.month][t.categoria] ?? 0) + t.cargo;
          allCategories.add(t.categoria);
        }

        // Build sorted months array
        const months = Object.keys(grid).sort();
        const categories = [...allCategories].sort();

        // Build comparison rows per category
        const comparison = categories
          .map((cat) => {
            const monthlyTotals = months.map((m) => ({
              month: m,
              total: grid[m]?.[cat] ?? 0,
            }));

            // Calculate MoM change for the last two months
            const last =
              monthlyTotals.length >= 1 ? monthlyTotals[monthlyTotals.length - 1].total : 0;
            const prev =
              monthlyTotals.length >= 2 ? monthlyTotals[monthlyTotals.length - 2].total : 0;
            const change = prev > 0 ? Math.round(((last - prev) / prev) * 100) : null;

            return {
              categoria: cat,
              months: monthlyTotals,
              lastMonth: last,
              previousMonth: prev,
              changePct: change,
            };
          })
          .sort((a, b) => b.lastMonth - a.lastMonth);

        res.json({ months, comparison });
      } catch (e) {
        logger.error({ err: e }, "Failed to get monthly comparison");
        res.status(500).json({ message: "Error al obtener comparación mensual." });
      }
    },
  );

  // GET /api/transactions/monthly-flow — income vs expenses by data month
  app.get("/api/transactions/monthly-flow", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });

      const { getUserNormalizedTransactions } =
        await import("./services/normalizedTransactions.js");
      const { buildMonthlyFlow } = await import("./services/monthlyFlow.js");
      const { transactions: txs } = await getUserNormalizedTransactions(userId);
      const view = req.query.view === "raw" ? "raw" : "real";
      const product =
        typeof req.query.product === "string" && req.query.product !== "all"
          ? req.query.product
          : null;
      res.json({ months: buildMonthlyFlow(txs, { view, product }), view });
    } catch (e) {
      logger.error({ err: e }, "Failed to get monthly flow");
      res.status(500).json({ message: "Error al obtener flujo mensual." });
    }
  });

  // GET /api/transactions/insights — behavioral insights derived from cartola data
  app.get("/api/transactions/insights", authenticate, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    try {
      const userId = await ensureUserForToken(authReq.user!);
      if (!userId) return res.status(404).json({ message: "Usuario no encontrado." });

      // Fuente de verdad: tabla `transactions`. Excluye internos para no inflar el
      // gasto (mismo predicado que monthly-flow / dashboard). Terceros se mantienen.
      const { isInternalTransferTx } = await import("./services/assistantContext.js");
      const { getUserNormalizedTransactions, getReportedBalance } =
        await import("./services/normalizedTransactions.js");
      const { transactions: allTxs } = await getUserNormalizedTransactions(userId);

      // Collect all egresos with category and date
      const egresos: { fecha: string; monto: number; categoria: string; dia: number }[] = [];
      const seen = new Set<string>();

      for (const t of allTxs) {
        if (isInternalTransferTx(t)) continue;
        if (t.tipo !== "egreso" || t.cargo <= 0) continue;
        const key = `${t.postedAt}|${t.descripcion.trim().toLowerCase()}|${t.cargo}`;
        if (seen.has(key)) continue;
        seen.add(key);
        egresos.push({ fecha: t.postedAt, monto: t.cargo, categoria: t.categoria, dia: t.day });
      }

      // ── Gastos por categoría ──────────────────────────────────────────────
      const byCategoria: Record<string, number> = {};
      for (const e of egresos) {
        byCategoria[e.categoria] = (byCategoria[e.categoria] ?? 0) + e.monto;
      }
      const totalEgresos = Object.values(byCategoria).reduce((s, v) => s + v, 0);
      const spendingByCategory = Object.entries(byCategoria)
        .map(([cat, total]) => ({
          categoria: cat,
          total,
          pct: totalEgresos > 0 ? Math.round((total / totalEgresos) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total);

      // ── Smart Insights ────────────────────────────────────────────────────
      const insights: { type: string; title: string; body: string; icon: string }[] = [];

      // 1. Quincena fuerte: ¿más gasto en primera o segunda mitad del mes?
      const primeraQ = egresos.filter((e) => e.dia <= 15).reduce((s, e) => s + e.monto, 0);
      const segundaQ = egresos.filter((e) => e.dia > 15).reduce((s, e) => s + e.monto, 0);
      if (primeraQ > 0 || segundaQ > 0) {
        if (primeraQ > segundaQ * 1.3) {
          insights.push({
            type: "pattern",
            icon: "calendar",
            title: "Gastas más los primeros 15 días",
            body: `El ${Math.round((primeraQ / (primeraQ + segundaQ)) * 100)}% de tus egresos ocurren en la primera quincena del mes.`,
          });
        } else if (segundaQ > primeraQ * 1.3) {
          insights.push({
            type: "pattern",
            icon: "calendar",
            title: "Gastas más la segunda quincena",
            body: `El ${Math.round((segundaQ / (primeraQ + segundaQ)) * 100)}% de tus egresos ocurren en la segunda mitad del mes.`,
          });
        }
      }

      // 2. Categoría dominante
      if (spendingByCategory.length > 0) {
        const top = spendingByCategory[0];
        if (top.pct >= 30) {
          const labels: Record<string, string> = {
            alimentacion: "Alimentación",
            transporte: "Transporte",
            entretenimiento: "Entretenimiento",
            telecomunicaciones: "Telecomunicaciones",
            transferencia_enviada: "Transferencias",
            comercio: "Comercio",
            educacion: "Educación",
            salud: "Salud",
            otro: "Otros",
          };
          insights.push({
            type: "alert",
            icon: "pie-chart",
            title: `${labels[top.categoria] ?? top.categoria} concentra el ${top.pct}% de tus gastos`,
            body: "Evalúa si puedes reducir o renegociar en esta categoría.",
          });
        }
      }

      // 3. Pagos recurrentes
      const descCount: Record<string, number> = {};
      for (const e of egresos) {
        const k = e.categoria + "|" + e.monto;
        descCount[k] = (descCount[k] ?? 0) + 1;
      }
      const recurrentes = Object.entries(descCount).filter(([, v]) => v >= 2).length;
      if (recurrentes > 0) {
        insights.push({
          type: "info",
          icon: "repeat",
          title: `${recurrentes} cargo${recurrentes > 1 ? "s" : ""} recurrente${recurrentes > 1 ? "s" : ""} detectado${recurrentes > 1 ? "s" : ""}`,
          body: "Revisa si todos los cargos periódicos siguen siendo necesarios.",
        });
      }

      // 4. Balance saludable
      const ingresos = allTxs.reduce((s, t) => {
        if (isInternalTransferTx(t)) return s; // mismo predicado consolidado
        return s + t.abono;
      }, 0);
      const tasaAhorro =
        ingresos > 0 ? Math.round(((ingresos - totalEgresos) / ingresos) * 100) : 0;
      if (ingresos > 0 && totalEgresos > 0) {
        if (tasaAhorro >= 20) {
          insights.push({
            type: "positive",
            icon: "trending-up",
            title: `Tasa de ahorro del ${tasaAhorro}%`,
            body: "Estás ahorrando sobre el umbral recomendado del 20%. ¡Buen trabajo!",
          });
        } else if (tasaAhorro < 5 && tasaAhorro >= 0) {
          insights.push({
            type: "warning",
            icon: "alert-triangle",
            title: `Tasa de ahorro baja (${tasaAhorro}%)`,
            body: "Tus egresos consumen casi la totalidad de tus ingresos. Considera reducir gastos variables.",
          });
        } else if (tasaAhorro < 0) {
          insights.push({
            type: "alert",
            icon: "alert-circle",
            title: "Egresos superan ingresos",
            body: `Tus gastos superan tus ingresos en un ${Math.abs(tasaAhorro)}% en el período analizado.`,
          });
        }
      }

      // 5. Savings projection — if positive savings, project 6 and 12 months
      if (ingresos > 0 && tasaAhorro > 0) {
        const ahorroMensual = Math.round(ingresos - totalEgresos);
        const ahorro6m = ahorroMensual * 6;
        const ahorro12m = ahorroMensual * 12;
        const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 0 });
        insights.push({
          type: "positive",
          icon: "piggy-bank",
          title: `Podrías ahorrar $${fmt(ahorro12m)} en 12 meses`,
          body: `Manteniendo tu ritmo actual (~$${fmt(ahorroMensual)}/mes), en 6 meses acumularías ~$${fmt(ahorro6m)} y en 1 año ~$${fmt(ahorro12m)}. Automatizar la transferencia a una cuenta de ahorro protege ese monto.`,
        });
      }

      // 6. Category reduction tip — top category reduction by 15%
      if (spendingByCategory.length > 0 && totalEgresos > 0) {
        const top = spendingByCategory[0];
        const labels: Record<string, string> = {
          alimentacion: "alimentación",
          transporte: "transporte",
          entretenimiento: "entretenimiento",
          telecomunicaciones: "telecomunicaciones",
          transferencia_enviada: "transferencias",
          comercio: "comercio",
          educacion: "educación",
          salud: "salud",
          otro: "otros",
        };
        const reduction = Math.round(top.total * 0.15);
        const annualSave = reduction * 12;
        if (reduction > 1000 && top.pct >= 20) {
          const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 0 });
          insights.push({
            type: "info",
            icon: "lightbulb",
            title: `Reducir ${labels[top.categoria] ?? top.categoria} un 15% = $${fmt(reduction)}/mes`,
            body: `Si logras bajar tu gasto en ${labels[top.categoria] ?? top.categoria} un 15%, ahorrarías ~$${fmt(annualSave)} al año. Evalúa suscripciones, frecuencia de compras y alternativas más económicas.`,
          });
        }
      }

      // 7. Recurring expense total
      const recurringDescs: { desc: string; monto: number; count: number }[] = [];
      const descMontoCount: Record<string, { desc: string; monto: number; count: number }> = {};
      for (const e of egresos) {
        const k = `${e.monto}`;
        if (!descMontoCount[k]) descMontoCount[k] = { desc: e.categoria, monto: e.monto, count: 0 };
        descMontoCount[k].count++;
      }
      let totalRecurrente = 0;
      for (const v of Object.values(descMontoCount)) {
        if (v.count >= 2) {
          recurringDescs.push(v);
          totalRecurrente += v.monto;
        }
      }
      if (totalRecurrente > 0 && ingresos > 0) {
        const pctRecurrente = Math.round((totalRecurrente / ingresos) * 100);
        if (pctRecurrente >= 15) {
          const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 0 });
          insights.push({
            type: pctRecurrente >= 50 ? "warning" : "info",
            icon: "repeat",
            title: `$${fmt(totalRecurrente)} en cargos recurrentes (${pctRecurrente}% de ingresos)`,
            body: `Tus pagos periódicos consumen el ${pctRecurrente}% de tus ingresos. Renegociar planes de telefonía, streaming o seguros puede liberar dinero mensual.`,
          });
        }
      }

      // 8. Emergency fund check
      if (ingresos > 0) {
        const gastoMensual = totalEgresos;
        const saldoActual: number = (await getReportedBalance(userId)) ?? 0;
        const mesesCubiertos =
          gastoMensual > 0 ? Math.round((saldoActual / gastoMensual) * 10) / 10 : 0;
        const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 0 });
        if (mesesCubiertos < 1 && saldoActual > 0) {
          insights.push({
            type: "warning",
            icon: "shield",
            title: `Fondo de emergencia: ${mesesCubiertos} meses de gastos`,
            body: `Tu saldo actual ($${fmt(saldoActual)}) cubre menos de 1 mes de gastos. Se recomienda tener al menos 3 meses como colchón financiero.`,
          });
        } else if (mesesCubiertos >= 3) {
          insights.push({
            type: "positive",
            icon: "shield",
            title: `Fondo de emergencia saludable: ${mesesCubiertos} meses`,
            body: `Tu saldo cubre ${mesesCubiertos} meses de gastos. Superas el mínimo recomendado de 3 meses. Considera un depósito a plazo para rentabilizar ese excedente.`,
          });
        }
      }

      // ── Financial alert notifications (fire-and-forget, max 1/day/user) ─
      const alertKey = `alerts:${userId}:${new Date().toISOString().slice(0, 10)}`;
      if (!financialAlertsSent.has(alertKey) && ingresos > 0) {
        financialAlertsSent.add(alertKey);

        // Alert: savings rate below 20%
        if (tasaAhorro < 20 && tasaAhorro >= 0) {
          const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 0 });
          storage
            .createNotification({
              userId,
              title: `Tu tasa de ahorro bajó al ${tasaAhorro}%`,
              message: `Tu tasa de ahorro actual (${tasaAhorro}%) está por debajo del 20% recomendado. Tus egresos suman $${fmt(totalEgresos)} vs ingresos de $${fmt(ingresos)}.`,
              type: tasaAhorro < 5 ? "warning" : "info",
              category: "expense",
            })
            .catch(() => {});
        }

        // Alert: category spike (any category > 40% of total spending)
        for (const cat of spendingByCategory) {
          if (cat.pct >= 40) {
            const catLabels: Record<string, string> = {
              alimentacion: "Alimentación",
              transporte: "Transporte",
              entretenimiento: "Entretenimiento",
              telecomunicaciones: "Telecomunicaciones",
              transferencia_enviada: "Transferencias",
              comercio: "Comercio",
              educacion: "Educación",
              salud: "Salud",
              otro: "Otros",
            };
            storage
              .createNotification({
                userId,
                title: `Alerta: ${catLabels[cat.categoria] ?? cat.categoria} al ${cat.pct}% de tus gastos`,
                message: `La categoría ${catLabels[cat.categoria] ?? cat.categoria} concentra el ${cat.pct}% de tus egresos totales. Revisa si hay gastos que puedas optimizar.`,
                type: "warning",
                category: "expense",
                actionUrl: `/movimientos?categoria=${encodeURIComponent(cat.categoria)}`,
              })
              .catch(() => {});
            break; // Only alert for the top offender
          }
        }
      }

      res.json({ spendingByCategory, insights, totalEgresos, totalIngresos: ingresos });
    } catch (e) {
      logger.error({ err: e }, "Failed to compute transaction insights");
      res.status(500).json({ message: "Error al calcular insights." });
    }
  });

  // GET /api/financial-health — decision tree evaluation + government programs eligibility
}
