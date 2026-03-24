import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import type { Metric } from "web-vitals";

/**
 * En producción registra métricas en consola hasta integrar Sentry u otro APM.
 */
export function reportWebVitals(): void {
  if (!import.meta.env.PROD) return;
  const log = (metric: Metric) => console.log("[web-vitals]", metric.name, metric);
  onCLS(log);
  onFCP(log);
  onLCP(log);
  onTTFB(log);
  onINP(log);
}
