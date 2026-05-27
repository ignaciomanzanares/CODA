/**
 * Motor de ranking de productos financieros CODA.
 *
 * Para cada producto, calcula:
 *  - eligibility: eligible | borderline | not_eligible
 *  - score: 0-100 (mayor = más adecuado para el perfil del usuario)
 *  - expected_benefit_clp: beneficio económico anual estimado (null si no calculable)
 *  - reasons: lista de razones con peso y explicación en español
 *
 * El score se compone de:
 *   40 pts  →  elegibilidad / adecuación al perfil
 *   30 pts  →  beneficio económico esperado (relativo a la categoría)
 *   20 pts  →  costo total (menor costo = más puntos)
 *   10 pts  →  bonus por tags relevantes al perfil
 */

import type { Product, UserFinancialProfile, RankedProduct, RankingReason } from "@/types/products";

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Estima el beneficio anual en CLP según la categoría del producto */
function estimateBenefitClp(
  product: Product,
  profile: UserFinancialProfile
): number | null {
  const cat = product.category;

  // Depósitos y DAP: rentabilidad sobre ahorro mensual * 12
  if (cat === "depositos_plazo" && product.annual_rate_pct !== null) {
    const capitalBase = (profile.monthly_savings_clp ?? 100_000) * 12;
    return Math.round(capitalBase * (product.annual_rate_pct / 100));
  }

  // Créditos: ahorro vs tasa promedio de mercado (referencial 24%)
  if (
    (cat === "creditos_consumo" || cat === "lineas_credito") &&
    product.annual_rate_pct !== null
  ) {
    const deuda = profile.monthly_debt_clp ?? 0;
    if (deuda <= 0) return null;
    const marketRate = 24;
    const saving = deuda * 12 * ((marketRate - product.annual_rate_pct) / 100);
    return saving > 0 ? Math.round(saving) : null;
  }

  // Hipotecarios: ahorro vs tasa promedio de mercado (referencial 5.2%)
  if (cat === "creditos_hipotecarios" && product.annual_rate_pct !== null) {
    const deuda = profile.monthly_debt_clp ?? 0;
    if (deuda <= 0) return null;
    const marketRate = 5.2;
    const saving = deuda * 12 * ((marketRate - product.annual_rate_pct) / 100);
    return saving > 0 ? Math.round(saving) : null;
  }

  // Fondos mutuos: estimación basada en ahorro disponible (retorno esperado no garantizable)
  // → no mostramos cifras inventadas; retornamos null
  return null;
}

// ──────────────────────────────────────────────────────────────
// Módulo de eligibilidad
// ──────────────────────────────────────────────────────────────

interface EligibilityResult {
  status: "eligible" | "borderline" | "not_eligible";
  reasons: RankingReason[];
  eligibilityScore: number; // 0 - 40
}

function assessEligibility(
  product: Product,
  profile: UserFinancialProfile
): EligibilityResult {
  const reasons: RankingReason[] = [];
  let blockers = 0;
  let warnings = 0;

  // Renta mínima
  if (product.min_income_clp !== null && profile.monthly_income_clp !== null) {
    if (profile.monthly_income_clp < product.min_income_clp) {
      blockers++;
      reasons.push({
        type: "income_below_minimum",
        weight: -80,
        explanation_es: `Tu ingreso mensual estimado (${formatClp(profile.monthly_income_clp)}) es inferior al mínimo requerido (${formatClp(product.min_income_clp)}).`,
      });
    } else if (profile.monthly_income_clp < product.min_income_clp * 1.2) {
      warnings++;
      reasons.push({
        type: "income_borderline",
        weight: -20,
        explanation_es: `Tu ingreso está justo por encima del mínimo requerido. La aprobación podría depender de otros factores.`,
      });
    } else {
      reasons.push({
        type: "income_ok",
        weight: 15,
        explanation_es: `Tu ingreso supera holgadamente el mínimo requerido por este producto.`,
      });
    }
  }

  // Score crediticio
  if (product.min_credit_score !== null && profile.credit_score !== null) {
    if (profile.credit_score < product.min_credit_score) {
      blockers++;
      reasons.push({
        type: "credit_score_below_minimum",
        weight: -70,
        explanation_es: `Tu score CMF (${profile.credit_score}) es inferior al mínimo requerido (${product.min_credit_score}).`,
      });
    } else if (profile.credit_score < product.min_credit_score * 1.1) {
      warnings++;
      reasons.push({
        type: "credit_score_borderline",
        weight: -15,
        explanation_es: `Tu score crediticio está cerca del mínimo. Podría requerirse revisión manual.`,
      });
    }
  }

  // Score transaccional CODA (0-100): si es muy bajo, advertencia
  if (profile.transactional_score !== null && profile.transactional_score < 30) {
    warnings++;
    reasons.push({
      type: "low_transactional_score",
      weight: -15,
      explanation_es: `Tu score transaccional CODA es bajo (${profile.transactional_score}/100), lo que puede influir en la evaluación de algunos productos.`,
    });
  }

  let status: EligibilityResult["status"];
  let eligibilityScore: number;

  if (blockers > 0) {
    status = "not_eligible";
    eligibilityScore = 0;
  } else if (warnings > 0) {
    status = "borderline";
    eligibilityScore = 20;
  } else {
    status = "eligible";
    eligibilityScore = 40;
  }

  return { status, reasons, eligibilityScore };
}

// ──────────────────────────────────────────────────────────────
// Módulo de beneficio económico (0 - 30 pts)
// ──────────────────────────────────────────────────────────────

const BENEFIT_SCALE_BY_CATEGORY: Record<string, number> = {
  creditos_consumo: 500_000,      // ahorro anual de 500k = 30 pts
  lineas_credito: 300_000,
  creditos_hipotecarios: 1_000_000,
  depositos_plazo: 200_000,
  fondos_mutuos: 300_000,
  cuentas_ahorro: 100_000,
  tarjetas_credito: 100_000,
  portabilidad: 800_000,
};

function benefitScore(product: Product, benefitClp: number | null): { score: number; reasons: RankingReason[] } {
  const reasons: RankingReason[] = [];
  if (benefitClp === null) return { score: 15, reasons }; // neutral cuando no calculable

  const scale = BENEFIT_SCALE_BY_CATEGORY[product.category] ?? 200_000;
  const pts = clamp(Math.round((benefitClp / scale) * 30), 0, 30);

  if (benefitClp > 0) {
    reasons.push({
      type: "positive_benefit",
      weight: pts,
      explanation_es: `Beneficio económico anual estimado: ${formatClp(benefitClp)}.`,
    });
  }

  return { score: pts, reasons };
}

// ──────────────────────────────────────────────────────────────
// Módulo de costo (0 - 20 pts)
// ──────────────────────────────────────────────────────────────

function costScore(product: Product): { score: number; reasons: RankingReason[] } {
  const reasons: RankingReason[] = [];

  if (product.monthly_cost_clp === null) {
    return { score: 10, reasons }; // desconocido → neutral
  }

  if (product.monthly_cost_clp === 0) {
    reasons.push({
      type: "no_monthly_cost",
      weight: 20,
      explanation_es: "Sin costo de mantención mensual.",
    });
    return { score: 20, reasons };
  }

  const annualCost = product.monthly_cost_clp * 12;
  // $0 → 20 pts, $120k/año → 0 pts, proporcional
  const pts = clamp(Math.round(20 - (annualCost / 120_000) * 20), 0, 20);

  reasons.push({
    type: "monthly_cost",
    weight: -(20 - pts),
    explanation_es: `Costo mensual de mantención: ${formatClp(product.monthly_cost_clp)}/mes (${formatClp(annualCost)}/año).`,
  });

  return { score: pts, reasons };
}

// ──────────────────────────────────────────────────────────────
// Módulo de tags / perfil (0 - 10 pts)
// ──────────────────────────────────────────────────────────────

function tagScore(product: Product, profile: UserFinancialProfile): { score: number; reasons: RankingReason[] } {
  const reasons: RankingReason[] = [];
  let pts = 5; // base neutral

  const tags = product.tags.map(t => t.toLowerCase());

  // Sin renta mínima + usuario sin ingreso conocido
  if (profile.monthly_income_clp === null && tags.includes("sin renta mínima")) {
    pts += 3;
    reasons.push({
      type: "tag_no_income_req",
      weight: 3,
      explanation_es: "Este producto no requiere ingreso mínimo demostrable.",
    });
  }

  // Sin costo
  if (tags.some(t => t.includes("sin costo") || t.includes("sin anualidad"))) {
    pts += 2;
    reasons.push({
      type: "tag_free",
      weight: 2,
      explanation_es: "Producto gratuito, sin comisiones de apertura ni mantención.",
    });
  }

  // Digital / app
  if (tags.some(t => t.includes("digital") || t.includes("online") || t.includes("app"))) {
    pts += 1;
    reasons.push({
      type: "tag_digital",
      weight: 1,
      explanation_es: "Disponible 100% en línea o a través de la app.",
    });
  }

  // Cooperativa → más accesible para perfil bajo
  if (
    product.institution.toLowerCase().includes("coopeuch") &&
    profile.monthly_income_clp !== null &&
    profile.monthly_income_clp < 500_000
  ) {
    pts += 2;
    reasons.push({
      type: "tag_cooperative",
      weight: 2,
      explanation_es: "Cooperativa con tasas preferenciales para rentas medias y bajas.",
    });
  }

  return { score: clamp(pts, 0, 10), reasons };
}

// ──────────────────────────────────────────────────────────────
// Formateo auxiliar
// ──────────────────────────────────────────────────────────────

function formatClp(n: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
}

// ──────────────────────────────────────────────────────────────
// Función principal
// ──────────────────────────────────────────────────────────────

export function rankProducts(
  products: Product[],
  profile: UserFinancialProfile
): RankedProduct[] {
  return products
    .map((product): RankedProduct => {
      const { status, reasons: eligReasons, eligibilityScore } = assessEligibility(product, profile);

      const benefitClp = estimateBenefitClp(product, profile);
      const { score: bScore, reasons: bReasons } = benefitScore(product, benefitClp);
      const { score: cScore, reasons: cReasons } = costScore(product);
      const { score: tScore, reasons: tReasons } = tagScore(product, profile);

      const totalScore = clamp(eligibilityScore + bScore + cScore + tScore, 0, 100);

      const reasons: RankingReason[] = [
        ...eligReasons,
        ...bReasons,
        ...cReasons,
        ...tReasons,
      ].filter(r => r.weight !== 0);

      // Mostrar solo las 3 razones más relevantes (por peso absoluto)
      const topReasons = [...reasons]
        .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
        .slice(0, 3);

      return {
        ...product,
        score: totalScore,
        expected_benefit_clp: benefitClp,
        eligibility: status,
        reasons: topReasons,
      };
    })
    .sort((a, b) => {
      // Elegibles primero, luego borderline, luego no elegibles
      const order = { eligible: 0, borderline: 1, not_eligible: 2 };
      const oDiff = order[a.eligibility] - order[b.eligibility];
      if (oDiff !== 0) return oDiff;
      return b.score - a.score;
    });
}

/**
 * Filtra por categoría y rankea. Útil para la vista de tabs.
 */
export function rankProductsByCategory(
  products: Product[],
  category: string | "all",
  profile: UserFinancialProfile
): RankedProduct[] {
  const filtered = category === "all"
    ? products
    : products.filter(p => p.category === category);

  return rankProducts(filtered, profile);
}
