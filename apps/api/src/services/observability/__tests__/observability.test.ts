import { describe, it, expect } from 'vitest';
import { metrics, notifyOps, captureError } from '../index.js';

describe('metrics registry (formato Prometheus)', () => {
  it('cuenta y serializa counters con labels', () => {
    metrics.incCounter('coda_test_counter', { route: '/api/x', status: '200' });
    metrics.incCounter('coda_test_counter', { route: '/api/x', status: '200' });
    const out = metrics.render();
    expect(out).toContain('# TYPE coda_test_counter counter');
    expect(out).toContain('coda_test_counter{route="/api/x",status="200"} 2');
  });

  it('expone gauges', () => {
    metrics.setGauge('coda_test_gauge', 42, { route: '/api/y' });
    const out = metrics.render();
    expect(out).toContain('coda_test_gauge{route="/api/y"} 42');
  });
});

describe('observability degradado (sin flags)', () => {
  it('notifyOps no lanza si OPS_WEBHOOK_URL no está', async () => {
    delete process.env.OPS_WEBHOOK_URL;
    await expect(notifyOps('hola', { a: 1 })).resolves.toBeUndefined();
  });

  it('captureError no lanza sin Sentry y cuenta el error', () => {
    expect(() => captureError(new Error('boom'), { kind: 'unit' })).not.toThrow();
    expect(metrics.render()).toContain('coda_errors_total{kind="unit"}');
  });
});
