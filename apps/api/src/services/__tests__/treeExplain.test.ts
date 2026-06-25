import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { XgbTreeModel } from "../treeExplain.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("XgbTreeModel.explain", () => {
  const xgbJsonPath = path.join(__dirname, "..", "..", "ml", "artifacts", "current", "xgb.json");
  const fixturePath = path.join(__dirname, "fixtures", "xgb_ground_truth.json");

  it("reconstructs the same margin XGBoost itself produces (output_margin=True)", () => {
    if (!fs.existsSync(xgbJsonPath)) {
      // El artefacto de producción no está versionado en todos los checkouts del repo.
      return;
    }
    const fixture: { features: string[]; vectors: number[][]; margins: number[] } = JSON.parse(
      fs.readFileSync(fixturePath, "utf-8")
    );
    const model = XgbTreeModel.loadFromFile(xgbJsonPath);

    for (let i = 0; i < fixture.vectors.length; i++) {
      const explanation = model.explain(fixture.vectors[i], fixture.features);
      // Generado con xgboost==3.0.5 (booster.predict(dm, output_margin=True)) sobre el mismo
      // xgb.json — ver scratchpad de la sesión. Tolerancia float32.
      expect(explanation.marginTotal).toBeCloseTo(fixture.margins[i], 4);
    }
  });

  it("attributes contributions per-instance (varies with the input, unlike a global ranking)", () => {
    if (!fs.existsSync(xgbJsonPath)) return;
    const fixture: { features: string[]; vectors: number[][] } = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    const model = XgbTreeModel.loadFromFile(xgbJsonPath);

    const a = model.topReasons(fixture.vectors[0], fixture.features, 5);
    const b = model.topReasons(fixture.vectors[1], fixture.features, 5);
    expect(a).not.toEqual(b);
    for (const r of [...a, ...b]) {
      expect(["increases_risk", "decreases_risk"]).toContain(r.direction);
    }
  });
});
