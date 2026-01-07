import { describe, it, expect } from "vitest";
import { scorePD } from "../services/pdScoring.js";
import type { FeatureVector } from "../ml/features.js";

describe("PD Scoring", () => {
  const mockFeatures: FeatureVector = {
    windowDays: 90,
    txCount: 100,
    debitCount: 60,
    creditCount: 40,
    totalDebits: 5000,
    totalCredits: 6000,
    avgAmount: 10,
    stdAmount: 50,
    activeDays: 45,
    debitCreditRatio: 0.83,
    incomeRegularity: 0.8,
    topCategoryShare: 0.3,
    monthlyIncome: 2000,
    monthlyDebits: 1666.67,
    dti: 0.83,
    dtiCapped: 0.83,
    incomeTrend30_90: 1.0,
    netCashflowVolatility: 0.5,
    recurringExpenseShare: 0.4,
  };

  it("should return a PD between 0 and 1", () => {
    const result = scorePD(mockFeatures);

    expect(result.pd).toBeGreaterThanOrEqual(0);
    expect(result.pd).toBeLessThanOrEqual(1);
  });

  it("should include logit value", () => {
    const result = scorePD(mockFeatures);

    expect(typeof result.logit).toBe("number");
    expect(isFinite(result.logit)).toBe(true);
  });

  it("should provide reason codes", () => {
    const result = scorePD(mockFeatures);

    expect(Array.isArray(result.reasons)).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.length).toBeLessThanOrEqual(3);
  });

  it("should give lower PD for healthy financial profile", () => {
    const healthyFeatures: FeatureVector = {
      ...mockFeatures,
      debitCreditRatio: 0.5, // Low spending relative to income
      incomeRegularity: 0.95, // Very regular income
      dti: 0.5,
      dtiCapped: 0.5,
      netCashflowVolatility: 0.2, // Low volatility
    };

    const result = scorePD(healthyFeatures);

    expect(result.pd).toBeLessThan(0.5); // Should have low default probability
  });

  it("should give higher PD for risky financial profile", () => {
    const riskyFeatures: FeatureVector = {
      ...mockFeatures,
      debitCreditRatio: 1.5, // High spending relative to income
      incomeRegularity: 0.3, // Irregular income
      dti: 2.0,
      dtiCapped: 2.0,
      netCashflowVolatility: 1.5, // High volatility
    };

    const healthyFeatures: FeatureVector = {
      ...mockFeatures,
      debitCreditRatio: 0.5, // Low spending relative to income
      incomeRegularity: 0.95, // Very regular income
      dti: 0.5,
      dtiCapped: 0.5,
      netCashflowVolatility: 0.2, // Low volatility
    };

    const riskyResult = scorePD(riskyFeatures);
    const healthyResult = scorePD(healthyFeatures);

    // Risky profile should have higher PD than healthy profile
    expect(riskyResult.pd).toBeGreaterThan(healthyResult.pd);
  });

  it("should handle edge cases gracefully", () => {
    const zeroFeatures: FeatureVector = {
      windowDays: 90,
      txCount: 0,
      debitCount: 0,
      creditCount: 0,
      totalDebits: 0,
      totalCredits: 0,
      avgAmount: 0,
      stdAmount: 0,
      activeDays: 0,
      debitCreditRatio: 0,
      incomeRegularity: 0,
      topCategoryShare: 0,
      monthlyIncome: 0,
      monthlyDebits: 0,
      dti: 0,
      dtiCapped: 0,
      incomeTrend30_90: 0,
      netCashflowVolatility: 0,
      recurringExpenseShare: 0,
    };

    const result = scorePD(zeroFeatures);

    expect(result.pd).toBeGreaterThanOrEqual(0);
    expect(result.pd).toBeLessThanOrEqual(1);
    expect(isFinite(result.pd)).toBe(true);
  });
});
