import { Link } from "wouter";
import { HeartPulse, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";
import { Skeleton } from "@/components/ui/skeleton";
import { useHealthEvaluation, type HealthLevel } from "@/hooks/useHealthEvaluation";

// Misma paleta que el termómetro de components/health/HealthLevelCard.tsx
const NIVEL_STYLE: Record<HealthLevel, { bar: string; chip: string }> = {
  5: {
    bar: "bg-emerald-700",
    chip: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  4: {
    bar: "bg-emerald-600",
    chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  3: {
    bar: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  2: {
    bar: "bg-green-400",
    chip: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  },
  1: {
    bar: "bg-yellow-400",
    chip: "bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400",
  },
  0: {
    bar: "bg-orange-400",
    chip: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  },
  [-1]: { bar: "bg-red-400", chip: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400" },
  [-2]: { bar: "bg-red-700", chip: "bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300" },
};

// La salud financiera es una escala de 8 niveles, de -2 (insolvencia) a +5
// (independencia financiera). El score compuesto 0-100 es solo el insumo interno.
const SCALE_LEVELS: HealthLevel[] = [-2, -1, 0, 1, 2, 3, 4, 5];

function CardChrome({ children }: { children: React.ReactNode }) {
  return (
    <Link href={ROUTES.saludFinanciera} className="block">
      <div className="h-full rounded-2xl border border-border bg-card p-4 space-y-2.5 transition-colors hover:border-primary/30">
        {children}
      </div>
    </Link>
  );
}

function Header({ chip }: { chip?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <HeartPulse className="h-4 w-4 text-muted-foreground shrink-0" />
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Salud Financiera
        </p>
      </div>
      {chip}
    </div>
  );
}

function FooterLink({ label = "Ver análisis completo" }: { label?: string }) {
  return (
    <p className="inline-flex items-center gap-0.5 text-xs font-medium text-primary">
      {label}
      <ChevronRight className="h-3.5 w-3.5" />
    </p>
  );
}

/**
 * Tile compacto del panel con el nivel de salud financiera en su escala real
 * (-2…+5). Toda la card navega a /salud-financiera; el análisis completo,
 * recálculo y CTAs de subida viven en esa página.
 */
export default function HealthSummaryCard() {
  const { data, isLoading, isError } = useHealthEvaluation();

  if (isLoading) {
    return <Skeleton className="h-[132px] rounded-2xl" />;
  }

  // El panel no debe degradarse por un fallo del evaluador de salud.
  if (isError) return null;

  if (!data?.hasData) {
    const missing = data?.missingData;
    const copy =
      missing?.cartola && missing?.cmf
        ? "Sube tu cartola e informe CMF para evaluar tu salud financiera."
        : missing?.cmf
          ? "Falta tu informe CMF para evaluar tu salud financiera."
          : missing?.cartola
            ? "Falta una cartola bancaria para evaluar tu salud financiera."
            : "Necesitamos algunos documentos para evaluar tu salud financiera.";
    return (
      <CardChrome>
        <Header
          chip={
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Pendiente
            </span>
          }
        />
        <p className="text-xs leading-relaxed text-muted-foreground">{copy}</p>
        <FooterLink label="Completar en Salud financiera" />
      </CardChrome>
    );
  }

  const evaluation = data.evaluation;
  if (!evaluation) {
    return (
      <CardChrome>
        <Header
          chip={
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Sin evaluación
            </span>
          }
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          No pudimos calcular tu evaluación. Revísala en Salud financiera.
        </p>
        <FooterLink />
      </CardChrome>
    );
  }

  const { nivel, nivelNombre } = evaluation;
  const style = NIVEL_STYLE[nivel] ?? NIVEL_STYLE[0];
  const markerIdx = SCALE_LEVELS.indexOf(nivel);
  const markerLeft = markerIdx >= 0 ? ((markerIdx + 0.5) / SCALE_LEVELS.length) * 100 : 50;

  return (
    <CardChrome>
      <Header
        chip={
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
              style.chip,
            )}
          >
            Nivel {nivel > 0 ? `+${nivel}` : nivel}
          </span>
        }
      />

      <p className="text-sm font-semibold text-foreground">{nivelNombre}</p>

      {/* Escala real de la salud financiera: -2…+5. La versión compacta marca el
          nivel actual sobre los 8 tramos; el termómetro completo con etiquetas
          vive en /salud-financiera. */}
      <div className="pt-1.5 space-y-1">
        <div className="relative">
          <div className="flex h-2 gap-px overflow-hidden rounded-full">
            {SCALE_LEVELS.map((lvl) => (
              <div
                key={lvl}
                className={cn(
                  "flex-1 transition-opacity",
                  NIVEL_STYLE[lvl].bar,
                  lvl === nivel ? "opacity-100" : "opacity-25",
                )}
              />
            ))}
          </div>
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow"
            style={{ left: `${markerLeft}%` }}
            aria-hidden
          />
        </div>
        <div className="flex justify-between text-[10px] font-medium tabular-nums text-muted-foreground">
          <span>-2</span>
          <span>+5</span>
        </div>
      </div>

      <FooterLink />
    </CardChrome>
  );
}
