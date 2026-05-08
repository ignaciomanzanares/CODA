import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PWAInstallBanner() {
  const { canInstall, install, dismiss } = usePWAInstall();

  if (!canInstall) return null;

  return (
    <div className="bg-primary/5 dark:bg-primary/10 border-b border-primary/20 px-4 py-2.5 safe-x">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Download className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Instala CODA</p>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Acceso directo desde tu pantalla de inicio, más rápido y sin navegador
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 rounded-lg"
            onClick={() => void install()}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Instalar</span>
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
    </div>
  );
}
