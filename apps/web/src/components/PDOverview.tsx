import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function bandForPD(pd: number) {
  if (pd < 0.05) return { label: "Low", color: "text-emerald-600", ring: "#10b981" };
  if (pd < 0.15) return { label: "Moderate", color: "text-amber-600", ring: "#f59e0b" };
  if (pd < 0.30) return { label: "High", color: "text-orange-600", ring: "#f97316" };
  return { label: "Very High", color: "text-red-600", ring: "#ef4444" };
}

export default function PDOverview() {
  const [pd, setPd] = useState<number | null>(null);
  const [model, setModel] = useState<'baseline' | 'xgb'>('xgb');
  const [reasons, setReasons] = useState<string[]>([]);
  const [explain, setExplain] = useState<{ feature: string; value?: number; shap?: number }[] | null>(null);
  const [features, setFeatures] = useState<Record<string, any> | null>(null);
  const [modelInfo, setModelInfo] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFeatures, setShowFeatures] = useState(false);

  async function fetchPD() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/demo/pd?model=${model}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setPd(Number(data.pd));
      setReasons(Array.isArray(data.reasons) ? data.reasons : []);
      setFeatures(data.features || null);
    } catch {
      setError("Failed to fetch PD");
    } finally {
      setLoading(false);
    }
  }

  async function fetchExplain() {
    try {
      const res = await fetch('/api/demo/pd/explain?top=6');
      if (!res.ok) return setExplain(null);
      const data = await res.json();
      const items = (data?.explanation?.top || data?.explanation || []) as any[];
      const mapped = items.map((it: any) => ({ feature: it.feature || String(it[0] ?? ''), value: it.value, shap: it.shap ?? it.importance }));
      setExplain(mapped);
    } catch {
      setExplain(null);
    }
  }

  async function fetchModel() {
    if (model !== 'xgb') { setModelInfo(null); return; }
    try {
      const res = await fetch('/api/pd/model/info');
      if (res.ok) setModelInfo(await res.json());
      else setModelInfo(null);
    } catch { setModelInfo(null); }
  }

  useEffect(() => { fetchPD(); fetchModel(); if (model === 'xgb') fetchExplain(); }, [model]);

  const percent = pd == null ? '-' : (pd * 100).toFixed(1);
  const band = useMemo(() => bandForPD(pd || 0), [pd]);
  const ringStyle = useMemo(() => {
    const p = Math.max(0, Math.min(100, (pd || 0) * 100));
    const deg = (p / 100) * 360;
    return {
      background: `conic-gradient(${band.ring} ${deg}deg, #e5e7eb ${deg}deg)`
    } as React.CSSProperties;
  }, [pd, band]);

  const topItems = explain && explain.length ? explain : (reasons || []).filter(r => r !== 'model:xgb').map(r => ({ feature: r }))

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold">Default Risk</h3>
            <div className={`text-sm ${band.color}`}>{band.label} risk</div>
          </div>
          <div className="flex items-center gap-2">
            <select className="border rounded px-2 py-1 text-sm" value={model} onChange={(e)=>setModel(e.target.value as any)}>
              <option value="baseline">Baseline</option>
              <option value="xgb">XGBoost</option>
            </select>
            <Button variant="outline" size="sm" onClick={()=>setShowFeatures(v=>!v)}>Features</Button>
            <Button variant="outline" size="sm" onClick={fetchPD} disabled={loading}>{loading? 'Updating…':'Refresh'}</Button>
          </div>
        </div>

        {error && <div className="text-red-500 text-sm">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 flex items-center justify-center">
            <div className="relative w-40 h-40 rounded-full" style={ringStyle}>
              <div className="absolute inset-2 bg-white rounded-full flex flex-col items-center justify-center">
                <div className="text-3xl font-bold">{percent}%</div>
                <div className="text-xs text-muted-foreground">Probability of default</div>
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            {modelInfo && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-xs text-muted-foreground">
                <div className="p-2 rounded border bg-muted/30"><span className="font-semibold">AUC</span> {typeof modelInfo?.metrics?.auc === 'number' ? modelInfo.metrics.auc.toFixed(3) : modelInfo?.metrics?.auc}</div>
                <div className="p-2 rounded border bg-muted/30"><span className="font-semibold">Gini</span> {typeof modelInfo?.metrics?.gini === 'number' ? modelInfo.metrics.gini.toFixed(3) : modelInfo?.metrics?.gini}</div>
                <div className="p-2 rounded border bg-muted/30"><span className="font-semibold">KS</span> {typeof modelInfo?.metrics?.ks === 'number' ? modelInfo.metrics.ks.toFixed(3) : modelInfo?.metrics?.ks}</div>
                <div className="p-2 rounded border bg-muted/30"><span className="font-semibold">Brier</span> {typeof modelInfo?.metrics?.brier === 'number' ? modelInfo.metrics.brier.toFixed(3) : modelInfo?.metrics?.brier}</div>
              </div>
            )}
            <div>
              <div className="text-sm font-semibold mb-2">{model === 'xgb' ? 'Top contributing features' : 'Top factors'}</div>
              {topItems && topItems.length > 0 ? (
                <ul className="space-y-1">
                  {topItems.slice(0,6).map((it:any) => (
                    <li key={it.feature} className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="font-medium">{it.feature}</span>
                      {typeof it.value === 'number' && <span className="text-xs text-muted-foreground">{it.value.toFixed ? it.value.toFixed(2) : it.value}</span>}
                      {typeof it.shap === 'number' && (
                        <span className={`ml-auto text-xs ${it.shap >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{it.shap >= 0 ? '+' : ''}{it.shap.toFixed(3)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-muted-foreground">No feature attributions available.</div>
              )}
              {model === 'xgb' && (
                <div className="mt-3">
                  <Button size="sm" variant="outline" onClick={fetchExplain}>Explain instance</Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {showFeatures && (
          <div className="mt-4 p-3 bg-muted rounded border">
            <div className="text-sm font-semibold mb-1">Computed features</div>
            <pre className="text-xs overflow-x-auto">{features ? JSON.stringify(features, null, 2) : 'Loading...'}</pre>
          </div>
        )}

        <div className="text-xs text-muted-foreground mt-2">
          This demonstration uses synthetic or sandbox data. Predictions are illustrative and not a lending decision.
        </div>
      </CardContent>
    </Card>
  );
}