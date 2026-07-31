import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, useApi } from "@/lib/api";
import { useAuth, getPersonalToken, hasPersonalSession } from "@/lib/auth";
import { cn, formatCurrency } from "@/lib/utils";
import type { CurrencyCode } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";
import { useToast } from "@/hooks/use-toast";
import { useUploadDrawer } from "@/contexts/UploadDrawerContext";

// Data & ranking
import { rankProductsByCategory } from "@/lib/product-ranking";
import { PRODUCT_CATEGORIES } from "@/types/products";
import type {
  Product,
  ProductCategory,
  UserFinancialProfile,
  RankedProduct,
  RankingReason,
  EligibilityStatus,
} from "@/types/products";

// UI
import { PastelIcon } from "@/components/ui/pastel-icon";
import { EyebrowLabel } from "@/components/ui/eyebrow-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

// Icons
import {
  Wallet,
  CreditCard,
  PiggyBank,
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
  Send,
  Loader2,
  PartyPopper,
  ArrowRight,
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
  { id: "portabilidad", label: "Portabilidad", icon: Repeat2 },
];

const ELIGIBILITY_CONFIG: Record<
  EligibilityStatus,
  {
    label: string;
    icon: React.ElementType;
    badgeClass: string;
  }
> = {
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

/**
 * Mapea una fila de `financial_products` (respuesta de /api/financial-products) al tipo Product
 * del front. Clave: `id` = el id numérico real de la DB (como string), para que applyToProduct
 * (Number(product.id)) envíe el id correcto — antes el slug daba NaN.
 */
function mapApiProductToProduct(row: Record<string, unknown>): Product {
  let tags: string[] = [];
  const rawFeatures = row.features;
  if (typeof rawFeatures === "string") {
    try {
      const parsed = JSON.parse(rawFeatures);
      if (Array.isArray(parsed)) tags = parsed.map((t) => String(t));
    } catch {
      /* features no-JSON: sin tags */
    }
  } else if (Array.isArray(rawFeatures)) {
    tags = rawFeatures.map((t) => String(t));
  }
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  return {
    id: String(row.id),
    institution: String(row.provider ?? ""),
    institution_logo_url: (row.logoUrl as string | null) ?? null,
    category: String(row.category ?? "") as ProductCategory,
    name: String(row.productName ?? ""),
    short_description: String(row.description ?? ""),
    annual_rate_pct: num(row.interestRate),
    monthly_cost_clp: num(row.monthlyPayment),
    min_income_clp: num(row.minIncome),
    min_credit_score: num(row.minCreditScore),
    tags,
    source_url: String(row.externalUrl ?? ""),
    last_verified: String(row.lastVerified ?? ""),
    disclosure: String(row.disclosure ?? ""),
  };
}

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

function LeadCaptureDialog({
  product,
  open,
  onOpenChange,
}: {
  product: RankedProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { applyToProduct, trackProductEvent } = useApi();
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const [purpose, setPurpose] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Paso del flujo: datos → contrato (aceptación) → confirmación.
  const [step, setStep] = useState<"form" | "contract">("form");
  const [accepted, setAccepted] = useState(false);

  const holderName =
    (user as { name?: string; email?: string } | null)?.name ||
    (user as { name?: string; email?: string } | null)?.email?.split("@")[0] ||
    "Titular";

  const needsAmount = ["creditos_consumo", "creditos_hipotecarios", "lineas_credito"].includes(
    product.category,
  );

  // Paso 1 → 2: de los datos al contrato. No registra nada todavía.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) return;
    setStep("contract");
  };

  // Paso 2 → 3: aceptación. Registra el interés (best-effort: si el backend falla,
  // igual mostramos la confirmación — aceptar el contrato ya es el acto del usuario).
  const handleSign = async () => {
    if (!accepted) return;
    setSubmitting(true);
    try {
      await applyToProduct(Number(product.id), {
        purpose: purpose || undefined,
        requestedAmount: amount ? parseInt(amount, 10) : undefined,
        additionalInfo: { acceptedContract: true },
      }).catch(() => {});
      setSubmitted(true);
      toast({
        title: "Contrato firmado",
        description: `Tu solicitud de ${product.name} (${product.institution}) quedó registrada.`,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resetFlow = () => {
    setSubmitted(false);
    setStep("form");
    setAccepted(false);
    setPurpose("");
    setAmount("");
  };

  const handleGoToBank = () => {
    // Track click
    trackProductEvent(Number(product.id), "click").catch(() => {});
    window.open(product.source_url, "_blank", "noopener,noreferrer");
    onOpenChange(false);
    // Reset for next open
    setTimeout(resetFlow, 300);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setTimeout(resetFlow, 300);
      }}
    >
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <DialogHeader>
          <DialogTitle className="text-lg">Solicitar {product.name}</DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="py-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mx-auto">
              <PartyPopper className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">¡Solicitud registrada!</p>
              <p className="text-sm text-muted-foreground">
                Tu interés quedó guardado. Ahora puedes continuar directamente en el sitio de{" "}
                <strong>{product.institution}</strong> para completar el proceso.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={handleGoToBank} className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Ir a {product.institution}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        ) : step === "contract" ? (
          <div className="space-y-4">
            {/* Documento de contrato */}
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
              <div className="mb-3 border-b border-border pb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Contrato de apertura
                </p>
                <p className="mt-0.5 text-base font-bold text-foreground">{product.name}</p>
                <p className="text-xs text-muted-foreground">{product.institution}</p>
              </div>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Titular</dt>
                  <dd className="font-medium text-foreground text-right">{holderName}</dd>
                </div>
                {product.annual_rate_pct !== null && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">CAE / Tasa referencial</dt>
                    <dd className="font-medium text-foreground text-right">
                      {product.annual_rate_pct.toFixed(2)}%
                    </dd>
                  </div>
                )}
                {amount && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Monto solicitado</dt>
                    <dd className="font-medium text-foreground text-right">
                      ${parseInt(amount, 10).toLocaleString("es-CL")}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Fecha</dt>
                  <dd className="font-medium text-foreground text-right">
                    {new Date().toLocaleDateString("es-CL")}
                  </dd>
                </div>
              </dl>
              <ol className="mt-3 space-y-1.5 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground list-decimal pl-4">
                <li>
                  El titular solicita la apertura/contratación del producto indicado, sujeta a
                  evaluación y aprobación de {product.institution}.
                </li>
                <li>
                  Las condiciones (tasa, comisiones y cargos) son referenciales y se confirman en el
                  contrato definitivo de la institución.
                </li>
                <li>
                  CODA actúa como intermediario tecnológico; no otorga créditos ni capta fondos, y
                  no comparte tus datos sin tu consentimiento explícito.
                </li>
                <li>El titular declara que la información entregada es veraz.</li>
              </ol>
            </div>

            {/* Aceptación */}
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span className="text-xs text-muted-foreground leading-relaxed">
                He leído y acepto los términos y condiciones del contrato.
              </span>
            </label>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setStep("form")}
                disabled={submitting}
              >
                Volver
              </Button>
              <Button
                type="button"
                className="flex-1 gap-2"
                onClick={handleSign}
                disabled={submitting || !accepted}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Aceptar y solicitar
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-xl bg-muted/50 p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">{product.score}</span>
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-foreground text-sm truncate">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.institution}</p>
                </div>
              </div>
              {product.annual_rate_pct !== null && (
                <p className="text-xs text-muted-foreground">
                  CAE/Tasa:{" "}
                  <strong className="text-foreground">{product.annual_rate_pct.toFixed(2)}%</strong>
                </p>
              )}
            </div>

            {needsAmount && (
              <div className="space-y-1.5">
                <Label htmlFor="lead-amount">Monto estimado (CLP)</Label>
                <Input
                  id="lead-amount"
                  type="number"
                  placeholder="Ej: 5000000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Opcional. Ayuda a evaluar tu solicitud.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="lead-purpose">¿Para qué lo necesitas?</Label>
              <select
                id="lead-purpose"
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              >
                <option value="">Seleccionar (opcional)</option>
                <option value="ahorro">Ahorro e inversión</option>
                <option value="consolidar_deuda">Consolidar deudas</option>
                <option value="compra_vivienda">Compra de vivienda</option>
                <option value="vehiculo">Compra de vehículo</option>
                <option value="educacion">Educación</option>
                <option value="gastos_personales">Gastos personales</option>
                <option value="negocio">Emprendimiento o negocio</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              En el siguiente paso revisas y firmas el contrato. CODA no comparte datos personales
              sin tu consentimiento explícito.
            </p>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1 gap-2">
                Continuar <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MatchRing({ score }: { score: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color =
    score >= 70
      ? "text-emerald-500 dark:text-emerald-400"
      : score >= 45
        ? "text-amber-500 dark:text-amber-400"
        : "text-red-500 dark:text-red-400";
  const strokeColor =
    score >= 70
      ? "stroke-emerald-500 dark:stroke-emerald-400"
      : score >= 45
        ? "stroke-amber-500 dark:stroke-amber-400"
        : "stroke-red-500 dark:stroke-red-400";

  return (
    <div className="shrink-0 flex flex-col items-center gap-0.5">
      <div className="relative w-14 h-14 flex items-center justify-center">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 48 48">
          <circle
            cx="24"
            cy="24"
            r={radius}
            fill="none"
            className="stroke-muted/40"
            strokeWidth="3"
          />
          <circle
            cx="24"
            cy="24"
            r={radius}
            fill="none"
            className={strokeColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <span className={cn("absolute text-sm font-bold tabular-nums", color)}>{score}</span>
      </div>
      <span className="text-[10px] font-medium text-muted-foreground">match</span>
    </div>
  );
}

function BenefitBanner({ benefitClp, currency }: { benefitClp: number; currency: CurrencyCode }) {
  const monthly = Math.round(benefitClp / 12);
  return (
    <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/20 px-3 py-2">
      <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
        <TrendingDown className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          Ahorrarías ~{formatCurrency(monthly, currency)}/mes
        </p>
        <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/70">
          {formatCurrency(benefitClp, currency)} estimados al año vs. promedio del mercado
        </p>
      </div>
    </div>
  );
}

function TopReason({ reason }: { reason: RankingReason }) {
  const isPositive = reason.weight > 0;
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs rounded-lg px-3 py-2",
        isPositive
          ? "bg-emerald-50/60 text-emerald-700 dark:bg-emerald-500/5 dark:text-emerald-300"
          : "bg-red-50/60 text-red-600 dark:bg-red-500/5 dark:text-red-400",
      )}
    >
      {isPositive ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <XCircle className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="leading-snug">{reason.explanation_es}</span>
    </div>
  );
}

function ProductCard({ product, currency }: { product: RankedProduct; currency: CurrencyCode }) {
  const [expanded, setExpanded] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const cfg = ELIGIBILITY_CONFIG[product.eligibility];
  const EligIcon = cfg.icon;

  const hasBenefit = product.expected_benefit_clp !== null && product.expected_benefit_clp > 0;
  const topPositiveReason = product.reasons.find((r) => r.weight > 0);
  const remainingReasons = expanded ? product.reasons.slice(1) : [];

  return (
    <>
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            {/* Match ring */}
            <MatchRing score={product.score} />

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {product.institution}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full",
                    cfg.badgeClass,
                  )}
                >
                  <EligIcon className="h-3 w-3" />
                  {cfg.label}
                </span>
              </div>

              <h3 className="font-semibold text-foreground leading-snug mb-1">{product.name}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                {product.short_description}
              </p>

              {/* Key metrics row */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
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
              </div>

              {/* Benefit banner — prominent */}
              {hasBenefit && (
                <div className="mt-3">
                  <BenefitBanner benefitClp={product.expected_benefit_clp!} currency={currency} />
                </div>
              )}

              {/* Top reason always visible */}
              {topPositiveReason && (
                <div className="mt-2">
                  <TopReason reason={topPositiveReason} />
                </div>
              )}

              {/* Expand / Collapse more reasons + CTAs */}
              <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                {product.reasons.length > 1 ? (
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Info className="h-3.5 w-3.5" />
                    {expanded
                      ? "Ocultar detalles"
                      : `Ver ${product.reasons.length - 1} ${
                          product.reasons.length - 1 > 1 ? "razones" : "razón"
                        } más`}
                    {expanded ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-2">
                  <a
                    href={product.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Ver en {product.institution}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  {isAuthenticated && product.eligibility !== "not_eligible" && (
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1.5 rounded-lg"
                      onClick={() => setLeadOpen(true)}
                    >
                      <Send className="h-3 w-3" />
                      Solicitar
                    </Button>
                  )}
                </div>
              </div>

              {/* Remaining reasons */}
              {expanded && remainingReasons.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {remainingReasons.map((r, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-start gap-2 text-xs rounded-lg px-3 py-2",
                        r.weight > 0
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
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
            </div>
          </div>
        </CardContent>
      </Card>
      <LeadCaptureDialog product={product} open={leadOpen} onOpenChange={setLeadOpen} />
    </>
  );
}

function EmptyCategory() {
  return (
    <div className="text-center py-16 text-muted-foreground space-y-2">
      <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p className="text-sm font-medium">No hay productos en esta categoría</p>
      <p className="text-xs max-w-xs mx-auto">
        Prueba otra categoría o explora "Todos" para ver el catálogo completo.
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────

export default function Products() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { currency } = useCurrency();
  const { setOpen: openUploadDrawer } = useUploadDrawer();

  // Read ?tab= param from URL (e.g. from dashboard ActionCards)
  const initialTab = (() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab && (tab === "all" || tab in PRODUCT_CATEGORIES)) return tab as TabKey;
    return "all" as TabKey;
  })();
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // Fetch financial profile data (best-effort, used for ranking)
  const { data: financialSummary } = useQuery({
    queryKey: ["financial-summary"],
    queryFn: () => {
      const token = getPersonalToken();
      if (!token && !hasPersonalSession()) return null;
      return apiFetch("/api/financial-summary");
    },
    enabled: isAuthenticated && !authLoading,
    staleTime: 30_000,
  });

  const { data: creditScoreData } = useQuery({
    queryKey: ["/api/credit-score"],
    queryFn: () => {
      const token = getPersonalToken();
      if (!token && !hasPersonalSession()) return null;
      return apiFetch("/api/credit-score");
    },
    enabled: isAuthenticated && !authLoading,
    staleTime: 60_000,
  });

  const { data: transactionalData } = useQuery({
    queryKey: ["/api/transactional-score"],
    queryFn: () => {
      const token = getPersonalToken();
      if (!token && !hasPersonalSession()) return null;
      return apiFetch("/api/transactional-score");
    },
    enabled: isAuthenticated && !authLoading,
    staleTime: 60_000,
  });

  // Catálogo único desde la DB (financial_products). Reemplaza el import estático de
  // products.seed.json: así el `id` es el real de la tabla, requisito para que "aplicar"
  // funcione (antes el slug hacía Number(slug)=NaN). Público, no requiere sesión.
  const { data: apiProducts } = useQuery({
    queryKey: ["/api/financial-products"],
    queryFn: () => apiFetch("/api/financial-products"),
    staleTime: 5 * 60_000,
  });

  const products: Product[] = useMemo(
    () => (Array.isArray(apiProducts) ? apiProducts.map(mapApiProductToProduct) : []),
    [apiProducts],
  );

  // Build user profile
  const profile = useMemo(() => {
    if (!isAuthenticated) return emptyProfile;
    return buildProfile(
      financialSummary ?? null,
      creditScoreData ?? null,
      transactionalData ?? null,
    );
  }, [isAuthenticated, financialSummary, creditScoreData, transactionalData]);

  // Rank products for the active tab
  const rankedProducts: RankedProduct[] = useMemo(() => {
    return rankProductsByCategory(products, activeTab, profile);
  }, [products, activeTab, profile]);

  // Compatibles = todo lo que se lista (elegibles + posibles); "elegibles" a secas
  // daba 0 aunque abajo hubiera varias tarjetas "Posible" → copy contradictoria.
  const compatibleCount = rankedProducts.filter((p) => p.eligibility !== "not_eligible").length;
  const hasProfile = profile.has_real_data;
  // Tiene perfil por cartola (ingresos) pero aún no hay score crediticio (falta CMF):
  // el ranking de crédito se calcula sin la señal de deuda. Avisamos sin bloquear.
  const isMissingCreditScore = isAuthenticated && hasProfile && profile.credit_score === null;

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
                Inicia sesión para ver qué productos se adaptan a tu perfil real de ingresos y
                score.
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
                ? `Ranking personalizado · ${compatibleCount} ${
                    compatibleCount === 1 ? "producto compatible" : "productos compatibles"
                  } con tu perfil`
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

        {/* CMF-awareness: tiene perfil por cartola pero falta el informe CMF/score crediticio */}
        {isMissingCreditScore && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-sm text-foreground">
                Estas recomendaciones usan tus movimientos bancarios. Para recomendaciones de
                crédito más precisas, sube tu informe CMF y calculamos tu score crediticio.
              </p>
            </div>
            <Button size="sm" className="shrink-0 gap-1.5" onClick={() => openUploadDrawer(true)}>
              Subir informe CMF
            </Button>
          </div>
        )}

        {/* Category tabs — scrollable on mobile with fade hint */}
        <div className="-mx-4 sm:mx-0 relative">
          <div className="flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-none scroll-smooth sm:flex-wrap sm:overflow-x-visible sm:px-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-medium transition-all shrink-0",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
          {/* Right fade hint — visible only on mobile to signal scrollability */}
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none sm:hidden" />
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
            {rankedProducts.map((product) => (
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
