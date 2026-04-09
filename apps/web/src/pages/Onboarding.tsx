import { useState } from "react";
import { useLocation } from "wouter";
import { ROUTES } from "@/lib/routes";
import { useAuth } from "@/lib/auth";
import ProgressIndicator from "@/components/ProgressIndicator";
import { Button } from "@/components/ui/button";
import DocumentUploadCard from "@/components/DocumentUploadCard";
import { ReportDataProvider, useReportData } from "@/contexts/ReportDataContext";
import { FileText, ArrowRight, Loader2 } from "lucide-react";

function OnboardingInner() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { reportData } = useReportData();

  const [active, setActive] = useState<1 | 2 | 3>(1);
  const hasUploaded = reportData.creditScore != null || reportData.transactionalScore != null;

  const steps = [
    { id: 1, label: "Bienvenida", state: active > 1 ? "done" as const : "active" as const },
    { id: 2, label: "Documentos", state: active === 2 ? "active" as const : active > 2 ? "done" as const : "locked" as const },
    { id: 3, label: "Resultados", state: active === 3 ? "active" as const : "locked" as const },
  ];

  return (
    <div id="onboarding-section" className="mb-12">
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <ProgressIndicator steps={steps as any} onSelect={(id) => setActive(id as any)} />

        {active === 1 && (
          <div className="mt-8 max-w-2xl mx-auto text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
              <FileText className="h-8 w-8 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Bienvenido a CODA</h2>
            <p className="text-gray-600 text-lg leading-relaxed">
              Vamos a analizar tu salud financiera. Para generar tu diagnóstico necesitamos
              tus documentos financieros oficiales: una cartola bancaria y/o un certificado
              de deuda CMF.
            </p>
            <div className="bg-gray-50 rounded-xl p-6 text-left text-sm text-gray-600 space-y-3">
              <p className="font-medium text-gray-800">¿Qué documentos necesitas?</p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">1.</span>
                  <span><strong>Cartola bancaria</strong> — Descárgala desde la app o sitio web de tu banco en formato PDF.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold mt-0.5">2.</span>
                  <span><strong>Informe de Deudas CMF</strong> (opcional pero recomendado) — Obtén tu certificado de deuda consolidada en cmfchile.cl.</span>
                </li>
              </ul>
            </div>
            <div className="flex flex-col items-center gap-3">
              <Button size="lg" className="font-semibold px-8" onClick={() => setActive(2)}>
                Subir documentos
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <button
                className="text-sm text-gray-400 hover:text-gray-600 underline"
                onClick={() => setLocation(ROUTES.panel)}
              >
                Prefiero explorar primero
              </button>
            </div>
          </div>
        )}

        {active === 2 && (
          <div className="mt-8 max-w-2xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-gray-800 text-center">Sube tus documentos</h2>
            <p className="text-gray-600 text-center">
              Carga tu cartola bancaria y/o tu informe de deudas CMF. Tus datos se procesan de forma segura y privada.
            </p>

            <DocumentUploadCard />

            {hasUploaded && (
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="font-medium">Procesando tu diagnóstico...</span>
                </div>
                <Button size="lg" onClick={() => setActive(3)}>
                  Ver resultados
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setActive(1)}>Atrás</Button>
              {!hasUploaded && (
                <button
                  className="text-sm text-gray-400 hover:text-gray-600 underline"
                  onClick={() => setLocation(ROUTES.panel)}
                >
                  Saltar por ahora
                </button>
              )}
            </div>
          </div>
        )}

        {active === 3 && (
          <div className="mt-8 max-w-2xl mx-auto text-center space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">¡Diagnóstico listo!</h2>
            <p className="text-gray-600 text-lg">
              Tu score crediticio y diagnóstico financiero ya están disponibles en tu panel.
            </p>
            <Button size="lg" className="font-semibold px-8" onClick={() => setLocation(ROUTES.panel)}>
              Ir a mi panel
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        )}
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
