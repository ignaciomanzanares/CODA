/**
 * Recordatorios proactivos de cobros recurrentes (notificaciones v1 #1).
 *
 * - Preview (dry-run, sin escribir): `getUpcomingRecurringForUser` → lo que se
 *   NOTIFICARÍA para un usuario. Lo usa el endpoint de preview para validar la
 *   lógica sobre data real sin generar nada.
 * - Job diario: `runRecurringRemindersForAllUsers` → recorre usuarios con cuentas,
 *   deduplica por (comercio, ciclo mensual) contra notificaciones existentes y crea
 *   la notificación (que además dispara push). Gateado por RECURRING_REMINDERS_ENABLED.
 */
import { db, accounts } from "../../db/index.js";
import { logger } from "../../logger.js";
import { notificationService } from "../notificationService.js";
import { getUserNormalizedTransactions } from "../normalizedTransactions.js";
import {
  detectUpcomingRecurringCharges,
  type UpcomingCharge,
  type DetectOptions,
} from "./recurringDetector.js";

/** El job diario solo corre si el flag está explícitamente en "true" (rollout seguro). */
export function recurringRemindersEnabled(): boolean {
  return process.env.RECURRING_REMINDERS_ENABLED === "true";
}

/** Próximos cobros recurrentes de un usuario (dry-run: no escribe nada). */
export async function getUpcomingRecurringForUser(
  userId: string,
  opts: DetectOptions = {},
): Promise<UpcomingCharge[]> {
  const { transactions } = await getUserNormalizedTransactions(userId);
  return detectUpcomingRecurringCharges(
    transactions.map((t) => ({
      description: t.description,
      postedAt: t.postedAt,
      amount: t.amount,
      isInternalTransfer: t.isInternalTransfer,
    })),
    opts,
  );
}

/** Clave de dedup por ciclo: mismo comercio + mismo mes de cobro. */
function dedupKey(merchant: string, cycle: string): string {
  return `${merchant}|${cycle}`;
}

/**
 * Genera los recordatorios pendientes para un usuario, deduplicando contra los ya
 * enviados. Devuelve cuántas notificaciones nuevas creó.
 */
export async function runRecurringRemindersForUser(
  userId: string,
  opts: DetectOptions = {},
): Promise<number> {
  const upcoming = await getUpcomingRecurringForUser(userId, opts);
  if (upcoming.length === 0) return 0;

  // Notificaciones recientes de gasto → set de claves ya enviadas (no re-notificar
  // el mismo cobro del mismo ciclo).
  const recent = await notificationService.getNotifications(userId, {
    category: "expense",
    limit: 100,
  });
  const sent = new Set<string>();
  for (const n of recent) {
    if (!n.metadata) continue;
    try {
      const m = JSON.parse(n.metadata) as { kind?: string; merchant?: string; cycle?: string };
      if (m.kind === "recurring_charge" && m.merchant && m.cycle) {
        sent.add(dedupKey(m.merchant, m.cycle));
      }
    } catch {
      /* metadata no-JSON: ignorar */
    }
  }

  let created = 0;
  for (const c of upcoming) {
    if (sent.has(dedupKey(c.merchant, c.cycle))) continue;
    await notificationService.notifyRecurringCharge(userId, c);
    sent.add(dedupKey(c.merchant, c.cycle));
    created++;
  }
  return created;
}

/**
 * Job diario: recorre usuarios con cuentas y genera los recordatorios pendientes.
 * Best-effort por usuario (un error no frena al resto). No-op si el flag está off.
 */
export async function runRecurringRemindersForAllUsers(): Promise<void> {
  if (!recurringRemindersEnabled()) {
    logger.debug("recurring reminders: deshabilitado (RECURRING_REMINDERS_ENABLED != true)");
    return;
  }
  const t0 = Date.now();
  const rows = (await db
    .selectDistinct({ userId: accounts.userId })
    .from(accounts)) as Array<{ userId: string | null }>;
  const userIds = rows.map((r) => r.userId).filter((id): id is string => !!id);

  let totalCreated = 0;
  let usersWithReminders = 0;
  for (const userId of userIds) {
    try {
      const n = await runRecurringRemindersForUser(userId);
      if (n > 0) {
        totalCreated += n;
        usersWithReminders++;
      }
    } catch (err) {
      logger.warn({ err, userId }, "recurring reminders: falló para un usuario (no fatal)");
    }
  }

  logger.info(
    { users: userIds.length, usersWithReminders, totalCreated, ms: Date.now() - t0 },
    "recurring reminders: corrida diaria completa",
  );
}
