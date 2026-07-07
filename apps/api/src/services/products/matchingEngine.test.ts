import { describe, it, expect } from 'vitest';
import {
  getHealthProductPolicy,
  matchProductsToUser,
  getTopRecommendations,
  type UserProfile,
} from './matchingEngine.js';
import type { ProductCatalogItem } from './productCatalog.js';

/** Producto mínimo de catálogo para tests (sin gates de score salvo lo indicado). */
function makeProduct(
  category: ProductCatalogItem['category'],
  overrides: Partial<ProductCatalogItem> = {},
): ProductCatalogItem {
  return {
    productName: `${category} product`,
    provider: 'Test Bank',
    productType: category,
    category,
    description: 'test',
    requirements: '[]',
    features: '[]',
    isActive: 1,
    priority: 50,
    approvalRate: 0.7,
    ...overrides,
  };
}

const baseProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  userId: 'u1',
  creditScore: 700,
  transactionalScore: 60,
  monthlyIncome: 1_500_000,
  monthlyDebt: 300_000,
  ...overrides,
});

describe('getHealthProductPolicy', () => {
  it('insolvencia activa (-2): excluye toda deuda nueva', () => {
    const p = getHealthProductPolicy(-2);
    expect(p.excludedCategories.has('credit_cards')).toBe(true);
    expect(p.excludedCategories.has('loans')).toBe(true);
    expect(p.preferredCategories.size).toBe(0);
  });

  it('endeudado (-1): excluye tarjetas, prefiere préstamos (consolidar)', () => {
    const p = getHealthProductPolicy(-1);
    expect(p.excludedCategories.has('credit_cards')).toBe(true);
    expect(p.excludedCategories.has('loans')).toBe(false);
    expect(p.preferredCategories.has('loans')).toBe(true);
  });

  it('con excedente (>=1): prefiere ahorro/seguro, desincentiva tarjetas', () => {
    const p = getHealthProductPolicy(2);
    expect(p.preferredCategories.has('savings')).toBe(true);
    expect(p.preferredCategories.has('insurance')).toBe(true);
    expect(p.discouragedCategories.has('credit_cards')).toBe(true);
    expect(p.excludedCategories.size).toBe(0);
  });
});

describe('matching acoplado a salud financiera (#25)', () => {
  it('usuario sobreendeudado (-1): la tarjeta de crédito queda inelegible', () => {
    const products = [makeProduct('credit_cards'), makeProduct('loans')];
    const indebted = baseProfile({ financialHealthLevel: -1 });

    const matches = matchProductsToUser(products, indebted);
    const card = matches.find((m) => m.product.category === 'credit_cards')!;
    const loan = matches.find((m) => m.product.category === 'loans')!;

    expect(card.isEligible).toBe(false);
    expect(card.ineligibilityReasons.join(' ')).toMatch(/situación financiera/i);
    expect(loan.isEligible).toBe(true);
  });

  it('getTopRecommendations no devuelve la tarjeta a un sobreendeudado', () => {
    const products = [makeProduct('credit_cards'), makeProduct('loans'), makeProduct('savings')];
    const recs = getTopRecommendations(products, baseProfile({ financialHealthLevel: -1 }), 5);
    expect(recs.some((m) => m.product.category === 'credit_cards')).toBe(false);
    expect(recs.some((m) => m.product.category === 'loans')).toBe(true);
  });

  it('usuario sano (nivel 3): ahorro puntúa más que la misma base sin sesgo', () => {
    const savings = makeProduct('savings');
    const healthy = baseProfile({ financialHealthLevel: 3 });
    const neutral = baseProfile({ financialHealthLevel: undefined });

    const healthyScore = matchProductsToUser([savings], healthy)[0].matchScore;
    const neutralScore = matchProductsToUser([savings], neutral)[0].matchScore;
    expect(healthyScore).toBeGreaterThan(neutralScore);
  });

  it('usuario sano (nivel 3): la tarjeta de crédito puntúa menos que sin sesgo (desincentivada, no excluida)', () => {
    const card = makeProduct('credit_cards');
    const healthy = baseProfile({ financialHealthLevel: 3 });
    const neutral = baseProfile({ financialHealthLevel: undefined });

    const healthyMatch = matchProductsToUser([card], healthy)[0];
    const neutralScore = matchProductsToUser([card], neutral)[0].matchScore;

    expect(healthyMatch.isEligible).toBe(true); // desincentivada, no bloqueada
    expect(healthyMatch.matchScore).toBeLessThan(neutralScore);
  });

  it('backward-compatible: sin financialHealthLevel el resultado no cambia', () => {
    const products = [makeProduct('credit_cards'), makeProduct('loans')];
    const profile = baseProfile({ financialHealthLevel: undefined });
    const matches = matchProductsToUser(products, profile);
    // Todas elegibles (sin gates de score que las bloqueen) — comportamiento previo.
    expect(matches.every((m) => m.isEligible)).toBe(true);
  });
});
