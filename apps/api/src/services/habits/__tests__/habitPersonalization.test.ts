import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, sql } from "../../../db/index.js";
import { storage } from "../../../storage.js";
import { generateHabitRecommendations } from "../habitEngine.js";
import { logHabitRecommendations, getHabitProgress } from "../habitRecommendationsLog.js";
import type { HealthEvaluationResult } from "../../healthEvaluation/types.js";

function makeHealth(
  over: Partial<HealthEvaluationResult["ratios"]> & { nivel?: number },
): HealthEvaluationResult {
  return {
    nivel: (over.nivel ?? 0) as HealthEvaluationResult["nivel"],
    nivelNombre: "test",
    zona: "critica",
    salida: "refinanciamiento",
    scoreRatios: 0,
    scoreInterno: 0,
    scoreCompuesto: 0,
    nivelBruto: 0,
    ratios: {
      deudaFlujo: over.deudaFlujo ?? 0,
      deudaActivos: over.deudaActivos ?? 0,
      ahorroIngreso: over.ahorroIngreso ?? 0,
      moraActiva: over.moraActiva ?? false,
      diasMora: over.diasMora ?? 0,
    },
    productos: [],
    insights: [],
  };
}

beforeAll(() => {
  db.run(
    sql`CREATE TABLE IF NOT EXISTS habit_recommendations_log (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, habit_key TEXT NOT NULL, nivel INTEGER,
      deuda_flujo REAL, deuda_activos REAL, ahorro_ingreso REAL, dias_mora INTEGER,
      mora_activa INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
});

describe("habit personalization (#34)", () => {
  it("interpola los números reales del usuario en la descripción", () => {
    const health = makeHealth({ deudaFlujo: 0.83, nivel: -1 });
    const habits = generateHabitRecommendations(health);
    const deudaHabit = habits.find((h) => h.key === "reducir_deuda_alta");
    expect(deudaHabit).toBeTruthy();
    // El 83% real del usuario aparece, no solo el umbral genérico.
    expect(deudaHabit!.description).toContain("83%");
  });

  it("describe el caso de ahorro negativo de forma específica", () => {
    const health = makeHealth({ ahorroIngreso: -0.15 });
    const habits = generateHabitRecommendations(health);
    const ahorro = habits.find((h) => h.key === "aumentar_ahorro");
    expect(ahorro!.description).toContain("gastando más de lo que ingresas");
  });
});

describe("habit effectiveness (#34)", () => {
  const unique = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let userId = "";

  beforeAll(async () => {
    const user = await storage.createUser({
      email: `habit-${unique}@example.com`,
      username: `habit_${unique}`,
      passwordHash: "x:x",
    } as any);
    userId = user.id;
  });

  afterAll(async () => {
    await db.run(sql`DELETE FROM habit_recommendations_log WHERE user_id = ${userId}`);
    await db.run(sql`DELETE FROM users WHERE id = ${userId}`);
  });

  it("registra snapshot y mide mejora contra el ciclo siguiente", async () => {
    // Ciclo 1: deuda alta (83% del flujo) → se recomienda reducir_deuda_alta.
    const cycle1 = makeHealth({ deudaFlujo: 0.83 });
    const habits = generateHabitRecommendations(cycle1);
    await logHabitRecommendations(userId, habits, cycle1);

    // Ciclo 2: la deuda bajó a 40% del flujo.
    const cycle2 = makeHealth({ deudaFlujo: 0.4 });
    const progress = await getHabitProgress(userId, cycle2);

    const deudaProgress = progress.find((p) => p.habitKey === "reducir_deuda_alta");
    expect(deudaProgress).toBeTruthy();
    expect(deudaProgress!.before).toBeCloseTo(0.83, 5);
    expect(deudaProgress!.after).toBeCloseTo(0.4, 5);
    expect(deudaProgress!.improved).toBe(true); // deudaFlujo bajó → mejora
  });
});
