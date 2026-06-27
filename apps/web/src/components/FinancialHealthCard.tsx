import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth, getPersonalToken, hasPersonalSession } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  HeartPulse,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Home,
  GraduationCap,
  Briefcase,
  Shield,
  PiggyBank,
  Lightbulb,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProgramEligibility {
  id: string;
  name: string;
  category: "ahorro" | "vivienda" | "educacion" | "empleo" | "proteccion_social";
  description: string;
  eligible: boolean;
  reason: string;
  actionTip: string;
  url: string;
}

interface FinancialHealthData {
  hasData: boolean;
  healthLevel: "critico" | "en_riesgo" | "estable" | "saludable" | null;
  healthLabel: string;
  healthDescription: string;
  programs: ProgramEligibility[];
  savingsTips: string[];
}

const HEALTH_STYLES: Record<string, { bg: string; text: string; ring: string; badge: string }> = {
  critico:      { bg: "bg-red-50 dark:bg-red-950/20",     text: "text-red-700 dark:text-red-400",     ring: "ring-red-200",     badge: "bg-red-100 text-red-700" },
  en_riesgo:    { bg: "bg-amber-50 dark:bg-amber-950/20", text: "text-amber-700 dark:text-amber-400", ring: "ring-amber-200",   badge: "bg-amber-100 text-amber-700" },
  estable:      { bg: "bg-blue-50 dark:bg-blue-950/20",   text: "text-blue-700 dark:text-blue-400",   ring: "ring-blue-200",    badge: "bg-blue-100 text-blue-700" },
  saludable:    { bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-400", ring: "ring-emerald-200", badge: "bg-emerald-100 text-emerald-700" },
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  vivienda: Home,
  educacion: GraduationCap,
  empleo: Briefcase,
  proteccion_social: Shield,
  ahorro: PiggyBank,
};

export default function FinancialHealthCard() {
  const { isAuthenticated } = useAuth();
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery<FinancialHealthData>({
    queryKey: ["/api/financial-health"],
    queryFn: () => {
      const token = getPersonalToken();
      if (!token && !hasPersonalSession()) return Promise.resolve({ hasData: false } as FinancialHealthData);
      return apiFetch("/api/financial-health", { headers: { Authorization: `Bearer ${token}` } });
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }

  if (!data?.hasData || !data.healthLevel) return null;

  const style = HEALTH_STYLES[data.healthLevel] ?? HEALTH_STYLES.estable;
  const eligible = data.programs.filter(p => p.eligible);
  const notEligible = data.programs.filter(p => !p.eligible);
  const visiblePrograms = showAll ? data.programs : eligible.slice(0, 3);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <HeartPulse className="h-5 w-5 text-primary" />
          Salud Financiera
        </CardTitle>
        <CardDescription>
          Evaluación basada en tus datos reales y elegibilidad a programas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Health level badge */}
        <div className={cn("rounded-xl p-4 ring-1", style.bg, style.ring)}>
          <div className="flex items-center gap-2 mb-2">
            <Badge className={cn("font-semibold", style.badge)}>
              {data.healthLabel}
            </Badge>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {data.healthDescription}
          </p>
        </div>

        {/* Savings tips */}
        {data.savingsTips.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5" />
              Consejos de ahorro para tu perfil
            </p>
            <ul className="space-y-2">
              {data.savingsTips.map((tip, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                  <span className="text-muted-foreground leading-relaxed">{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Eligible programs */}
        {visiblePrograms.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {eligible.length > 0
                ? `${eligible.length} programa${eligible.length !== 1 ? "s" : ""} disponible${eligible.length !== 1 ? "s" : ""}`
                : "Programas evaluados"
              }
            </p>
            <div className="space-y-2">
              {visiblePrograms.map(prog => {
                const CategoryIcon = CATEGORY_ICONS[prog.category] ?? Shield;
                return (
                  <div
                    key={prog.id}
                    className={cn(
                      "rounded-lg border p-3 text-sm transition-colors",
                      prog.eligible ? "bg-card hover:bg-muted/50" : "bg-muted/30 opacity-70"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <CategoryIcon className={cn("h-4 w-4 shrink-0 mt-0.5", prog.eligible ? "text-primary" : "text-muted-foreground")} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{prog.name}</span>
                          {prog.eligible ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{prog.reason}</p>
                        {prog.eligible && (
                          <p className="text-xs text-primary mt-1 font-medium">{prog.actionTip}</p>
                        )}
                      </div>
                      <a
                        href={prog.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                        title="Más información"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Toggle for non-eligible */}
        {notEligible.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground gap-1"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? (
              <>Ocultar programas no elegibles <ChevronUp className="h-3.5 w-3.5" /></>
            ) : (
              <>Ver {notEligible.length} programa{notEligible.length !== 1 ? "s" : ""} más <ChevronDown className="h-3.5 w-3.5" /></>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
