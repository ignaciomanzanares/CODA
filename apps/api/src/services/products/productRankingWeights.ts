/**
 * Reponderación de productos por conversión real (#35).
 *
 * Lee la conversión del funnel por producto (`getProductFunnelMetrics`) y calcula un peso que
 * multiplica el `rankingScore` en `matchProductsToUser`: los productos que CONVIERTEN por sobre
 * el promedio suben, los que convierten por debajo bajan — acotado para no dominar ni anular los
 * otros factores (match, prioridad, aprobación). Cada corrida inserta una fila por producto en
 * `product_ranking_weights` → historial versionado y auditable (no se sobrescribe).
 */
import { randomUUID } from 'node:crypto';
import { db, productRankingWeights, financialProducts, desc } from '../../db/index.js';
import { getProductFunnelMetrics } from './leadTrackingService.js';
import { mlLogger as logger } from '../../logger.js';

const WEIGHT_MIN = 0.5;
const WEIGHT_MAX = 1.5;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Peso = tasa_conversión_producto / tasa_promedio, acotado a [0.5, 1.5]. Si no hay promedio
 * (sin datos), 1.0 (neutro). Pura y testeable.
 */
export function computeConversionWeight(productRate: number, meanRate: number): number {
  // Sin promedio, o producto sin conversión registrada (probable falta de datos, no mala
  // conversión): peso neutro 1.0 — no penalizamos a un producto nuevo por no tener funnel aún.
  if (meanRate <= 0 || productRate <= 0) return 1.0;
  return clamp(productRate / meanRate, WEIGHT_MIN, WEIGHT_MAX);
}

type MetricsFetcher = (productId: number) => Promise<{ overallConversionRate: number }>;

/**
 * Recalcula y persiste los pesos de ranking. `fetchMetrics` es inyectable para tests; por
 * defecto usa el funnel real. Devuelve el id de la corrida y cuántos productos procesó.
 */
export async function recomputeProductRankingWeights(opts?: {
  fetchMetrics?: MetricsFetcher;
}): Promise<{ version: string; products: number }> {
  const fetchMetrics: MetricsFetcher = opts?.fetchMetrics ?? ((id) => getProductFunnelMetrics(id));

  const products = (await db
    .select({ id: financialProducts.id, isActive: financialProducts.isActive })
    .from(financialProducts)) as Array<{ id: number; isActive: unknown }>;
  const active = products.filter((p) => p.isActive === true || p.isActive === 1);

  const rates = await Promise.all(
    active.map(async (p) => {
      try {
        const m = await fetchMetrics(p.id);
        return { id: p.id, rate: Number(m.overallConversionRate) || 0 };
      } catch {
        return { id: p.id, rate: 0 };
      }
    }),
  );

  const withConversion = rates.filter((r) => r.rate > 0);
  const meanRate = withConversion.length
    ? withConversion.reduce((s, r) => s + r.rate, 0) / withConversion.length
    : 0;

  const version = new Date().toISOString();
  for (const r of rates) {
    const weight = computeConversionWeight(r.rate, meanRate);
    await db.insert(productRankingWeights).values({
      id: randomUUID(),
      productId: r.id,
      weight,
      conversionRate: r.rate,
      version,
    });
  }

  logger.info({ version, products: rates.length, meanRate }, '[productRankingWeights] pesos recalculados');
  return { version, products: rates.length };
}

/** Mapa productId → peso vigente (el más reciente por producto). Default vacío = neutro. */
export async function getLatestRankingWeights(): Promise<Record<number, number>> {
  try {
    const rows = (await db
      .select()
      .from(productRankingWeights)
      .orderBy(desc(productRankingWeights.computedAt))) as Array<{ productId: number; weight: number }>;
    const latest: Record<number, number> = {};
    for (const r of rows) if (latest[r.productId] === undefined) latest[r.productId] = r.weight;
    return latest;
  } catch (e) {
    logger.warn({ err: e }, '[productRankingWeights] no se pudieron leer pesos (se usa neutro)');
    return {};
  }
}
