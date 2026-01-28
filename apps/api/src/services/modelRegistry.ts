import * as fs from "node:fs";
import * as path from "node:path";

// Lazy optional import to avoid crashing when dependency is missing
let ort: any = null;
// Do not attempt sync require in ESM; will dynamically import in tryLoad()

export type ModelManifest = {
  model_id: string;
  trained_at?: string;
  algo?: string; // "xgb" | "xgb_ensemble" | ...
  metrics?: { auc?: number; gini?: number; ks?: number; brier?: number };
  feature_meta_path?: string;
  calibration?: { type: "platt" | "isotonic"; params: any } | null;
  onnx_path?: string;
  shap_top?: string[];
  shap_summary_path?: string | null;
};

export class PDModelRegistry {
  private static _instance: PDModelRegistry;
  private baseDir: string;
  private manifest: ModelManifest | null = null;
  private session: any = null; // onnxruntime.InferenceSession
  private featureMeta: { features: string[] } | null = null;

  private constructor() {
    // ML artifacts are located in apps/api/src/ml/artifacts/current
    // Support both running from repo root and from apps/api directory
    const possiblePaths = [
      path.join(process.cwd(), "apps", "api", "src", "ml", "artifacts", "current"),
      path.join(process.cwd(), "src", "ml", "artifacts", "current"),
      path.join(__dirname, "..", "ml", "artifacts", "current"),
    ];
    
    this.baseDir = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[0];
    this.tryLoad();
  }

  static instance() {
    if (!this._instance) this._instance = new PDModelRegistry();
    return this._instance;
  }

  get isReady() {
    // Opportunistically attempt to (re)load if session is not ready
    if (!this.session) {
      // fire-and-forget
      void this.tryLoad();
    }
    return Boolean(this.session && this.featureMeta);
  }

  getManifest(): ModelManifest | null {
    return this.manifest;
  }

  async scoreXGB(featureMap: Record<string, number>): Promise<number> {
    if (!this.isReady || !ort) throw new Error("XGB model not available");
    const feats = this.featureMeta!.features.map((k) => Number(featureMap[k] ?? 0));
    const input = new Float32Array(feats);
    const tensor = new ort.Tensor("float32", input, [1, feats.length]);
    const outputs = await this.session.run({ input: tensor });
    const out = outputs[Object.keys(outputs)[0]];
    const raw = Array.isArray(out.data) ? out.data[0] : out.data[0];
    const p = Number(raw);
    return this.applyCalibration(p);
  }

  getTopFeatures(limit = 5): string[] {
    // 1) Prefer explicit top features in manifest
    const mf = this.manifest as (ModelManifest & { shap_top?: string[]; shap_summary_path?: string | null }) | null;
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
          const parsed: Array<{ feature: string; mean_abs_shap?: number }> = JSON.parse(fs.readFileSync(abs, "utf-8"));
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
          const x0 = pts[i - 1].x, y0 = pts[i - 1].y;
          const x1 = pts[i].x, y1 = pts[i].y;
          const t = (p - x0) / (x1 - x0 || 1e-6);
          return y0 + t * (y1 - y0);
        }
      }
      return pts[pts.length - 1].y;
    }
    return p;
  }

  private async tryLoad() {
    try {
      const manifestPath = path.join(this.baseDir, "manifest.json");
      if (!fs.existsSync(manifestPath)) return;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      this.manifest = manifest;

      // Dynamically import onnxruntime-node in ESM-safe way
      if (!ort) {
        try {
          const mod = await import("onnxruntime-node");
          // CJS exports land on default in ESM import
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ort = (mod as any)?.default ?? mod;
        } catch {
          return; // dependency not installed or unsupported platform
        }
      }

      const onnxPath = path.join(this.baseDir, manifest.onnx_path || "xgb_pd.onnx");
      const featureMetaPath = path.join(this.baseDir, manifest.feature_meta_path || "feature_meta.json");
      if (!fs.existsSync(onnxPath) || !fs.existsSync(featureMetaPath)) return;
      this.featureMeta = JSON.parse(fs.readFileSync(featureMetaPath, "utf-8"));

      // Create session (async)
      ort.InferenceSession.create(onnxPath, { executionProviders: ["cpu"] })
        .then((sess: any) => {
          this.session = sess;
        })
        .catch(() => {
          // ignore
        });
    } catch (e) {
       
      console.error("PDModelRegistry load failed", e);
      this.manifest = null;
      this.session = null;
      this.featureMeta = null;
    }
  }

  // Public method to force reload of model artifacts
  async reload() {
    this.session = null;
    await this.tryLoad();
  }
}
