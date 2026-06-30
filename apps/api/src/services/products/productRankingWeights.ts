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
import { sql } from 'drizzle-orm';

const WEIGHT_MIN = 0.5;
const WEIGHT_MAX = 1.5;
/** Pesos para la función objetivo: CTR aporta 30%, tasa de conversión el 70%. */
const ALPHA_CTR = 0.3;
const BETA_CONVERSION = 0.7;

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

/** Lee CTR y conversion rate desde product_conversion_events para todos los productos activos. */
async function getConversionMetricsFromEvents(productIds: string[]): Promise<Record<string, { ctr: number; conversionRate: number; hasData: boolean }>> {
  if (productIds.length === 0) return {};
  try {
    const rows = (await db.execute(sql`
      SELECT
        product_id,
        COUNT(*) FILTER (WHERE event_type = 'view') AS views,
        COUNT(*) FILTER (WHERE event_type = 'click') AS clicks,
        COUNT(*) FILTER (WHERE event_type = 'convert') AS conversions
      FROM product_conversion_events
      WHERE product_id IN (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)})
      GROUP BY product_id
    `)) as Array<{ product_id: string; views: number; clicks: number; conversions: number }>;

    const result: Record<string, { ctr: number; conversionRate: number; hasData: boolean }> = {};
    for (const r of rows) {
      const views = Number(r.views) || 0;
      const clicks = Number(r.clicks) || 0;
      const conversions = Number(r.conversions) || 0;
      const ctr = views > 0 ? clicks / views : 0;
      const conversionRate = clicks > 0 ? conversions / clicks : 0;
      result[r.product_id] = { ctr, conversionRate, hasData: views > 0 };
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Recalcula y persiste los pesos de ranking.
 * Función objetivo: alpha*CTR + beta*conversionRate (desde product_conversion_events).
 * Fallback: getProductFunnelMetrics si no hay eventos de conversión.
 * `fetchMetrics` es inyectable para tests.
 */
export async function recomputeProductRankingWeights(opts?: {
  fetchMetrics?: MetricsFetcher;
}): Promise<{ version: string; products: number }> {
  const fetchMetrics: MetricsFetcher = opts?.fetchMetrics ?? ((id) => getProductFunnelMetrics(id));

  const products = (await db
    .select({ id: financialProducts.id, isActive: financialProducts.isActive })
    .from(financialProducts)) as Array<{ id: number; isActive: unknown }>;
  const active = products.filter((p) => p.isActive === true || p.isActive === 1);

  // Intentar usar datos de product_conversion_events (función de pérdida definida: CTR × conversión)
  const conversionMetrics = await getConversionMetricsFromEvents(active.map((p) => String(p.id)));
  const hasEventData = Object.values(conversionMetrics).some((m) => m.hasData);

  const rates = await Promise.all(
    active.map(async (p) => {
      const key = String(p.id);
      if (hasEventData) {
        const m = conversionMetrics[key];
        // Función objetivo: alpha*CTR + beta*conversionRate
        const score = m ? ALPHA_CTR * m.ctr + BETA_CONVERSION * m.conversionRate : 0;
        return { id: p.id, rate: score };
      }
      // Fallback al funnel legacy cuando no hay eventos de conversión
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
