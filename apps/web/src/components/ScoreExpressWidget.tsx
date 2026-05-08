/**
 * ScoreExpressWidget
 *
 * A client-side-only teaser score calculator for the landing page.
 * Uses 3 sliders (ingresos, gastos, deuda) to compute a mock CODA
 * transactional score, then shows 3 personalized product recommendations
 * from the real marketplace. No data leaves the browser.
 *
 * Purpose: demonstrate the product concept, drive sign-up conversions.
 */

import { useState, useMemo } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";
import {
  ArrowRight,
  Info,
  Lock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Analytics } from "@/lib/analytics";

// Ranking engine + product data
import seedProducts from "@/data/products.seed.json";
import { rankProducts } from "@/lib/product-ranking";
import type { Product, UserFinancialProfile, RankedProduct } from "@/types/products";

// ──────────────────────────────────────────────────────────────
// Score engine (toy model — not the real CODA algorithm)
// ──────────────────────────────────────────────────────────────

interface ExpressInput {
  income: number;       // monthly income CLP
  expenses: number;     // monthly expenses CLP
  debt: number;         // monthly debt payment CLP
}

function computeExpressScore(input: ExpressInput): number {
  const { income, expenses, debt } = input;
  if (income <= 0) return 0;

  // Savings rate: 0–40 pts
  const savingsRate = Math.max(0, (income - expenses) / income);
  const savingsPts = Math.round(savingsRate * 40);

  // Debt-to-income ratio: 0–35 pts (lower debt = more pts)
  const dti = debt / income;
  const dtiPts = Math.round(Math.max(0, 1 - dti / 0.5) * 35);

  // Income tier: 0–25 pts
  const incomeMillions = income / 1_000_000;
  const incomePts = Math.round(Math.min(25, incomeMillions * 10));

  return Math.min(100, savingsPts + dtiPts + incomePts);
}

function scoreLabel(score: number): { text: string; color: string; ring: string } {
  if (score >= 75) return { text: "Excelente", color: "text-emerald-400", ring: "stroke-emerald-400" };
  if (score >= 55) return { text: "Bueno", color: "text-blue-400", ring: "stroke-blue-400" };
  if (score >= 35) return { text: "Regular", color: "text-amber-400", ring: "stroke-amber-400" };
  return { text: "Bajo", color: "text-red-400", ring: "stroke-red-400" };
}

/** Build a synthetic UserFinancialProfile from slider inputs */
function buildExpressProfile(input: ExpressInput, score: number): UserFinancialProfile {
  const savings = Math.max(0, input.income - input.expenses);
  // Map express score (0-100) to an approximate CMF score (300-850)
  const approxCreditScore = Math.round(300 + (score / 100) * 550);
  return {
    monthly_income_clp: input.income,
    credit_score: approxCreditScore,
    transactional_score: score,
    monthly_debt_clp: input.debt > 0 ? input.debt : null,
    monthly_savings_clp: savings > 0 ? savings : null,
    age: null,
    has_real_data: false,
  };
}

// ──────────────────────────────────────────────────────────────
// Slider component
// ──────────────────────────────────────────────────────────────

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  formatValue: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-baseline">
        <label className="text-sm font-medium text-slate-200">{label}</label>
        <span className="text-sm font-semibold tabular-nums text-white">
          {formatValue(value)}
        </span>
      </div>
      <div className="relative h-2">
        <div className="absolute inset-0 rounded-full bg-white/10" />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-blue-400"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label={label}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Gauge
// ──────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const { color, ring } = scoreLabel(score);
  const r = 42;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="relative flex flex-col items-center justify-center">
      <svg viewBox="0 0 100 100" className="w-36 h-36 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-white/10" />
        <circle
          cx="50" cy="50" r={r}
          fill="none" strokeWidth="9"
          strokeLinecap="round"
          className={cn("transition-all duration-700", ring)}
          strokeDasharray={`${dash} ${circ}`}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn("text-4xl font-bold tabular-nums leading-none", color)}>
          {score}
        </span>
        <span className="text-xs text-slate-400 mt-1">/ 100</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Product recommendation card (compact, landing-style)
// ──────────────────────────────────────────────────────────────

function RecommendedProductCard({ product, rank }: { product: RankedProduct; rank: number }) {
  const isEligible = product.eligibility === "eligible";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/[0.08]">
      {/* Rank number */}
      <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
        <span className="text-sm font-bold text-blue-400">#{rank}</span>
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{product.name}</p>
        <p className="text-xs text-slate-400 truncate">{product.institution}</p>
      </div>
      {/* Match + eligibility */}
      <div className="flex items-center gap-2 shrink-0">
        {isEligible && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="h-3 w-3" />
            Elegible
          </span>
        )}
        <div className="w-10 h-10 rounded-lg bg-white/10 flex flex-col items-center justify-center">
          <span className="text-xs font-bold text-white leading-none">{product.score}</span>
          <span className="text-[8px] text-slate-500 leading-none mt-0.5">match</span>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main widget
// ──────────────────────────────────────────────────────────────

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export default function ScoreExpressWidget() {
  const [income, setIncome] = useState(800_000);
  const [expenses, setExpenses] = useState(500_000);
  const [debt, setDebt] = useState(100_000);
  const [showProducts, setShowProducts] = useState(false);

  const score = useMemo(
    () => computeExpressScore({ income, expenses, debt }),
    [income, expenses, debt]
  );
  const { text, color } = scoreLabel(score);

  // Rank products using the real engine with a synthetic profile
  const topProducts = useMemo(() => {
    const profile = buildExpressProfile({ income, expenses, debt }, score);
    const ranked = rankProducts(seedProducts as Product[], profile);
    // Pick the top 3 eligible products (or top 3 overall if none eligible)
    const eligible = ranked.filter(p => p.eligibility === "eligible");
    return (eligible.length >= 3 ? eligible : ranked).slice(0, 3);
  }, [income, expenses, debt, score]);

  return (
    <section className="py-24 bg-[#0a0f1e]">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Heading */}
        <div className="text-center mb-12">
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-blue-400 mb-3">
            Pruébalo ahora
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            ¿Cuál sería tu Score Express?
          </h2>
          <p className="text-slate-400 max-w-lg mx-auto">
            Ajusta los sliders y ve cómo un motor de scoring evalúa tu
            situación financiera — más las recomendaciones que recibirías.
          </p>
        </div>

        {/* Widget card */}
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 sm:p-8 md:p-10">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            {/* Sliders */}
            <div className="space-y-8">
              <Slider
                label="Ingresos mensuales"
                value={income}
                min={200_000}
                max={5_000_000}
                step={50_000}
                onChange={setIncome}
                formatValue={v => CLP.format(v)}
              />
              <Slider
                label="Gastos mensuales"
                value={expenses}
                min={100_000}
                max={income}
                step={50_000}
                onChange={v => setExpenses(Math.min(v, income))}
                formatValue={v => CLP.format(v)}
              />
              <Slider
                label="Deuda mensual (cuotas)"
                value={debt}
                min={0}
                max={Math.round(income * 0.6)}
                step={10_000}
                onChange={setDebt}
                formatValue={v => v === 0 ? "Sin deuda" : CLP.format(v)}
              />
            </div>

            {/* Score display */}
            <div className="flex flex-col items-center gap-5">
              <ScoreGauge score={score} />

              <div className="text-center">
                <p className={cn("text-2xl font-bold", color)}>{text}</p>
                <p className="text-sm text-slate-400 mt-1">
                  Tasa de ahorro:{" "}
                  <span className="font-semibold text-slate-200">
                    {income > 0
                      ? `${Math.max(0, Math.round(((income - expenses) / income) * 100))}%`
                      : "—"}
                  </span>
                </p>
              </div>

              {/* Toggle products */}
              <button
                onClick={() => setShowProducts(v => !v)}
                className="flex items-center gap-2 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
              >
                <Store className="h-4 w-4" />
                {showProducts ? "Ocultar productos" : "Ver productos recomendados"}
                {showProducts ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Product recommendations */}
          {showProducts && (
            <div className="mt-8 pt-8 border-t border-white/10 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Productos para tu perfil
                  </h3>
                  <p className="text-sm text-slate-400 mt-0.5">
                    Basado en tus ingresos, ahorro y nivel de deuda
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-500 bg-white/5 px-2.5 py-1 rounded-full hidden sm:block">
                  {topProducts.filter(p => p.eligibility === "eligible").length} elegibles
                </span>
              </div>

              <div className="space-y-2.5">
                {topProducts.map((product, i) => (
                  <RecommendedProductCard key={product.id} product={product} rank={i + 1} />
                ))}
              </div>

              {/* Blurred teaser row */}
              <div className="relative">
                <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 blur-[3px] select-none" aria-hidden="true">
                  <div className="w-8 h-8 rounded-lg bg-white/10 shrink-0" />
                  <div className="flex-1">
                    <div className="h-3 w-32 bg-white/10 rounded" />
                    <div className="h-2 w-20 bg-white/5 rounded mt-2" />
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-white/10" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-medium text-slate-400 bg-[#0a0f1e]/80 px-3 py-1.5 rounded-full backdrop-blur-sm">
                    +50 productos con tu score real
                  </span>
                </div>
              </div>

              <Link href={ROUTES.registro}>
                <Button
                  className="w-full bg-blue-500 hover:bg-blue-400 text-white font-semibold h-11 mt-2"
                  onClick={() => Analytics.signupStarted()}
                >
                  Crear cuenta gratis y ver todos
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          )}

          {/* CTA when products hidden */}
          {!showProducts && (
            <div className="mt-8 pt-6 border-t border-white/10">
              <div className="flex flex-col sm:flex-row gap-3 items-center">
                <Link href={ROUTES.registro} className="w-full sm:flex-1">
                  <Button
                    className="w-full bg-blue-500 hover:bg-blue-400 text-white font-semibold h-11"
                    onClick={() => Analytics.signupStarted()}
                  >
                    Obtén tu score real
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <p className="text-center text-[11px] text-slate-500 flex items-center justify-center gap-1 sm:w-auto">
                  <Lock className="h-3 w-3" />
                  Este cálculo nunca sale de tu navegador
                </p>
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="mt-6 pt-6 border-t border-white/10 flex items-start gap-2">
            <Info className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Este es un estimador ilustrativo. El Score Transaccional CODA real se calcula a partir
              de tus movimientos bancarios procesados con metodología propia y no constituye un
              score CMF ni garantiza resultados en evaluaciones crediticias.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
