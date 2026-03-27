import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("jwt_token");
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export default function DemoPDCard() {
  const { isAuthenticated } = useAuth();
  const [pd, setPd] = useState<number | null>(null);
  const [model, setModel] = useState<"baseline" | "xgb">("baseline");
  const [reasons, setReasons] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFeatures, setShowFeatures] = useState(false);
  const [features, setFeatures] = useState<Record<string, unknown> | null>(null);
  const [modelInfo, setModelInfo] = useState<Record<string, unknown> | null>(null);

  async function fetchPD() {
    if (!isAuthenticated) {
      setError("Inicia sesión para ver el PD.");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = (await apiFetch(`/api/scoring/pd?model=${model}`, {
        headers: authHeaders(),
      })) as { pd?: number; reasons?: string[] };
      setPd(data.pd ?? null);
      setReasons(data.reasons || []);
    } catch (_e) {
      setError("No se pudo obtener el PD");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchPD();
    if (model === "xgb") {
      apiFetch("/api/pd/model/info")
        .then((data) => setModelInfo(data as Record<string, unknown>))
        .catch(() => setModelInfo(null));
    } else {
      setModelInfo(null);
    }
  }, [model, isAuthenticated]);

  const percent = pd != null ? (pd * 100).toFixed(1) : "-";

  async function fetchFeatures() {
    if (!isAuthenticated) return;
    try {
      setShowFeatures(true);
      const data = await apiFetch("/api/scoring/features", { headers: authHeaders() });
      setFeatures(data as Record<string, unknown>);
    } catch (_e) {
      // ignorar
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Riesgo de impago (PD)</h3>
          <div className="flex items-center gap-2">
            <select
              className="border rounded px-2 py-1 text-sm"
              value={model}
              onChange={(e) => setModel(e.target.value as "baseline" | "xgb")}
            >
              <option value="baseline">Baseline</option>
              <option value="xgb">XGBoost (si hay modelo)</option>
            </select>
            <Button variant="outline" size="sm" onClick={fetchFeatures}>
              Ver variables
            </Button>
            <Button variant="outline" size="sm" onClick={fetchPD} disabled={loading}>
              {loading ? "Actualizando…" : "Actualizar"}
            </Button>
          </div>
        </div>
        {error && <div className="text-red-500 text-sm mt-2">{error}</div>}
        <div className="mt-4">
          <div className="text-3xl font-bold">{percent}%</div>
          <div className="text-xs text-muted-foreground">
            Probabilidad de impago ({model === "baseline" ? "baseline" : "XGBoost"})
          </div>
          {modelInfo && (
            <div className="text-xs text-muted-foreground mt-1">
              AUC:{" "}
              {typeof (modelInfo as { metrics?: { auc?: number } }).metrics?.auc === "number"
                ? (modelInfo as { metrics: { auc: number } }).metrics.auc.toFixed(3)
                : (modelInfo as { metrics?: { auc?: unknown } }).metrics?.auc}
            </div>
          )}
        </div>
        {reasons.length > 0 && (
          <div className="mt-4">
            <div className="text-sm font-semibold mb-1">
              {model === "xgb" ? "Variables destacadas (modelo)" : "Principales factores"}
            </div>
            <ul className="text-sm list-disc list-inside text-muted-foreground">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {showFeatures && (
          <div className="mt-4 p-3 bg-muted rounded border">
            <div className="text-sm font-semibold mb-1">Variables calculadas</div>
            <pre className="text-xs overflow-x-auto">
              {features ? JSON.stringify(features, null, 2) : "Cargando..."}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
