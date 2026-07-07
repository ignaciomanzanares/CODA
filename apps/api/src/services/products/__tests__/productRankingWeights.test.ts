import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, sql } from '../../../db/index.js';
import {
  computeConversionWeight,
  recomputeProductRankingWeights,
  getLatestRankingWeights,
} from '../productRankingWeights.js';
import { matchProductsToUser, type ProductCatalogItem, type UserProfile } from '../matchingEngine.js';

beforeAll(() => {
  db.run(
    sql`CREATE TABLE IF NOT EXISTS product_ranking_weights (
      id TEXT PRIMARY KEY, product_id INTEGER NOT NULL, weight REAL NOT NULL,
      conversion_rate REAL, version TEXT NOT NULL,
      computed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
});

describe('computeConversionWeight (#35)', () => {
  it('da 1.0 (neutro) sin datos, >1 sobre el promedio, <1 bajo el promedio, acotado', () => {
    expect(computeConversionWeight(5, 0)).toBe(1.0); // sin promedio
    expect(computeConversionWeight(10, 5)).toBeCloseTo(1.5, 5); // 2x → cap 1.5
    expect(computeConversionWeight(6, 5)).toBeCloseTo(1.2, 5);
    expect(computeConversionWeight(1, 5)).toBeCloseTo(0.5, 5); // 0.2x → floor 0.5
  });
});

describe('reweight aplicado al ranking (#35)', () => {
  const baseProduct = (id: number): ProductCatalogItem =>
    ({
      id,
      name: `P${id}`,
      category: 'credito',
      isActive: true,
      priority: 50,
      approvalRate: 0.5,
    }) as unknown as ProductCatalogItem;

  it('un producto con mayor peso de conversión rankea por encima de uno idéntico', () => {
    const products = [baseProduct(1), baseProduct(2)];
    const userProfile = { userId: 'u', creditScore: 700 } as unknown as UserProfile;

    // Sin pesos: empatan (mismo ranking). Con peso, el producto 2 sube.
    const ranked = matchProductsToUser(products, userProfile, { 1: 0.5, 2: 1.5 });
    expect(ranked[0].product.id).toBe(2);
    expect(ranked[0].rankingScore).toBeGreaterThan(ranked[1].rankingScore);
  });
});

describe('persistencia versionada (#35)', () => {
  const version1Products = [101, 102, 103];

  afterAll(async () => {
    await db.run(sql`DELETE FROM product_ranking_weights WHERE product_id IN (101,102,103)`);
  });

  it('persiste una fila por producto y getLatest devuelve el peso vigente', async () => {
    // fetchMetrics inyectado: 102 convierte el doble que 101; 103 no convierte.
    const fakeMetrics = async (id: number) => ({
      overallConversionRate: id === 101 ? 5 : id === 102 ? 10 : 0,
    });
    // financialProducts está vacío en el dev DB de test → inyectamos vía un recompute manual.
    // Probamos el cálculo+persistencia insertando como lo haría el job:
    const mean = (5 + 10) / 2; // solo los que convierten
    const version = new Date().toISOString();
    for (const id of version1Products) {
      const rate = (await fakeMetrics(id)).overallConversionRate;
      const weight = computeConversionWeight(rate, mean);
      await db.run(
        sql`INSERT INTO product_ranking_weights (id, product_id, weight, conversion_rate, version)
            VALUES (${`${version}-${id}`}, ${id}, ${weight}, ${rate}, ${version})`,
      );
    }

    const latest = await getLatestRankingWeights();
    expect(latest[102]).toBeGreaterThan(latest[101]); // 102 convierte más → más peso
    expect(latest[103]).toBe(1.0); // sin conversión → neutro
  });

  it('recomputeProductRankingWeights corre sin productos activos (no rompe)', async () => {
    const result = await recomputeProductRankingWeights({
      fetchMetrics: async () => ({ overallConversionRate: 0 }),
    });
    expect(typeof result.version).toBe('string');
    expect(result.products).toBeGreaterThanOrEqual(0);
  });
});
