import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ScoreHeroProps {
  score: number;           // 0-100
  delta: number | null;    // vs previous period
}

/** Large semicircular gauge for the hero score. 0-100 scale. */
function HeroGauge({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  // Arc length: path from (10,70) to (190,70) via semicircle ≈ π × 90 ≈ 283
  const arcLength = 283;
  const dashLength = (pct / 100) * arcLength;

  const color =
    score >= 70
      ? "stroke-emerald-500"
      : score >= 45
        ? "stroke-amber-500"
        : "stroke-rose-500";

  const label =
    score >= 70
      ? "Excelente"
      : score >= 55
        ? "Bueno"
        : score >= 35
          ? "Regular"
          : "Bajo";

  return (
    <div className="relative w-48 h-28 sm:w-56 sm:h-32 mx-auto">
      <svg viewBox="0 0 200 110" className="w-full h-full" fill="none">
        {/* Background arc */}
        <path
          d="M 10 95 A 90 90 0 0 1 190 95"
          stroke="currentColor"
          strokeWidth="12"
          className="text-muted/40"
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d="M 10 95 A 90 90 0 0 1 190 95"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dashLength} ${arcLength}`}
          className={cn("transition-all duration-1000 ease-out", color)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
        <span className="text-[48px] sm:text-[56px] font-bold tabular-nums leading-none text-foreground">
          {score}
        </span>
        <span className="text-xs text-muted-foreground mt-0.5">{label}</span>
      </div>
    </div>
  );
}

export default function ScoreHero({ score, delta }: ScoreHeroProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Score Transaccional
      </p>
      <HeroGauge score={score} />
      {delta !== null && delta !== 0 && (
        <div
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium",
            delta > 0
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
              : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
          )}
        >
          {delta > 0 ? (
            <TrendingUp className="h-3.5 w-3.5" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" />
          )}
          {delta > 0 ? "+" : ""}
          {delta} pts
        </div>
      )}
      {delta === 0 && (
        <div className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium bg-muted text-muted-foreground">
          <Minus className="h-3.5 w-3.5" />
          Sin cambios
        </div>
      )}
    </div>
  );
}
