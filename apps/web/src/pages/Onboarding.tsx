import { useState } from "react";
import { useLocation } from "wouter";
import { ROUTES } from "@/lib/routes";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import DocumentUploadCard from "@/components/DocumentUploadCard";
import { ReportDataProvider, useReportData } from "@/contexts/ReportDataContext";
import {
  Upload,
  BarChart3,
  Store,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Sube tu cartola", icon: Upload },
  { id: 2, label: "Ve tu score", icon: BarChart3 },
  { id: 3, label: "Explora productos", icon: Store },
] as const;

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 sm:gap-2 mb-8">
      {STEPS.map((step, idx) => {
        const Icon = step.icon;
        const done = current > step.id;
        const active = current === step.id;
        return (
          <div key={step.id} className="flex items-center">
            {idx > 0 && (
              <div
                className={cn(
                  "w-8 sm:w-12 h-0.5 mx-1 sm:mx-2 transition-colors",
                  done ? "bg-primary" : "bg-border",
                )}
              />
            )}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                  done && "bg-primary text-primary-foreground",
                  active && "bg-primary/10 ring-2 ring-primary text-primary",
                  !done && !active && "bg-muted text-muted-foreground",
                )}
              >
                {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              <span
                className={cn(
                  "text-xs font-medium text-center whitespace-nowrap",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OnboardingInner() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { reportData } = useReportData();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const hasUploaded = reportData.creditScore != null || reportData.transactionalScore != null;

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-8 px-4">
      <div className="w-full max-w-2xl">
        <StepIndicator current={step} />

        <div className="rounded-xl border bg-card shadow-sm p-6 sm:p-8">
          {/* Step 1 — Upload */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Upload className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Sube tu cartola bancaria</h2>
                <p className="text-muted-foreground leading-relaxed max-w-lg mx-auto">
                  Descárgala desde la app o sitio web de tu banco en formato PDF. También puedes
                  subir tu informe de deudas CMF para un diagnóstico más completo.
                </p>
              </div>

              <DocumentUploadCard />

              <div className="flex items-center justify-between pt-2">
                <button
                  className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
                  onClick={() => setLocation(ROUTES.panel)}
                >
                  Prefiero explorar primero
                </button>
                <Button onClick={() => setStep(2)} disabled={!hasUploaded} className="gap-2">
                  Siguiente
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2 — Score */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <BarChart3 className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Tu diagnóstico está listo</h2>
                <p className="text-muted-foreground leading-relaxed max-w-lg mx-auto">
                  Analizamos tus movimientos bancarios con 7 factores para generar tu score
                  transaccional y diagnóstico de salud financiera.
                </p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Score transaccional</p>
                    <p className="text-xs text-muted-foreground">
                      Basado en liquidez, estabilidad de ingresos, gastos fijos, días críticos,
                      ahorro, fondo de emergencia y consistencia.
                    </p>
                  </div>
                </div>
                {reportData.transactionalScore != null && (
                  <div className="flex items-center justify-center">
                    <div className="text-center">
                      <span className="text-4xl font-bold tabular-nums text-primary">
                        {reportData.transactionalScore}
                      </span>
                      <span className="text-sm text-muted-foreground block">/ 100</span>
                    </div>
                  </div>
                )}
                {reportData.creditScore != null && (
                  <div className="flex items-center gap-3 pt-2 border-t">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    <div>
                      <p className="font-medium text-sm">Score crediticio</p>
                      <p className="text-xs text-muted-foreground">
                        {reportData.creditScore} / 850
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Atrás
                </Button>
                <Button onClick={() => setStep(3)} className="gap-2">
                  Explorar productos
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3 — Products */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Store className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Productos recomendados</h2>
                <p className="text-muted-foreground leading-relaxed max-w-lg mx-auto">
                  Según tu perfil financiero, te mostramos los productos y programas más relevantes
                  para ti. Accede al marketplace para comparar opciones.
                </p>
              </div>

              <div className="grid gap-3">
                <button
                  className="rounded-lg border bg-card p-4 text-left hover:bg-muted/50 transition-colors group"
                  onClick={() => setLocation(ROUTES.productos)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Marketplace financiero</p>
                      <p className="text-sm text-muted-foreground">
                        Créditos, cuentas, depósitos a plazo y fondos mutuos — filtrados por tu
                        perfil.
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </button>
                <button
                  className="rounded-lg border bg-card p-4 text-left hover:bg-muted/50 transition-colors group"
                  onClick={() => setLocation(ROUTES.panel)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Panel financiero</p>
                      <p className="text-sm text-muted-foreground">
                        Tu diagnóstico completo, insights y programas disponibles.
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </button>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Atrás
                </Button>
                <Button
                  onClick={() => {
                    localStorage.setItem("coda-onboarding-complete", "1");
                    setLocation(ROUTES.panel);
                  }}
                  className="gap-2"
                >
                  Ir a mi panel
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Onboarding() {
  return (
    <ReportDataProvider>
      <OnboardingInner />
    </ReportDataProvider>
  );
}
