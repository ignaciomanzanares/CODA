import { useEffect, useState } from "react";
import { API_URL, apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function DemoPDCard() {
const [pd, setPd] = useState<number | null>(null);
  const [model, setModel] = useState<'baseline'|'xgb'>('baseline');
  const [reasons, setReasons] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFeatures, setShowFeatures] = useState(false);
  const [features, setFeatures] = useState<Record<string, any> | null>(null);
  const [modelInfo, setModelInfo] = useState<any | null>(null);

  async function fetchPD() {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch(`/api/demo/pd?model=${model}`);
      setPd(data.pd);
      setReasons(data.reasons || []);
    } catch (_e) {
      setError("Failed to fetch PD");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPD();
    if (model === 'xgb') {
      apiFetch('/api/pd/model/info')
        .then((data) => setModelInfo(data))
        .catch(() => setModelInfo(null));
    } else {
      setModelInfo(null);
    }
  }, [model]);

  const percent = pd != null ? (pd * 100).toFixed(1) : "-";

  async function fetchFeatures() {
    try {
      setShowFeatures(true);
      const data = await apiFetch("/api/demo/features");
      setFeatures(data);
    } catch (_e) {
      // ignore
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Default Risk (Demo)</h3>
<div className="flex items-center gap-2">
<select className="border rounded px-2 py-1 text-sm" value={model} onChange={(e)=>setModel(e.target.value as any)}>
              <option value="baseline">Baseline</option>
              <option value="xgb">XGBoost (if available)</option>
            </select>
            <Button variant="outline" size="sm" onClick={fetchFeatures}>View Features</Button>
            <Button variant="outline" size="sm" onClick={fetchPD} disabled={loading}>{loading ? "Updating…" : "Refresh"}</Button>
          </div>
        </div>
        {error && <div className="text-red-500 text-sm mt-2">{error}</div>}
        <div className="mt-4">
          <div className="text-3xl font-bold">{percent}%</div>
          <div className="text-xs text-muted-foreground">Probability of default ({model === 'baseline' ? 'demo baseline' : 'XGBoost'})</div>
          {modelInfo && (
            <div className="text-xs text-muted-foreground mt-1">AUC: {modelInfo?.metrics?.auc?.toFixed ? modelInfo.metrics.auc.toFixed(3) : modelInfo?.metrics?.auc}</div>
          )}
        </div>
        {reasons.length > 0 && (
          <div className="mt-4">
            <div className="text-sm font-semibold mb-1">{model === 'xgb' ? 'Top SHAP features' : 'Top factors'}</div>
            <ul className="text-sm list-disc list-inside text-muted-foreground">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {showFeatures && (
          <div className="mt-4 p-3 bg-muted rounded border">
            <div className="text-sm font-semibold mb-1">Computed features</div>
            <pre className="text-xs overflow-x-auto">{features ? JSON.stringify(features, null, 2) : "Loading..."}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
