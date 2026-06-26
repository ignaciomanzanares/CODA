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
    .map(({ key, category, title, description, priority }) => ({ key, category, title, description, priority }));
}
