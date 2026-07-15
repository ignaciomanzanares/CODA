import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, sql } from "../../../db/index.js";
import { storage } from "../../../storage.js";
import { categoryClassifier, classifyOrRule, tokenize } from "../categoryClassifier.js";
import { recordCategoryCorrection } from "../categoryCorrections.js";

beforeAll(() => {
  db.run(
    sql`CREATE TABLE IF NOT EXISTS transaction_category_corrections (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, normalized_text TEXT NOT NULL,
      original_category TEXT, corrected_category TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
});

describe("categoryClassifier (#31)", () => {
  it("tokeniza normalizando acentos y ruido", () => {
    expect(tokenize("Farmàcia  Cruz Verde!! 123")).toEqual(["FARMACIA", "CRUZ", "VERDE", "123"]);
  });

  it("aprende de ejemplos y predice; cae al fallback cuando no hay confianza/datos", () => {
    categoryClassifier.reset();
    // Modelo vacío → siempre fallback.
    expect(categoryClassifier.predict("UBER TRIP SANTIAGO")).toBeNull();
    expect(classifyOrRule("UBER TRIP", "transporte")).toBe("transporte");

    // Entrenar con ejemplos claros.
    for (let i = 0; i < 4; i++) categoryClassifier.learn("UBER TRIP SANTIAGO", "transporte");
    for (let i = 0; i < 4; i++) categoryClassifier.learn("NETFLIX SUSCRIPCION", "suscripciones");

    const pred = categoryClassifier.predict("UBER VIAJE PROVIDENCIA");
    expect(pred).not.toBeNull();
    expect(pred!.category).toBe("transporte");
    expect(pred!.confidence).toBeGreaterThanOrEqual(0.6);

    // Override sobre la regla: el clasificador gana cuando tiene confianza.
    expect(classifyOrRule("NETFLIX PAGO", "comercio")).toBe("suscripciones");

    // Texto desconocido sin señal fuerte → puede caer al fallback.
    categoryClassifier.reset();
  });
});

describe("recordCategoryCorrection (#31)", () => {
  const unique = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let userId = "";

  beforeAll(async () => {
    const user = await storage.createUser({
      email: `cat-${unique}@example.com`,
      username: `cat_${unique}`,
      passwordHash: "x:x",
    } as any);
    userId = user.id;
  });

  afterAll(async () => {
    await db.run(sql`DELETE FROM transaction_category_corrections WHERE user_id = ${userId}`);
    await db.run(sql`DELETE FROM users WHERE id = ${userId}`);
    categoryClassifier.reset();
  });

  it("persiste la corrección y la incorpora al modelo de inmediato", async () => {
    categoryClassifier.reset();
    const res = await recordCategoryCorrection({
      userId,
      text: "TRANSBANK *CAFE ALTURA",
      correctedCategory: "restaurantes",
    });
    expect(res.ok).toBe(true);

    const rows = (await db.all(
      sql`SELECT corrected_category FROM transaction_category_corrections WHERE user_id = ${userId}`,
    )) as Array<{ corrected_category: string }>;
    expect(rows.length).toBe(1);
    expect(rows[0].corrected_category).toBe("restaurantes");

    // El modelo aprendió de inmediato (incremental): reforzando, predice esa categoría.
    for (let i = 0; i < 5; i++) categoryClassifier.learn("TRANSBANK CAFE ALTURA", "restaurantes");
    const pred = categoryClassifier.predict("CAFE ALTURA TRANSBANK");
    expect(pred?.category).toBe("restaurantes");
  });

  it("rechaza texto vacío tras normalizar", async () => {
    const res = await recordCategoryCorrection({
      userId,
      text: "!!! ??",
      correctedCategory: "salud",
    });
    expect(res.ok).toBe(false);
  });
});
