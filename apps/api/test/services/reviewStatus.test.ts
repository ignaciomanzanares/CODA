import { describe, it, expect } from "vitest";
import {
  requiresReview,
  isManualCategory,
  countRequiresReview,
  MANUAL_RULE_ID,
  MANUAL_CATEGORIZER_VERSION,
} from "../../src/services/transactions/reviewStatus.js";

describe("requiresReview — criterios de 'por revisar'", () => {
  it("categoría 'otro'/'otros'/vacía requiere revisión (slug o etiqueta)", () => {
    expect(requiresReview({ category: "otro", categoryConfidence: 0.9 })).toBe(true);
    expect(requiresReview({ category: "Otro", categoryConfidence: 0.9 })).toBe(true);
    expect(requiresReview({ category: "otros" })).toBe(true);
    expect(requiresReview({ category: "" })).toBe(true);
    expect(requiresReview({ category: null })).toBe(true);
  });

  it("confianza baja (< 0.5) requiere revisión", () => {
    expect(requiresReview({ category: "alimentacion", categoryConfidence: 0.2 })).toBe(true);
    expect(requiresReview({ category: "alimentacion", categoryConfidence: 0.49 })).toBe(true);
  });

  it("regla de respaldo explícita (fallback.* / unknown) requiere revisión", () => {
    expect(
      requiresReview({
        category: "alimentacion",
        categoryConfidence: 0.9,
        categoryRuleId: "fallback.otro",
      }),
    ).toBe(true);
    expect(requiresReview({ category: "x", categoryRuleId: "unknown" })).toBe(true);
  });

  it("categoría confiable NO requiere revisión", () => {
    expect(
      requiresReview({
        category: "alimentacion",
        categoryConfidence: 0.9,
        categoryRuleId: "cl.super",
      }),
    ).toBe(false);
  });

  it("regla vacía/null NO sobre-marca (evita flaggear todo)", () => {
    expect(
      requiresReview({ category: "alimentacion", categoryConfidence: 0.9, categoryRuleId: null }),
    ).toBe(false);
    expect(
      requiresReview({ category: "alimentacion", categoryConfidence: 0.9, categoryRuleId: "" }),
    ).toBe(false);
  });

  it("una corrección MANUAL nunca requiere revisión, aunque sea 'otro'", () => {
    expect(
      requiresReview({ category: "otro", categoryConfidence: 0.1, categoryRuleId: MANUAL_RULE_ID }),
    ).toBe(false);
    expect(
      requiresReview({ category: "otro", categorizerVersion: MANUAL_CATEGORIZER_VERSION }),
    ).toBe(false);
  });
});

describe("isManualCategory", () => {
  it("detecta manual por rule_id o version", () => {
    expect(isManualCategory({ categoryRuleId: MANUAL_RULE_ID })).toBe(true);
    expect(isManualCategory({ categorizerVersion: MANUAL_CATEGORIZER_VERSION })).toBe(true);
    expect(isManualCategory({ categoryRuleId: "cl.super", categorizerVersion: "batch10.v3" })).toBe(
      false,
    );
  });
});

describe("countRequiresReview", () => {
  it("cuenta solo los pendientes (excluye manuales)", () => {
    const txs = [
      { category: "otro" }, // review
      { category: "alimentacion", categoryConfidence: 0.3 }, // review (low conf)
      { category: "transporte", categoryConfidence: 0.9, categoryRuleId: "cl.uber" }, // ok
      { category: "otro", categoryRuleId: MANUAL_RULE_ID }, // manual → no review
    ];
    expect(countRequiresReview(txs)).toBe(2);
  });
});
