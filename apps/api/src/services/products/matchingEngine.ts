/**
 * Product Matching Engine
 * 
 * Calculates how well each financial product matches a user's profile
 * based on credit score, income, debt-to-income ratio, and transactional behavior.
 * 
 * Algorithm:
 * 1. Filter out ineligible products (hard requirements)
 * 2. Calculate match score (0-100) for each eligible product
 * 3. Rank by: matchScore * priority * approvalRate
 * 4. Return top N recommendations with explanations
 */

import type { ProductCatalogItem } from './productCatalog.js';
import { logger } from '../../logger.js';

/** Versión del motor de matching (trazabilidad CMF / NCG 502). */
export const PRODUCT_MATCHING_ENGINE_VERSION = 'v1.0.0';

export interface UserProfile {
  userId: string;
  creditScore?: number; // 300-850
  transactionalScore?: number; // 0-1000
  monthlyIncome?: number; // CLP
  monthlyDebt?: number; // CLP
  age?: number;
  hasVehicle?: boolean;
  hasProperty?: boolean;
  employmentMonths?: number;
  /**
   * Estado de salud financiera (-2..+5) del motor `evaluateHealthV2`. Acopla las
   * recomendaciones a la SITUACIÓN del usuario, no solo a su score crediticio: a un
   * usuario sobreendeudado no se le ofrece deuda revolvente nueva, a uno con excedente
   * se le prioriza ahorro/inversión. Si es `undefined`, el motor se comporta igual que
   * antes (solo score + ingresos) — backward-compatible.
   */
  financialHealthLevel?: number;
}

/**
 * Política de productos según el nivel de salud financiera (-2..+5). Espeja el mapeo
 * `nivel → salida` del motor de salud (`evaluationEngine.ts`): la "salida" de un nivel
 * crítico es reestructurar/refinanciar (no tomar más deuda), y la de un nivel sano es
 * ahorrar/proteger patrimonio. `excluded` es regla dura (producto inelegible);
 * `preferred`/`discouraged` ajustan el match score sin bloquear.
 */
export interface HealthProductPolicy {
  preferredCategories: ReadonlySet<string>;
  discouragedCategories: ReadonlySet<string>;
  excludedCategories: ReadonlySet<string>;
}

export function getHealthProductPolicy(level: number): HealthProductPolicy {
  // -2 (insolvencia activa): necesita reestructuración legal, no productos de crédito.
  // No se le ofrece NADA de deuda nueva; ahorro/seguro quedan desincentivados (no es la prioridad).
  if (level <= -2) {
    return {
      preferredCategories: new Set(),
      discouragedCategories: new Set(['savings', 'insurance']),
      excludedCategories: new Set(['credit_cards', 'loans']),
    };
  }
  // -1 (endeudado): la salida es refinanciar/consolidar. Préstamos sí (para consolidar),
  // pero NUNCA una tarjeta de crédito nueva (deuda revolvente que agrava la carga).
  if (level === -1) {
    return {
      preferredCategories: new Set(['loans']),
      discouragedCategories: new Set(['savings']),
      excludedCategories: new Set(['credit_cards']),
    };
  }
  // 0 (sin deudas, sin excedente): refinanciamiento preventivo; sin sesgo fuerte.
  if (level === 0) {
    return {
      preferredCategories: new Set(['loans']),
      discouragedCategories: new Set(),
      excludedCategories: new Set(),
    };
  }
  // >=1 (excedente para ahorrar/proteger): priorizar ahorro/seguro; no sumar deuda revolvente.
  return {
    preferredCategories: new Set(['savings', 'insurance']),
    discouragedCategories: new Set(['credit_cards']),
    excludedCategories: new Set(),
  };
}

export interface ProductMatch {
  product: ProductCatalogItem;
  matchScore: number; // 0-100
  isEligible: boolean;
  eligibilityReasons: string[];
  ineligibilityReasons: string[];
  rankingScore: number; // matchScore * priority * approvalRate
  explanation: string;
}

/**
 * Main function: Match products to user profile
 */
export function matchProductsToUser(
  products: ProductCatalogItem[],
  userProfile: UserProfile,
  /**
   * Pesos de conversión por producto (#35), de `product_ranking_weights`: multiplican el
   * rankingScore para que los productos que CONVIERTEN de verdad suban en la lista. Default 1.0
   * (sin efecto) cuando no hay dato — el sistema funciona igual sin haber corrido el job.
   */
  conversionWeights: Record<number, number> = {},
): ProductMatch[] {
  const matches: ProductMatch[] = [];

  for (const product of products) {
    // Only consider active products
    if (!product.isActive) continue;

    const conversionFactor = product.id != null ? (conversionWeights[product.id] ?? 1) : 1;
    const match = evaluateProductMatch(product, userProfile, conversionFactor);
    matches.push(match);
  }

  // Sort by ranking score (descending)
  matches.sort((a, b) => b.rankingScore - a.rankingScore);

  return matches;
}

/**
 * Evaluate a single product against user profile
 */
function evaluateProductMatch(
  product: ProductCatalogItem,
  userProfile: UserProfile,
  conversionFactor = 1,
): ProductMatch {
  const eligibilityReasons: string[] = [];
  const ineligibilityReasons: string[] = [];

  // Check hard eligibility requirements
  let isEligible = true;

  // Credit score check
  if (product.minCreditScore && userProfile.creditScore !== undefined) {
    if (userProfile.creditScore < product.minCreditScore) {
      isEligible = false;
      ineligibilityReasons.push(
        `Score crediticio ${userProfile.creditScore} menor al requerido (${product.minCreditScore})`
      );
    } else {
      eligibilityReasons.push('Cumple requisito de score crediticio');
    }
  }

  if (product.maxCreditScore && userProfile.creditScore !== undefined) {
    if (userProfile.creditScore > product.maxCreditScore) {
      isEligible = false;
      ineligibilityReasons.push(
        `Score crediticio ${userProfile.creditScore} supera el máximo (${product.maxCreditScore})`
      );
    }
  }

  // Income check
  if (product.minIncome && userProfile.monthlyIncome !== undefined) {
    if (userProfile.monthlyIncome < product.minIncome) {
      isEligible = false;
      ineligibilityReasons.push(
        `Ingreso mensual menor al requerido (CLP ${product.minIncome.toLocaleString('es-CL')})`
      );
    } else {
      eligibilityReasons.push('Cumple requisito de ingresos');
    }
  }

  // Debt-to-income ratio check
  if (product.maxDebtToIncome && userProfile.monthlyIncome && userProfile.monthlyDebt !== undefined) {
    const dti = userProfile.monthlyDebt / userProfile.monthlyIncome;
    if (dti > product.maxDebtToIncome) {
      isEligible = false;
      ineligibilityReasons.push(
        `Ratio deuda/ingreso ${(dti * 100).toFixed(1)}% supera el máximo (${(product.maxDebtToIncome * 100).toFixed(0)}%)`
      );
    } else {
      eligibilityReasons.push('Ratio deuda/ingreso saludable');
    }
  }

  // Financial-health gate (#25): acopla la recomendación a la situación, no solo al score.
  // Ej.: no ofrecer una tarjeta de crédito nueva a un usuario sobreendeudado (nivel ≤ -1).
  const healthPolicy =
    userProfile.financialHealthLevel !== undefined
      ? getHealthProductPolicy(userProfile.financialHealthLevel)
      : null;
  if (healthPolicy?.excludedCategories.has(product.category)) {
    isEligible = false;
    ineligibilityReasons.push(
      'No recomendado para tu situación financiera actual: prioriza ordenar tu deuda antes de tomar un nuevo crédito.'
    );
  } else if (healthPolicy?.preferredCategories.has(product.category)) {
    eligibilityReasons.push('Alineado con tu objetivo financiero actual');
  }

  // Calculate match score (0-100) using product-specific weights
  const matchScore = calculateMatchScore(product, userProfile, isEligible, healthPolicy);

  // Calculate ranking score: combines match quality, priority, approval rate y el peso de
  // conversión real (#35, default 1.0). El peso de conversión está acotado en el job a un rango
  // razonable para que no domine ni anule a los otros factores.
  const approvalFactor = product.approvalRate ?? 0.5;
  const priorityFactor = (product.priority ?? 50) / 100;
  const rankingScore = matchScore * priorityFactor * approvalFactor * conversionFactor * 100;

  // Generate human-readable explanation
  const explanation = generateExplanation(product, userProfile, matchScore, isEligible);

  return {
    product,
    matchScore,
    isEligible,
    eligibilityReasons,
    ineligibilityReasons,
    rankingScore,
    explanation
  };
}

/**
 * Calculate match score (0-100) based on how well user fits product criteria
 */
function calculateMatchScore(
  product: ProductCatalogItem,
  userProfile: UserProfile,
  isEligible: boolean,
  healthPolicy: HealthProductPolicy | null = null
): number {
  // If not eligible, return low score
  if (!isEligible) return 0;

  // Parse matching weights (or use defaults)
  let weights = {
    creditScore: 0.35,
    income: 0.25,
    debtToIncome: 0.20,
    transactionalScore: 0.15,
    profileComplete: 0.05
  };

  if (product.matchingWeights) {
    try {
      weights = JSON.parse(product.matchingWeights);
    } catch {
      // Use defaults if parsing fails
    }
  }

  let totalScore = 0;
  let totalWeight = 0;

  // Credit score component (higher is better, but diminishing returns)
  if (weights.creditScore > 0 && userProfile.creditScore !== undefined) {
    const creditNormalized = normalizeCreditScore(userProfile.creditScore, product);
    totalScore += creditNormalized * weights.creditScore;
    totalWeight += weights.creditScore;
  }

  // Income component (meeting minimum = good, excess = marginal benefit)
  if (weights.income > 0 && userProfile.monthlyIncome !== undefined && product.minIncome) {
    const incomeRatio = userProfile.monthlyIncome / product.minIncome;
    const incomeNormalized = Math.min(100, 50 + (incomeRatio - 1) * 50); // 100 = 2x minimum
    totalScore += incomeNormalized * weights.income;
    totalWeight += weights.income;
  }

  // Debt-to-income component (lower is better)
  if (weights.debtToIncome > 0 && userProfile.monthlyIncome && userProfile.monthlyDebt !== undefined && product.maxDebtToIncome) {
    const dti = userProfile.monthlyDebt / userProfile.monthlyIncome;
    const dtiNormalized = Math.max(0, 100 - (dti / product.maxDebtToIncome) * 100);
    totalScore += dtiNormalized * weights.debtToIncome;
    totalWeight += weights.debtToIncome;
  }

  // Transactional score component (SFA score)
  if (weights.transactionalScore > 0 && userProfile.transactionalScore !== undefined) {
    // Transactional score is 0-100 scale
    const transactionalNormalized = userProfile.transactionalScore;
    totalScore += transactionalNormalized * weights.transactionalScore;
    totalWeight += weights.transactionalScore;
  }

  // Profile completeness bonus
  if (weights.profileComplete > 0) {
    const completeness = calculateProfileCompleteness(userProfile);
    totalScore += completeness * weights.profileComplete;
    totalWeight += weights.profileComplete;
  }

  // Normalize to 0-100; return a base score of 50 when no criteria to evaluate
  // (allows eligible products with unknown profile to still be ranked)
  let score = totalWeight > 0 ? totalScore / totalWeight : 50;

  // Ajuste por salud financiera (#25): refuerza la categoría apropiada para la
  // situación del usuario y penaliza (sin excluir) la que no lo es.
  if (healthPolicy) {
    if (healthPolicy.preferredCategories.has(product.category)) {
      score = Math.min(100, score * 1.15);
    } else if (healthPolicy.discouragedCategories.has(product.category)) {
      score = score * 0.8;
    }
  }

  return score;
}

/**
 * Normalize credit score to 0-100 scale for matching
 */
function normalizeCreditScore(score: number, product: ProductCatalogItem): number {
  const min = product.minCreditScore ?? 300;
  const max = product.maxCreditScore ?? 850;
  const range = max - min;

  if (score < min) return 0;
  if (score > max) return 100;

  // Linear normalization with bonus for exceeding minimum
  const excess = score - min;
  const normalized = (excess / range) * 100;

  // Bonus for high scores (680+ = excellent)
  if (score >= 680) {
    return Math.min(100, normalized + 10);
  }

  return normalized;
}

/**
 * Calculate how complete a user profile is (0-100)
 */
function calculateProfileCompleteness(userProfile: UserProfile): number {
  let complete = 0;
  let total = 0;

  const fields = [
    userProfile.creditScore,
    userProfile.transactionalScore,
    userProfile.monthlyIncome,
    userProfile.monthlyDebt,
    userProfile.age,
    userProfile.employmentMonths
  ];

  fields.forEach(field => {
    total++;
    if (field !== undefined && field !== null) complete++;
  });

  return total > 0 ? (complete / total) * 100 : 0;
}

/**
 * Generate human-readable explanation for why product was recommended
 */
function generateExplanation(
  product: ProductCatalogItem,
  userProfile: UserProfile,
  matchScore: number,
  isEligible: boolean
): string {
  if (!isEligible) {
    return 'No cumples todos los requisitos de elegibilidad';
  }

  if (matchScore >= 80) {
    return 'Excelente match - Altamente recomendado para tu perfil';
  }
  if (matchScore >= 60) {
    return 'Buen match - Cumples los requisitos principales';
  }
  if (matchScore >= 40) {
    return 'Match aceptable - Considera otras opciones también';
  }
  return 'Match bajo - Revisa los requisitos cuidadosamente';
}

/**
 * Get top N product recommendations for a user
 */
export function getTopRecommendations(
  products: ProductCatalogItem[],
  userProfile: UserProfile,
  limit: number = 5,
  category?: string,
  conversionWeights: Record<number, number> = {},
): ProductMatch[] {
  // Filter by category if specified
  let filteredProducts = products;
  if (category) {
    filteredProducts = products.filter(p => p.category === category);
  }

  // Get all matches (#35: ponderados por conversión real cuando hay pesos)
  const matches = matchProductsToUser(filteredProducts, userProfile, conversionWeights);

  // When the user's profile is sparse (no credit or transactional score), the
  // matchScore can be artificially low even for eligible products. In that case,
  // show all eligible products so the user always sees recommendations.
  const hasRichProfile =
    userProfile.creditScore !== undefined || userProfile.transactionalScore !== undefined;
  const scoreThreshold = hasRichProfile ? 30 : 0;

  const eligibleMatches = matches.filter(m => m.isEligible && m.matchScore >= scoreThreshold);

  // Return top N
  return eligibleMatches.slice(0, limit);
}

/**
 * Explain why a specific product was recommended (for UI display)
 */
export function explainRecommendation(match: ProductMatch): {
  title: string;
  reasons: string[];
  warnings: string[];
} {
  const reasons = [...match.eligibilityReasons];
  const warnings: string[] = [];

  // Add score-based reasons
  if (match.matchScore >= 80) {
    reasons.push('Tu perfil financiero es ideal para este producto');
  }

  if (match.product.approvalRate && match.product.approvalRate >= 0.70) {
    reasons.push(`Alta tasa de aprobación (${(match.product.approvalRate * 100).toFixed(0)}%)`);
  }

  if (match.product.avgProcessingDays && match.product.avgProcessingDays <= 2) {
    reasons.push('Aprobación rápida (1-2 días)');
  }

  // Add warnings for marginal eligibility
  if (match.matchScore < 50) {
    warnings.push('Tu perfil está en el límite de los requisitos');
  }

  return {
    title: match.explanation,
    reasons,
    warnings
  };
}

/**
 * Calculate user's debt-to-income ratio from expenses/transactions
 */
export function estimateDebtToIncome(
  monthlyIncome: number,
  monthlyExpenses: number,
  existingDebts: number = 0
): number {
  const totalMonthlyDebt = monthlyExpenses + existingDebts;
  return totalMonthlyDebt / monthlyIncome;
}

/**
 * Suggest optimal loan amount for a user based on their profile
 */
export function suggestLoanAmount(userProfile: UserProfile): number {
  if (!userProfile.monthlyIncome) return 0;

  // Conservative approach: 3-4x monthly income
  const baseLoan = userProfile.monthlyIncome * 3.5;

  // Adjust based on credit score
  if (userProfile.creditScore && userProfile.creditScore >= 700) {
    return Math.round(baseLoan * 1.2); // +20% for excellent credit
  }
  if (userProfile.creditScore && userProfile.creditScore < 600) {
    return Math.round(baseLoan * 0.8); // -20% for lower credit
  }

  return Math.round(baseLoan);
}
