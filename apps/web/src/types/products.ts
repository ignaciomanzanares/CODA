/**
 * Tipos para el catálogo de productos financieros y el motor de ranking.
 * Los campos opcionales son null cuando el dato no está disponible o no aplica.
 */

export const PRODUCT_CATEGORIES = {
  cuentas_ahorro: "Cuentas corrientes y de ahorro",
  tarjetas_credito: "Tarjetas de crédito",
  creditos_consumo: "Créditos de consumo",
  lineas_credito: "Líneas de crédito",
  creditos_hipotecarios: "Créditos hipotecarios",
  depositos_plazo: "Depósitos a plazo",
  fondos_mutuos: "Fondos mutuos",
  seguros: "Seguros",
  apv: "APV",
  portabilidad: "Portabilidad financiera",
} as const;

export type ProductCategory = keyof typeof PRODUCT_CATEGORIES;

export interface Product {
  id: string;
  institution: string;
  institution_logo_url: string | null;
  category: ProductCategory;
  name: string;
  short_description: string;
  /** CAE (Costo Anual Equivalente) para créditos, tasa efectiva anual para depósitos/APV, en % */
  annual_rate_pct: number | null;
  /** Costo mensual en CLP (mantención, administración). 0 = sin costo */
  monthly_cost_clp: number | null;
  /** Ingreso líquido mínimo requerido en CLP */
  min_income_clp: number | null;
  /** Score crediticio mínimo requerido (0–850) */
  min_credit_score: number | null;
  tags: string[];
  source_url: string;
  /** Última verificación de tasas/condiciones (ISO date) */
  last_verified: string;
  /** Texto de divulgación CMF requerido */
  disclosure: string;
}

/** Perfil financiero del usuario, derivado de sus datos cargados */
export interface UserFinancialProfile {
  /** Ingreso mensual promedio estimado en CLP */
  monthly_income_clp: number | null;
  /** Score crediticio CMF (0–850) */
  credit_score: number | null;
  /** Score transaccional CODA (0–100) */
  transactional_score: number | null;
  /** Deuda mensual estimada en CLP */
  monthly_debt_clp: number | null;
  /** Ahorro mensual estimado en CLP */
  monthly_savings_clp: number | null;
  /** Edad del usuario */
  age: number | null;
  /** Si el usuario tiene datos reales cargados */
  has_real_data: boolean;
}

export type EligibilityStatus = "eligible" | "borderline" | "not_eligible";

export interface RankingReason {
  type: string;
  weight: number;       // -100 a +100
  explanation_es: string;
}

export interface RankedProduct extends Product {
  /** Score de ranking 0-100 para este usuario */
  score: number;
  /** Beneficio económico anual estimado en CLP (null si no calculable) */
  expected_benefit_clp: number | null;
  eligibility: EligibilityStatus;
  reasons: RankingReason[];
}
