import type { HealthEvaluationResult } from '../healthEvaluation/types.js';
import { HABIT_CATALOG, type HabitCategory } from './habitCatalog.js';

export interface HabitRecommendation {
  key: string;
  category: HabitCategory;
  title: string;
  description: string;
  priority: number;
}

/**
 * Genera hábitos recomendados para el resultado de salud financiera dado, excluyendo
 * los que el usuario marcó como "no útil" recientemente (feedback loop, ver
 * `storage.getRecentlyDownvotedHabitKeys`). Sin exclusiones, es una función pura de
 * `HealthEvaluationResult` — no toca la BD.
 */
export function generateHabitRecommendations(
  result: HealthEvaluationResult,
  excludedKeys: ReadonlySet<string> = new Set(),
  limit = 5,
): HabitRecommendation[] {
  return HABIT_CATALOG
    .filter((h) => !excludedKeys.has(h.key) && h.matches(result))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit)
    .map((h) => ({
      key: h.key,
      category: h.category,
      title: h.title,
      // #34: descripción personalizada con los números reales del usuario; fallback al texto fijo.
      description: h.describe ? h.describe(result) : h.description,
      priority: h.priority,
    }));
}
