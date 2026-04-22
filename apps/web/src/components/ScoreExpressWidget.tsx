/**
 * ScoreExpressWidget
 *
 * A client-side-only teaser score calculator for the landing page.
 * Uses 3 sliders (ingresos, gastos, deuda) to compute a mock CODA
 * transactional score. No data leaves the browser.
 *
 * Purpose: demonstrate the product concept, drive sign-up conversions.
 */

import { useState, useMemo } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";
import { ArrowRight, Info, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Analytics } from "@/lib/analytics";

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

  const score = useMemo(
    () => computeExpressScore({ income, expenses, debt }),
    [income, expenses, debt]
  );
  const { text, color } = scoreLabel(score);

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
            situación financiera. Es solo una estimación — el score real usa
            tus datos bancarios reales.
          </p>
        </div>

        {/* Widget card */}
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 md:p-10">
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
            <div className="flex flex-col items-center gap-6">
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

              <div className="w-full space-y-3">
                <Link href={ROUTES.registro}>
                  <Button
                    className="w-full bg-blue-500 hover:bg-blue-400 text-white font-semibold h-11"
                    onClick={() => Analytics.signupStarted()}
                  >
                    Obtén tu score real
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <p className="text-center text-[11px] text-slate-500 flex items-center justify-center gap-1">
                  <Lock className="h-3 w-3" />
                  Este cálculo nunca sale de tu navegador
                </p>
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="mt-8 pt-6 border-t border-white/10 flex items-start gap-2">
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
