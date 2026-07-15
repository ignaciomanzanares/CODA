/**
 * Snapshot de recomendaciones de hábitos + medición de efectividad (#34).
 *
 * Al recomendar, se guarda el estado financiero del usuario (`logHabitRecommendations`). En un
 * ciclo posterior, `getHabitProgress` compara el snapshot contra el estado actual para el
 * MÉTRICO que cada hábito busca mover (deuda, ahorro, mora), y reporta si mejoró.
 */
import { randomUUID } from "node:crypto";
import { db, habitRecommendationsLog, eq, desc } from "../../db/index.js";
import type { HealthEvaluationResult } from "../healthEvaluation/types.js";
import type { HabitRecommendation } from "./habitEngine.js";
import { mlLogger as logger } from "../../logger.js";

/** Métrica objetivo de cada hábito y la dirección que cuenta como mejora. */
type Metric = "deudaFlujo" | "deudaActivos" | "ahorroIngreso" | "diasMora" | "nivel";
const HABIT_TARGET: Record<string, { metric: Metric; betterWhen: "lower" | "higher" }> = {
  atender_mora: { metric: "diasMora", betterWhen: "lower" },
  reducir_deuda_activos: { metric: "deudaActivos", betterWhen: "lower" },
  reducir_deuda_alta: { metric: "deudaFlujo", betterWhen: "lower" },
  reducir_deuda_moderada: { metric: "deudaFlujo", betterWhen: "lower" },
  aumentar_ahorro: { metric: "ahorroIngreso", betterWhen: "higher" },
  mantener_ahorro: { metric: "ahorroIngreso", betterWhen: "higher" },
  fondo_emergencia: { metric: "nivel", betterWhen: "higher" },
  diversificar_inversion: { metric: "nivel", betterWhen: "higher" },
  mantener_buen_habito: { metric: "nivel", betterWhen: "higher" },
  reducir_deuda: { metric: "deudaFlujo", betterWhen: "lower" },
};

function metricValue(metric: Metric, result: HealthEvaluationResult): number {
  if (metric === "nivel") return result.nivel;
  return result.ratios[metric] as number;
}

/** Guarda un snapshot por cada hábito recomendado (best-effort). */
export async function logHabitRecommendations(
  userId: string,
  habits: HabitRecommendation[],
  result: HealthEvaluationResult,
): Promise<void> {
  if (habits.length === 0) return;
  try {
    await db.insert(habitRecommendationsLog).values(
      habits.map((h) => ({
        id: randomUUID(),
        userId,
        habitKey: h.key,
        nivel: result.nivel,
        deudaFlujo: result.ratios.deudaFlujo,
        deudaActivos: result.ratios.deudaActivos,
        ahorroIngreso: result.ratios.ahorroIngreso,
        diasMora: result.ratios.diasMora,
        moraActiva: result.ratios.moraActiva ? 1 : 0,
      })),
    );
  } catch (e) {
    logger.warn(
      { err: e, userId },
      "[habitRecommendationsLog] no se pudo registrar snapshot (no fatal)",
    );
  }
}

export interface HabitProgress {
  habitKey: string;
  metric: Metric;
  before: number;
  after: number;
  improved: boolean;
  recommendedAt: string;
}

/**
 * Compara, para cada hábito recomendado la última vez, el snapshot guardado contra el estado
 * actual. Devuelve si la métrica objetivo mejoró — la base para "medir efectividad".
 */
export async function getHabitProgress(
  userId: string,
  current: HealthEvaluationResult,
): Promise<HabitProgress[]> {
  const rows = (await db
    .select()
    .from(habitRecommendationsLog)
    .where(eq(habitRecommendationsLog.userId, userId))
    .orderBy(desc(habitRecommendationsLog.createdAt))) as Array<{
    habitKey: string;
    nivel: number | null;
    deudaFlujo: number | null;
    deudaActivos: number | null;
    ahorroIngreso: number | null;
    diasMora: number | null;
    createdAt: string;
  }>;

  // Snapshot más reciente por hábito (el primero que aparece en orden desc).
  const latestByHabit = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latestByHabit.has(r.habitKey)) latestByHabit.set(r.habitKey, r);

  const progress: HabitProgress[] = [];
  for (const [habitKey, snap] of latestByHabit) {
    const target = HABIT_TARGET[habitKey];
    if (!target) continue;
    const before =
      target.metric === "nivel"
        ? (snap.nivel ?? 0)
        : (snap[target.metric as "deudaFlujo" | "deudaActivos" | "ahorroIngreso" | "diasMora"] ??
          0);
    const after = metricValue(target.metric, current);
    const improved = target.betterWhen === "lower" ? after < before : after > before;
    progress.push({
      habitKey,
      metric: target.metric,
      before,
      after,
      improved,
      recommendedAt: snap.createdAt,
    });
  }
  return progress;
}
