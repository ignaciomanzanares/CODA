import { describe, it, expect } from 'vitest';
import { reconcile } from '../evaluateRisk';
import type { CreditScorecardResult } from '../creditScorecard';
import type { TransactionalScoreResult } from '../transactionalScore';

const trad = (pd: number): { available: true } & CreditScorecardResult => ({
  available: true, modelId: 'm', pd, logit: 0, score: 600, band: { label: 'Bueno', desc: '' }, reasons: [], features: { mora30: 0, mora60: 0, mora90: 0, dti: 0, util: 0 },
});
const tx = (pd: number | null): TransactionalScoreResult =>
  pd == null ? { available: false, isBeta: true } : { available: true, isBeta: true, pd, score: 70, band: 'Bueno' };

describe('reconcile', () => {
  it('ambos riesgo bajo → agree true', () => {
    const r = reconcile(trad(0.05), tx(0.08));
    expect(r.agree).toBe(true);
    expect(r.note).toMatch(/riesgo bajo/i);
  });

  it('ambos riesgo alto → agree true', () => {
    const r = reconcile(trad(0.4), tx(0.3));
    expect(r.agree).toBe(true);
    expect(r.note).toMatch(/riesgo elevado/i);
  });

  it('divergen (uno bajo, otro alto) → agree false', () => {
    const r = reconcile(trad(0.05), tx(0.3));
    expect(r.agree).toBe(false);
    expect(r.note).toMatch(/difieren/i);
  });

  it('thin_file (sin tradicional) → agree null, nota beta', () => {
    const r = reconcile({ available: false }, tx(0.1));
    expect(r.agree).toBeNull();
    expect(r.note).toMatch(/beta|buró/i);
  });

  it('sin datos en ninguno → agree null', () => {
    const r = reconcile({ available: false }, tx(null));
    expect(r.agree).toBeNull();
  });
});
