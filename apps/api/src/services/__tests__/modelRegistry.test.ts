import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { PDModelRegistry } from "../modelRegistry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const currentDir = path.join(__dirname, "..", "..", "ml", "artifacts", "current");
const featureMetaPath = path.join(currentDir, "feature_meta.json");

const haveModel = fs.existsSync(path.join(currentDir, "xgb.json")) && fs.existsSync(featureMetaPath);

describe.skipIf(!haveModel)("PDModelRegistry.scoreXGB (serving desde xgb.json, sin ONNX)", () => {
  const features: string[] = haveModel
    ? JSON.parse(fs.readFileSync(featureMetaPath, "utf-8")).features
    : [];
  const fullVector = (): Record<string, number> =>
    Object.fromEntries(features.map((f) => [f, 1]));

  it("está listo sin depender de onnxruntime", () => {
    const reg = PDModelRegistry.instance();
    expect(reg.isReady).toBe(true);
  });

  it("devuelve una probabilidad calibrada en [0,1]", async () => {
    const reg = PDModelRegistry.instance();
    const pd = await reg.scoreXGB(fullVector());
    expect(typeof pd).toBe("number");
    expect(pd).toBeGreaterThanOrEqual(0);
    expect(pd).toBeLessThanOrEqual(1);
  });

  it("explota (no rellena con 0) si falta una feature esperada (#23)", async () => {
    const reg = PDModelRegistry.instance();
    const incomplete = fullVector();
    delete incomplete[features[0]];
    await expect(reg.scoreXGB(incomplete)).rejects.toThrow(/ausente o no finita/);
  });

  it("explota si una feature es NaN/Infinity (#23)", async () => {
    const reg = PDModelRegistry.instance();
    const bad = fullVector();
    bad[features[1]] = Number.NaN;
    await expect(reg.scoreXGB(bad)).rejects.toThrow(/ausente o no finita/);
  });

  it("el manifest servido reporta AUC ≥ 0.60 (modelo chileno, no el 0.4172 previo)", () => {
    const reg = PDModelRegistry.instance();
    const auc = reg.getManifest()?.metrics?.auc ?? 0;
    expect(auc).toBeGreaterThanOrEqual(0.6);
  });
});
