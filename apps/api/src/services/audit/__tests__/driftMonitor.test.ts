import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, sql, algorithmPredictionLogs, algorithmModelVersions } from "../../../db/index.js";
import { storage } from "../../../storage.js";
import { encryptField } from "../../crypto/fieldEncryption.js";
import { runDriftMonitoringJob, DRIFT_MIN_SAMPLES } from "../driftMonitor.js";

/**
 * #24: el job de drift lee `algorithm_prediction_logs` reales (no el placeholder/TODO previo)
 * y calcula PSI entre el lote reciente y el anterior. Usamos un `kind` único para aislar de
 * otras filas del dev DB.
 */
describe("runDriftMonitoringJob (DB-backed, #24)", () => {
  const unique = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const KIND = `drift_test_${unique}`;
  const modelId = `drift-model-${unique}`;
  let userId = "";

  async function insertLog(pd: number, createdAt: string, i: number) {
    await db.insert(algorithmPredictionLogs).values({
      id: `${KIND}-${i}`,
      userId,
      requestId: `${KIND}-req-${i}`,
      kind: KIND,
      modelVersionId: modelId,
      modelVersion: "v1",
      modelType: "test",
      inputFeatures: encryptField(JSON.stringify({})),
      outputSnapshot: encryptField(JSON.stringify({ probabilityDefault: pd })),
      createdAt,
    });
  }

  beforeAll(async () => {
    const user = await storage.createUser({
      email: `drift-${unique}@example.com`,
      username: `drift_${unique}`,
      passwordHash: "x:x",
    } as any);
    userId = user.id;

    await db.insert(algorithmModelVersions).values({
      id: modelId,
      modelType: "test",
      version: "v1",
      deployedAt: new Date().toISOString(),
      deployedBy: "test",
    });

    const N = DRIFT_MIN_SAMPLES + 10;
    // Lote ANTERIOR (createdAt más viejo): PD concentrado en ~0.05.
    for (let i = 0; i < N; i++) {
      await insertLog(
        0.04 + (i % 3) * 0.01,
        `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`,
        i,
      );
    }
    // Lote RECIENTE (createdAt más nuevo): PD desplazado a ~0.6 (drift fuerte).
    for (let i = 0; i < N; i++) {
      await insertLog(
        0.58 + (i % 3) * 0.01,
        `2026-02-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`,
        N + i,
      );
    }
  });

  afterAll(async () => {
    await db.run(sql`DELETE FROM algorithm_prediction_logs WHERE kind = ${KIND}`);
    await db.run(sql`DELETE FROM algorithm_model_versions WHERE id = ${modelId}`);
    await db.run(sql`DELETE FROM users WHERE id = ${userId}`);
  });

  it("calcula PSI desde la DB y dispara alerta ante un shift de distribución fuerte", async () => {
    const result = await runDriftMonitoringJob({ kind: KIND, sampleSize: DRIFT_MIN_SAMPLES + 10 });
    expect(result.status).toBe("ok");
    expect(result.recentN).toBeGreaterThanOrEqual(DRIFT_MIN_SAMPLES);
    expect(result.referenceN).toBeGreaterThanOrEqual(DRIFT_MIN_SAMPLES);
    expect(typeof result.psi).toBe("number");
    // Distribuciones disjuntas (0.05 vs 0.6) → PSI muy por encima del umbral 0.2.
    expect(result.psi!).toBeGreaterThan(0.2);
    expect(result.alert).toBe(true);
  });

  it("reporta insufficient_data cuando no hay suficientes muestras", async () => {
    const result = await runDriftMonitoringJob({ kind: `nonexistent_${unique}`, sampleSize: 100 });
    expect(result.status).toBe("insufficient_data");
    expect(result.recentN).toBe(0);
  });
});
