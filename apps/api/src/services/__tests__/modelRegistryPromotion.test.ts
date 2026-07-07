import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { db, sql, algorithmModelVersions } from "../../db/index.js";
import { getBlobStore } from "../storage/blobStore.js";
import { PDModelRegistry } from "../modelRegistry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const currentDir = path.join(__dirname, "..", "..", "ml", "artifacts", "current");
const haveModel = fs.existsSync(path.join(currentDir, "xgb.json"));

/**
 * #5: promoción sin redeploy. Subimos artefactos al blob store (backend Postgres sobre
 * stored_blobs), registramos una fila lifecycle='production' y verificamos que
 * `loadProductionFromRegistry()` los descarga y sirve — sin tocar artifacts/current.
 */
describe.skipIf(!haveModel)("PDModelRegistry.loadProductionFromRegistry (#5)", () => {
  const unique = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const modelId = `promo-test-${unique}`;
  const keyPrefix = `models/xgb_pd/${modelId}`;
  const files = ["xgb.json", "feature_meta.json", "manifest.json"];
  const remoteDir = path.join(currentDir, "..", "_remote_production");

  beforeAll(async () => {
    const store = getBlobStore();
    for (const f of files) {
      const bytes = fs.readFileSync(path.join(currentDir, f));
      await store.putObject(`${keyPrefix}/${f}`, bytes, { contentType: "application/json" });
    }
    await db.insert(algorithmModelVersions).values({
      id: modelId,
      modelType: "xgb_pd",
      version: modelId,
      deployedAt: new Date().toISOString(),
      deployedBy: "test",
      isActive: 1,
      lifecycle: "production",
      artifactUri: keyPrefix,
      auc: 0.61,
    });
  });

  afterAll(async () => {
    const store = getBlobStore();
    for (const f of files) await store.deleteObject(`${keyPrefix}/${f}`);
    await db.run(sql`DELETE FROM algorithm_model_versions WHERE id = ${modelId}`);
    fs.rmSync(remoteDir, { recursive: true, force: true });
  });

  it("descarga el modelo de producción del blob store y queda servible", async () => {
    const reg = PDModelRegistry.instance();
    const ok = await reg.loadProductionFromRegistry("xgb_pd");
    expect(ok).toBe(true);
    expect(reg.isReady).toBe(true);

    // Sirve un score real desde el artefacto descargado.
    const features: string[] = JSON.parse(fs.readFileSync(path.join(remoteDir, "feature_meta.json"), "utf-8")).features;
    const fv = Object.fromEntries(features.map((f) => [f, 1]));
    const pd = await reg.scoreXGB(fv);
    expect(pd).toBeGreaterThanOrEqual(0);
    expect(pd).toBeLessThanOrEqual(1);
  });

  it("es no-op seguro si no hay fila production para el modelType", async () => {
    const reg = PDModelRegistry.instance();
    const ok = await reg.loadProductionFromRegistry("modelo_inexistente");
    expect(ok).toBe(false);
  });
});
