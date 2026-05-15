import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { useLocation } from "wouter";
import { useUploadDrawer } from "@/contexts/UploadDrawerContext";
import { CheckCircle2, Circle, Upload, FileText, HeartPulse, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface HealthResponse {
  hasData: boolean;
  missingData?: { cartola: boolean; cmf: boolean };
}

interface Step {
  id: string;
  label: string;
  description: string;
  done: boolean;
  action?: () => void;
  actionLabel?: string;
  icon: React.ElementType;
}

export default function OnboardingChecklist() {
  const { apiRequest } = useApi();
  const { openWithFilePicker } = useUploadDrawer();
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem("onboarding-dismissed") === "1"
  );

  const { data } = useQuery<HealthResponse>({
    queryKey: ["health-evaluation"],
    queryFn: () => apiRequest<HealthResponse>("GET", "/api/health-evaluation/me"),
    staleTime: 60_000,
    retry: 1,
  });

  if (dismissed) return null;

  const missing = data?.missingData;
  const hasCartola = missing ? !missing.cartola : false;
  const hasCmf = missing ? !missing.cmf : false;
  const hasSaludFinanciera = data?.hasData ?? false;

  // Hide once everything is done
  if (hasCartola && hasCmf && hasSaludFinanciera) return null;
  // Also hide while loading (data is undefined)
  if (!data) return null;

  const steps: Step[] = [
    {
      id: "cartola",
      label: "Sube tu cartola bancaria",
      description: "Extraemos tus ingresos y gastos para analizar tu flujo.",
      done: hasCartola,
      icon: Upload,
      action: () => openWithFilePicker(),
      actionLabel: "Subir cartola",
    },
    {
      id: "cmf",
      label: "Sube tu informe CMF",
      description: "Descárgalo gratis en cmfchile.cl — muestra tus deudas vigentes.",
      done: hasCmf,
      icon: FileText,
      action: () => openWithFilePicker(),
      actionLabel: "Subir CMF",
    },
    {
      id: "salud",
      label: "Revisa tu salud financiera",
      description: "Con ambos documentos calculamos tu diagnóstico completo.",
      done: hasSaludFinanciera,
      icon: HeartPulse,
      action: () => navigate("/salud-financiera"),
      actionLabel: "Ver diagnóstico",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  const dismiss = () => {
    localStorage.setItem("onboarding-dismissed", "1");
    setDismissed(true);
  };

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Configura tu perfil financiero
          </p>
          <p className="text-xs text-muted-foreground">
            {doneCount}/{steps.length} pasos completados
          </p>
        </div>
        <button
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step) => {
          const Icon = step.icon;
          const isNext = !step.done && steps.findIndex((s) => !s.done) === steps.indexOf(step);
          return (
            <div
              key={step.id}
              className={cn(
                "flex items-start gap-3 rounded-xl p-3 transition-colors",
                step.done && "opacity-60",
                isNext && "bg-background border border-border shadow-sm"
              )}
            >
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <Circle className={cn("h-5 w-5 shrink-0 mt-0.5", isNext ? "text-primary" : "text-muted-foreground/40")} />
              )}
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium", step.done ? "line-through text-muted-foreground" : "text-foreground")}>
                  {step.label}
                </p>
                {!step.done && (
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                )}
              </div>
              {isNext && step.action && (
                <button
                  onClick={step.action}
                  className="shrink-0 text-xs font-medium text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
                >
                  {step.actionLabel} →
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
