import { describe, it, expect } from 'vitest';
import { computeTransactionalScore } from '../transactionalScore';
import type { UserRiskProfile } from '../userRiskProfile';

function profile(transactionMonths: number): UserRiskProfile {
  return {
    userId: 'u1',
    transactional: {} as any,
    cmf: null,
    gov: { fiscalDebtClp: null, verifiedMonthlyIncomeClp: null },
    cartola: null,
    assets: [],
    storedScores: { creditScore: null, transactionalScore: null, txMetrics: null },
    meta: { hasCmfHistory: false, hasCartola: false, transactionMonths, ingresoMensualClp: 0, deudaTotalClp: 0 },
  };
}

describe('computeTransactionalScore', () => {
  it('sin señal suficiente (<3 meses) → available:false, sin número inventado', async () => {
    const r = await computeTransactionalScore(profile(1));
    expect(r.available).toBe(false);
    expect(r.score).toBeUndefined();
    expect(r.reason).toBeTruthy();
    expect(r.isBeta).toBe(true);
  });

  it('0 meses → available:false', async () => {
    const r = await computeTransactionalScore(profile(0));
    expect(r.available).toBe(false);
  });
});
