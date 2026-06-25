// ─── Score Breakdown ──────────────────────────────────────────────────────────
// Expandable section below the score hero that shows:
// 1. Key metric highlights from the scoring engine
// 2. Actionable tips linked to specific improvements
// 3. Links to marketplace products that can help

import { useState } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Lightbulb,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  Banknote,
} from "lucide-react";

interface ScoreBreakdownProps {
  score: number;
  insights: string[];
  creditScore: number | null;
  totalIncome: number;
  totalExpenses: number;
  savingsNet: number;
  savingsRate: number;
  scoreConfidence: "baja" | "media" | "alta" | null;
  scoreObservedMonths: number | null;
}

// ── Determine quick-win tips based on score range ─────────────────────────────

interface QuickTip {
  icon: React.ElementType;
  text: string;
  href?: string;
  ctaLabel?: string;
}

function getQuickTips(
  score: number,
  creditScore: number | null,
  totalIncome: number,
  totalExpenses: number,
  savingsNet: number,
  savingsRate: number,
  scoreConfidence: "baja" | "media" | "alta" | null,
): QuickTip[] {
  const tips: QuickTip[] = [];
  const hasDeficit = totalIncome > 0 && savingsNet < 0;
  const expenseRatio = totalIncome > 0 ? Math.round((totalExpenses / totalIncome) * 100) : 0;

  if (hasDeficit) {
    tips.push({
      icon: AlertTriangle,
      text: `Tus egresos equivalen al ${expenseRatio}% de tus ingresos. Prioriza cerrar el deficit antes de invertir excedentes.`,
      href: "/movimientos",
      ctaLabel: "Revisar gastos",
    });
    tips.push({
      icon: Banknote,
      text: "Revisa las categorias que mas pesan y separa transferencias, pagos de tarjeta y gastos recurrentes.",
      href: "/movimientos",
      ctaLabel: "Ver movimientos",
    });
    if (scoreConfidence === "baja" || scoreConfidence === "media") {
      tips.push({
        icon: ShieldCheck,
        text: "Sube mas meses de cartolas para aumentar la confianza del score y distinguir tendencias de meses puntuales.",
      });
    } else if (creditScore === null) {
      tips.push({
        icon: ShieldCheck,
        text: "Sube tu informe CMF para sumar contexto crediticio real, separado del score transaccional.",
      });
    }
    return tips;
  }

  if (score < 35) {
    tips.push({
      icon: AlertTriangle,
      text: "Prioriza mantener un saldo mínimo en tu cuenta para evitar días en saldo crítico.",
      href: "/productos?tab=cuentas_ahorro",
      ctaLabel: "Ver cuentas",
    });
    tips.push({
      icon: Banknote,
      text: "Revisa gastos recurrentes que puedas reducir o eliminar.",
      href: "/movimientos",
      ctaLabel: "Ver gastos",
    });
  } else if (score < 55) {
    tips.push({
      icon: TrendingUp,
      text: "Automatizar un ahorro fijo mensual mejoraría tu tendencia de ahorro.",
      href: "/productos?tab=depositos_plazo",
      ctaLabel: "Ver depósitos",
    });
    tips.push({
      icon: ShieldCheck,
      text: "Construir un fondo de emergencia de 3 meses de gastos sube tu score significativamente.",
      href: "/metas",
      ctaLabel: "Crear meta",
    });
  } else if (score < 70) {
    if (savingsNet > 0 && savingsRate >= 10) {
      tips.push({
        icon: TrendingUp,
        text: "Tienes ahorro positivo en el periodo. Un APV puede maximizar excedentes con beneficios tributarios.",
        href: "/productos?tab=apv",
        ctaLabel: "Ver APV",
      });
    } else {
      tips.push({
        icon: TrendingUp,
        text: "Tu score es bueno, pero aun puede mejorar con ahorro positivo y gastos mas estables.",
        href: "/movimientos",
        ctaLabel: "Revisar flujo",
      });
    }
    if (creditScore === null) {
      tips.push({
        icon: ShieldCheck,
        text: "Sube tu informe CMF para desbloquear recomendaciones de crédito personalizadas.",
      });
    }
  } else {
    tips.push({
      icon: ShieldCheck,
      text: "Perfil excelente. Puedes acceder a los mejores productos del mercado.",
      href: "/productos",
      ctaLabel: "Ver productos",
    });
    tips.push({
      icon: TrendingUp,
      text: "Considera diversificar con fondos mutuos o inversiones para rentabilizar tus excedentes.",
      href: "/productos?tab=fondos_mutuos",
      ctaLabel: "Ver fondos",
    });
  }

  return tips;
}

// ── Score label helper ────────────────────────────────────────────────────────

function scoreLabel(score: number): { label: string; colorClass: string } {
  if (score >= 70) return { label: "Excelente", colorClass: "text-emerald-600 dark:text-emerald-400" };
  if (score >= 55) return { label: "Bueno", colorClass: "text-blue-600 dark:text-blue-400" };
  if (score >= 35) return { label: "Regular", colorClass: "text-amber-600 dark:text-amber-400" };
  return { label: "Bajo", colorClass: "text-red-600 dark:text-red-400" };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScoreBreakdown({
  score,
  insights,
  creditScore,
  totalIncome,
  totalExpenses,
  savingsNet,
  savingsRate,
  scoreConfidence,
  scoreObservedMonths,
}: ScoreBreakdownProps) {
  const [expanded, setExpanded] = useState(false);
  const [, navigate] = useLocation();

  const tips = getQuickTips(
    score,
    creditScore,
    totalIncome,
    totalExpenses,
    savingsNet,
    savingsRate,
    scoreConfidence,
  );
  const { label, colorClass } = scoreLabel(score);

  // Score progress bar segments (visual breakdown)
  const ranges = [
    { label: "Bajo", min: 0, max: 35, color: "bg-red-400" },
    { label: "Regular", min: 35, max: 55, color: "bg-amber-400" },
    { label: "Bueno", min: 55, max: 70, color: "bg-blue-400" },
    { label: "Excelente", min: 70, max: 100, color: "bg-emerald-400" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left p-4 flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              ¿Cómo mejorar tu score?
            </p>
            {!expanded && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Tu score es <span className={colorClass}>{label}</span> — {tips.length} oportunidades de mejora
              </p>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 space-y-4 border-t border-border pt-3">

            {/* Score scale visualization */}
            <div className="space-y-1.5">
              <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                {ranges.map((r) => (
                  <div
                    key={r.label}
                    className={cn(
                      "flex-1 rounded-full transition-opacity",
                      r.color,
                      score >= r.min && score <= r.max ? "opacity-100" : "opacity-20",
                    )}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                {ranges.map((r) => (
                  <span
                    key={r.label}
                    className={cn(
                      "text-center flex-1",
                      score >= r.min && score <= r.max && "font-semibold text-foreground",
                    )}
                  >
                    {r.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Quick tips */}
	            <div className="space-y-2">
	              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
	                Próximos pasos
	              </p>
              {tips.map((tip, i) => {
                const Icon = tip.icon;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 rounded-xl bg-muted/50 p-3"
                  >
                    <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground leading-relaxed">{tip.text}</p>
                      {tip.href && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(tip.href!);
                          }}
                          className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                        >
                          {tip.ctaLabel ?? "Ver más"}
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
	            </div>

	            {scoreConfidence && (
	              <div className="rounded-xl border border-border bg-background/60 p-3">
	                <p className="text-xs font-semibold text-foreground">
	                  Confianza {scoreConfidence}
	                </p>
	                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
	                  {scoreObservedMonths != null
	                    ? `El score usa ${scoreObservedMonths} mes(es) con movimientos cargados. Mas historial mejora la precision sin castigar meses que aun no has subido.`
	                    : "Mas historial de cartolas mejora la precision del score transaccional."}
	                </p>
	              </div>
	            )}
                  </div>
                );
              })}
            </div>

            {/* AI insights from backend */}
            {insights.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Análisis de tu cartola
                </p>
                {insights.slice(0, 4).map((text, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground leading-relaxed pl-2 border-l-2 border-border">
                    {text}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
