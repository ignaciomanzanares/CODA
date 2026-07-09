import { useState } from "react";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Download, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PWAInstallBanner() {
  const { canInstall, installMode, install, dismiss } = usePWAInstall();
  const [showManualGuide, setShowManualGuide] = useState(false);

  if (!canInstall) return null;

  const isManualInstall = installMode === "ios-manual";
  const Icon = isManualInstall ? Share2 : Download;

  return (
    <div className="bg-primary/5 dark:bg-primary/10 border-b border-primary/20 px-4 py-2.5 safe-x">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {isManualInstall ? "Añade CODA a inicio" : "Instala CODA"}
              </p>
              <p className="text-xs text-muted-foreground hidden sm:block">
                {isManualInstall
                  ? "Acceso directo desde tu pantalla de inicio"
                  : "Acceso directo desde tu pantalla de inicio, más rápido y sin navegador"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 rounded-lg"
              aria-label={isManualInstall ? "Ver pasos para instalar CODA" : "Instalar CODA"}
              aria-expanded={isManualInstall ? showManualGuide : undefined}
              onClick={() => {
                if (isManualInstall) {
                  setShowManualGuide((current) => !current);
                  return;
                }
                void install();
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isManualInstall ? "Ver pasos" : "Instalar"}</span>
            </Button>
            <button
              onClick={dismiss}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {isManualInstall && showManualGuide && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-primary/20 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            <Share2 className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span>Toca Compartir y luego Agregar a pantalla de inicio.</span>
          </div>
        )}
      </div>
    </div>
  );
}
