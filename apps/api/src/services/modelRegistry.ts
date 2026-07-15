import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { mlLogger as logger } from "../logger.js";
import { XgbTreeModel } from "./treeExplain.js";

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type ModelManifest = {
  model_id: string;
  trained_at?: string;
  algo?: string; // "xgb" | "xgb_ensemble" | ...
  metrics?: { auc?: number; gini?: number; ks?: number; brier?: number };
  feature_meta_path?: string;
  calibration?: { type: "platt" | "isotonic"; params: any } | null;
  onnx_path?: string | null;
  xgb_json_path?: string;
  dataset_hash?: string;
  shap_top?: string[];
  shap_summary_path?: string | null;
};

/**
 * Sirve el modelo PD (XGBoost) evaluando el dump nativo `xgb.json` directamente en
 * TypeScript (`XgbTreeModel.predictProba` = `sigmoid(margin)`), sin onnxruntime.
 *
 * Por qué no ONNX: (1) la salida ONNX exporta dos tensores (`label` int64 + `probabilities`)
 * y el código previo leía `outputs[Object.keys(outputs)[0]]` = `label` (la clase 0/1), no la
 * probabilidad — un bug real que devolvía un PD binarizado; (2) el export a ONNX está
 * bloqueado por incompatibilidad de versiones onnxmltools/onnx/xgboost (ver ml/README.md),
 * lo que impedía promover modelos nuevos. Evaluar el árbol en TS resuelve ambos: el margin
 * reconstruido coincide con `probabilities[1]` de ONNX a ~1e-7 (test de paridad) y el modelo
 * ya no depende de un artefacto ONNX que no podíamos generar.
 */
export class PDModelRegistry {
  private static _instance: PDModelRegistry;
  private baseDir: string;
  private manifest: ModelManifest | null = null;
  private featureMeta: { features: string[] } | null = null;
  private treeModel: XgbTreeModel | null = null;

  private constructor() {
    // ML artifacts are located in apps/api/src/ml/artifacts/current
    // Support both running from repo root and from apps/api directory
    const possiblePaths = [
      path.join(process.cwd(), "apps", "api", "src", "ml", "artifacts", "current"),
      path.join(process.cwd(), "src", "ml", "artifacts", "current"),
      path.join(__dirname, "..", "ml", "artifacts", "current"),
    ];

    this.baseDir = possiblePaths.find((p) => fs.existsSync(p)) || possiblePaths[0];
    this.tryLoad();
  }

  static instance() {
    if (!this._instance) this._instance = new PDModelRegistry();
    return this._instance;
  }

  get isReady() {
    if (!this.treeModel || !this.featureMeta) {
      // El árbol se carga de forma síncrona; reintentar es barato si aún no estaba.
      this.tryLoad();
    }
    return Boolean(this.treeModel && this.featureMeta);
  }

  getManifest(): ModelManifest | null {
    return this.manifest;
  }

  /**
   * Probabilidad de default calibrada. Valida que **todas** las features esperadas estén
   * presentes y sean finitas — no rellena ausentes con 0 en silencio (#23): un feature vector
   * incompleto es un bug aguas arriba que debe explotar ruidosamente, no degradar el score.
   */
  async scoreXGB(featureMap: Record<string, number>): Promise<number> {
    if (!this.isReady || !this.treeModel || !this.featureMeta) {
      throw new Error("XGB model not available");
    }
    const expected = this.featureMeta.features;
    const feats = expected.map((k) => {
      const v = featureMap[k];
      if (v == null || typeof v !== "number" || !Number.isFinite(v)) {
        throw new Error(
          `scoreXGB: feature '${k}' ausente o no finita (${String(v)}); no se rellena con 0 silenciosamente`,
        );
      }
      return v;
    });
    const p = this.treeModel.predictProba(feats);
    return this.applyCalibration(p);
  }

  /**
   * Razones de la decisión para *esta* instancia (no el ranking global de `getTopFeatures`):
   * usa el mismo `xgb.json` (dump nativo del booster). Si no está disponible (modelos más
   * viejos sin ese campo), cae a `getTopFeatures` — mismo ranking para todo usuario.
   */
  explainInstance(
    featureMap: Record<string, number>,
    limit = 5,
  ): Array<{
    feature: string;
    contribution: number;
    direction: "increases_risk" | "decreases_risk";
  }> {
    if (this.treeModel && this.featureMeta) {
      const feats = this.featureMeta.features.map((k) => Number(featureMap[k] ?? 0));
      return this.treeModel.topReasons(feats, this.featureMeta.features, limit);
    }
    return this.getTopFeatures(limit).map((feature) => ({
      feature,
      contribution: 0,
      direction: "increases_risk" as const,
    }));
  }

  getTopFeatures(limit = 5): string[] {
    // 1) Prefer explicit top features in manifest
    const mf = this.manifest as
      (ModelManifest & { shap_top?: string[]; shap_summary_path?: string | null }) | null;
    const top = mf?.shap_top;
    if (Array.isArray(top) && top.length) {
      return top.slice(0, limit);
    }

    // 2) If we have a SHAP summary, derive from it
    const summaryPath = mf?.shap_summary_path;
    if (summaryPath && typeof summaryPath === "string") {
      try {
        const abs = path.join(this.baseDir, summaryPath);
        if (fs.existsSync(abs)) {
          const parsed: Array<{ feature: string; mean_abs_shap?: number }> = JSON.parse(
            fs.readFileSync(abs, "utf-8"),
          );
          if (Array.isArray(parsed) && parsed.length) {
            parsed.sort((a, b) => (b.mean_abs_shap || 0) - (a.mean_abs_shap || 0));
            return parsed.slice(0, limit).map((p) => p.feature);
          }
        }
      } catch {
        // ignore errors and fall through
      }
    }

    // 3) Fall back to feature order if available
    if (this.featureMeta?.features?.length) {
      return this.featureMeta.features.slice(0, limit);
    }

    return [];
  }

  private applyCalibration(p: number): number {
    const cal = this.manifest?.calibration;
    if (!cal) return p;
    if (cal.type === "platt") {
      const { a, b } = (cal as any).params || {};
      if (typeof a === "number" && typeof b === "number") {
        const z = a * p + b;
        return 1 / (1 + Math.exp(-z));
      }
      return p;
    }
    if (cal.type === "isotonic" && Array.isArray((cal as any).params)) {
      const pts: { x: number; y: number }[] = (cal as any).params;
      if (pts.length === 0) return p;
      if (p <= pts[0].x) return pts[0].y;
      for (let i = 1; i < pts.length; i++) {
        if (p <= pts[i].x) {
          const x0 = pts[i - 1].x,
            y0 = pts[i - 1].y;
          const x1 = pts[i].x,
            y1 = pts[i].y;
          const t = (p - x0) / (x1 - x0 || 1e-6);
          return y0 + t * (y1 - y0);
        }
      }
      return pts[pts.length - 1].y;
    }
    return p;
  }

  private tryLoad() {
    try {
      const manifestPath = path.join(this.baseDir, "manifest.json");
      if (!fs.existsSync(manifestPath)) return;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      this.manifest = manifest;

      const featureMetaPath = path.join(
        this.baseDir,
        manifest.feature_meta_path || "feature_meta.json",
      );
      if (!fs.existsSync(featureMetaPath)) return;
      this.featureMeta = JSON.parse(fs.readFileSync(featureMetaPath, "utf-8"));

      const xgbJsonRel = (manifest as { xgb_json_path?: string }).xgb_json_path || "xgb.json";
      const xgbJsonPath = path.join(this.baseDir, xgbJsonRel);
      if (fs.existsSync(xgbJsonPath)) {
        try {
          this.treeModel = XgbTreeModel.loadFromFile(xgbJsonPath);
        } catch (e) {
          logger.error({ err: e }, "Failed to load xgb.json; PD model unavailable");
          this.treeModel = null;
        }
      }
    } catch (e) {
      logger.error({ err: e }, "PDModelRegistry load failed");
      this.manifest = null;
      this.featureMeta = null;
      this.treeModel = null;
    }
  }

  // Public method to force reload of model artifacts
  async reload() {
    this.treeModel = null;
    this.featureMeta = null;
    this.tryLoad();
  }

  /**
   * Promoción sin redeploy (#5): si en `algorithm_model_versions` hay una fila
   * `lifecycle='production'` con `artifactUri` (prefijo de key en el blob store), descarga sus
   * artefactos (`xgb.json`/`feature_meta.json`/`manifest.json`) a un dir cache local y carga ese
   * modelo. Cambiar la fila de producción en la DB basta para servir un modelo nuevo — no hace
   * falta redeploy.
   *
   * Es **no-op seguro**: si no hay fila production, no hay `artifactUri`, el blob no responde o
   * algo falla, se mantiene el modelo local de `artifacts/current` (fallback versionado en git).
   * Devuelve true solo si cargó un modelo remoto.
   */
  async loadProductionFromRegistry(modelType = "xgb_pd"): Promise<boolean> {
    try {
      const { db, dialect, algorithmModelVersions, eq, and } = await import("../db/index.js");
      // El blob store solo existe en Postgres (producción). En SQLite (dev/test) no hay
      // artefactos remotos — usar siempre artifacts/current local.
      if (dialect !== "postgres") return false;
      const rows = await db
        .select()
        .from(algorithmModelVersions)
        .where(
          and(
            eq(algorithmModelVersions.lifecycle, "production"),
            eq(algorithmModelVersions.modelType, modelType),
          ),
        )
        .limit(1);
      const row = rows?.[0] as { artifactUri?: string | null } | undefined;
      if (!row?.artifactUri) return false;

      const { getBlobStore } = await import("./storage/blobStore.js");
      const store = getBlobStore();

      const cacheDir = path.join(this.baseDir, "..", "_remote_production");
      fs.mkdirSync(cacheDir, { recursive: true });
      for (const name of ["xgb.json", "feature_meta.json", "manifest.json"]) {
        const buf = await store.getObject(`${row.artifactUri}/${name}`);
        if (!buf) {
          logger.warn(
            { artifactUri: row.artifactUri, name },
            "loadProductionFromRegistry: artefacto faltante en blob store; uso artifacts/current local",
          );
          return false;
        }
        fs.writeFileSync(path.join(cacheDir, name), buf);
      }

      this.baseDir = cacheDir;
      this.treeModel = null;
      this.featureMeta = null;
      this.tryLoad();
      const ok = Boolean(this.treeModel && this.featureMeta);
      logger.info(
        { artifactUri: row.artifactUri, ok, auc: this.manifest?.metrics?.auc },
        "loadProductionFromRegistry: modelo de producción cargado desde blob store",
      );
      return ok;
    } catch (e) {
      logger.warn({ err: e }, "loadProductionFromRegistry falló; usando artifacts/current local");
      return false;
    }
  }
}
