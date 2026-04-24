import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth, getPersonalToken } from "@/lib/auth";
import { cn, formatCurrency } from "@/lib/utils";
import type { CurrencyCode } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";

// Data & ranking
import seedProducts from "@/data/products.seed.json";
import { rankProductsByCategory } from "@/lib/product-ranking";
import { PRODUCT_CATEGORIES } from "@/types/products";
import type { Product, ProductCategory, UserFinancialProfile, RankedProduct, EligibilityStatus } from "@/types/products";

// UI
import { PastelIcon } from "@/components/ui/pastel-icon";
import { EyebrowLabel } from "@/components/ui/eyebrow-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Icons
import {
  Wallet,
  CreditCard,
  PiggyBank,
  Shield,
  TrendingUp,
  TrendingDown,
  Banknote,
  BarChart3,
  Repeat2,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

type TabKey = ProductCategory | "all";

const TABS: { id: TabKey; label: string; icon: React.ElementType }[] = [
  { id: "all", label: "Todos", icon: BarChart3 },
  { id: "cuentas_ahorro", label: "Cuentas", icon: Wallet },
  { id: "tarjetas_credito", label: "Tarjetas", icon: CreditCard },
  { id: "creditos_consumo", label: "Consumo", icon: Banknote },
  { id: "lineas_credito", label: "Líneas", icon: TrendingUp },
  { id: "creditos_hipotecarios", label: "Hipotecarios", icon: PiggyBank },
  { id: "depositos_plazo", label: "Depósitos", icon: TrendingUp },
  { id: "fondos_mutuos", label: "Fondos", icon: BarChart3 },
  { id: "seguros", label: "Seguros", icon: Shield },
  { id: "apv", label: "APV", icon: TrendingUp },
  { id: "portabilidad", label: "Portabilidad", icon: Repeat2 },
];

const ELIGIBILITY_CONFIG: Record<EligibilityStatus, {
  label: string;
  icon: React.ElementType;
  badgeClass: string;
}> = {
  eligible: {
    label: "Elegible",
    icon: CheckCircle2,
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  },
  borderline: {
    label: "Posible",
    icon: AlertCircle,
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  },
  not_eligible: {
    label: "No elegible",
    icon: XCircle,
    badgeClass: "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400",
  },
};

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

const emptyProfile: UserFinancialProfile = {
  monthly_income_clp: null,
  credit_score: null,
  transactional_score: null,
  monthly_debt_clp: null,
  monthly_savings_clp: null,
  age: null,
  has_real_data: false,
};

function buildProfile(
  financialSummary: { summary?: { monthlyIncome?: number; monthlyExpenses?: number } } | null,
  creditScoreData: { score?: number } | null,
  transactionalData: { transactionalScore?: number } | null,
): UserFinancialProfile {
  const income = financialSummary?.summary?.monthlyIncome ?? null;
  const expenses = financialSummary?.summary?.monthlyExpenses ?? null;
  const savings = income !== null && expenses !== null ? income - expenses : null;
  return {
    monthly_income_clp: income,
    credit_score: creditScoreData?.score ?? null,
    transactional_score: transactionalData?.transactionalScore ?? null,
    monthly_debt_clp: null,
    monthly_savings_clp: savings && savings > 0 ? savings : null,
    age: null,
    has_real_data: income !== null || (creditScoreData?.score ?? null) !== null,
  };
}

// ──────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-emerald-500" : score >= 45 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-[11px] font-semibold tabular-nums text-muted-foreground w-6 text-right">
        {score}
      </span>
    </div>
  );
}

function ProductCard({ product, currency }: { product: RankedProduct; currency: CurrencyCode }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = ELIGIBILITY_CONFIG[product.eligibility];
  const EligIcon = cfg.icon;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {/* Score gauge */}
          <div className="shrink-0 flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">{product.score}</span>
            </div>
            <span className="text-[10px] text-muted-foreground">score</span>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start gap-2 mb-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                {product.institution}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full",
                  cfg.badgeClass
                )}
              >
                <EligIcon className="h-3 w-3" />
                {cfg.label}
              </span>
            </div>

            <h3 className="font-semibold text-foreground leading-snug mb-1">
              {product.name}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              {product.short_description}
            </p>

            {/* Key metrics row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3">
              {product.annual_rate_pct !== null && (
                <span className="text-foreground">
                  <span className="text-muted-foreground">CAE/Tasa: </span>
                  <strong>{product.annual_rate_pct.toFixed(2)}%</strong>
                </span>
              )}
              {product.monthly_cost_clp !== null && (
                <span className="text-foreground">
                  <span className="text-muted-foreground">Mantención: </span>
                  <strong>
                    {product.monthly_cost_clp === 0
                      ? "Gratis"
                      : formatCurrency(product.monthly_cost_clp, currency) + "/mes"}
                  </strong>
                </span>
              )}
              {product.expected_benefit_clp !== null && product.expected_benefit_clp > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  <span className="text-muted-foreground">Beneficio est.: </span>
                  <strong>+{formatCurrency(product.expected_benefit_clp, currency)}/año</strong>
                </span>
              )}
            </div>

            {/* Score bar */}
            <ScoreBar score={product.score} />
          </div>
        </div>

        {/* Expand / Collapse reasons + CTA */}
        <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Info className="h-3.5 w-3.5" />
            {expanded ? "Ocultar razones" : "Ver razones"}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <a
            href={product.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Ver en {product.institution}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Reasons */}
        {expanded && product.reasons.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {product.reasons.map((r, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 text-xs rounded-lg px-3 py-2",
                  r.weight > 0
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                )}
              >
                {r.weight > 0 ? (
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                )}
                {r.explanation_es}
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground px-1 pt-1 leading-relaxed">
              {product.disclosure}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyCategory() {
  return (
    <div className="text-center py-16 text-muted-foreground">
      <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p className="text-sm">No hay productos en esta categoría.</p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────

export default function Products() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { currency } = useCurrency();
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  // Fetch financial profile data (best-effort, used for ranking)
  const { data: financialSummary } = useQuery({
    queryKey: ["financial-summary"],
    queryFn: () => {
      const token = getPersonalToken();
      if (!token) return null;
      return apiFetch("/api/financial-summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isAuthenticated && !authLoading,
    staleTime: 30_000,
  });

  const { data: creditScoreData } = useQuery({
    queryKey: ["/api/credit-score"],
    queryFn: () => {
      const token = getPersonalToken();
      if (!token) return null;
      return apiFetch("/api/credit-score", {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isAuthenticated && !authLoading,
    staleTime: 60_000,
  });

  const { data: transactionalData } = useQuery({
    queryKey: ["/api/transactional-score"],
    queryFn: () => {
      const token = getPersonalToken();
      if (!token) return null;
      return apiFetch("/api/transactional-score", {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isAuthenticated && !authLoading,
    staleTime: 60_000,
  });

  // Build user profile
  const profile = useMemo(() => {
    if (!isAuthenticated) return emptyProfile;
    return buildProfile(financialSummary ?? null, creditScoreData ?? null, transactionalData ?? null);
  }, [isAuthenticated, financialSummary, creditScoreData, transactionalData]);

  // Rank products for the active tab
  const rankedProducts: RankedProduct[] = useMemo(() => {
    return rankProductsByCategory(seedProducts as Product[], activeTab, profile);
  }, [activeTab, profile]);

  const eligibleCount = rankedProducts.filter(p => p.eligibility === "eligible").length;
  const hasProfile = profile.has_real_data;

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">

        {/* Option A conversion hook: stay on page, invite personalisation */}
        {!isAuthenticated && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Ranking personalizado disponible
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Inicia sesión para ver qué productos se adaptan a tu perfil real de ingresos y score.
              </p>
            </div>
            <a
              href="/iniciar-sesion"
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Personalizar ranking
            </a>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start gap-4">
          <PastelIcon icon={BarChart3} color="orange" size="md" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Productos financieros
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {hasProfile
                ? `Ranking personalizado · ${eligibleCount} productos elegibles para tu perfil`
                : "Catálogo con más de 50 productos de instituciones chilenas"}
            </p>
          </div>
          {hasProfile && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium bg-primary/10 text-primary px-2.5 py-1 rounded-full shrink-0">
              <Sparkles className="h-3 w-3" />
              Personalizado
            </span>
          )}
        </div>

        {/* Profile notice when no data */}
        {isAuthenticated && !hasProfile && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex items-start gap-3">
            <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Sube una cartola bancaria para que el motor de ranking adapte los resultados a tu
              perfil de ingresos y score.
            </p>
          </div>
        )}

        {/* Category tabs — scrollable on mobile */}
        <div className="-mx-4 sm:mx-0">
          <div className="flex gap-2 overflow-x-auto px-4 sm:px-0 pb-1 scrollbar-none">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-all shrink-0",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active category label */}
        {activeTab !== "all" && (
          <EyebrowLabel color="muted">
            {PRODUCT_CATEGORIES[activeTab as ProductCategory]}
          </EyebrowLabel>
        )}

        {/* Products list */}
        {rankedProducts.length === 0 ? (
          <EmptyCategory />
        ) : (
          <div className="space-y-4">
            {rankedProducts.map(product => (
              <ProductCard key={product.id} product={product} currency={currency} />
            ))}
          </div>
        )}

        {/* Legal footer */}
        <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-6">
          Las tasas y condiciones mostradas son referenciales obtenidas de fuentes públicas de las
          instituciones. CODA no es intermediario financiero ni garantiza aprobación. La decisión
          final corresponde a cada institución. Última verificación: abril 2026.
        </p>
      </div>
    </div>
  );
}
