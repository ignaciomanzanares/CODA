import { Link } from "wouter";
import { ShieldCheck, HeartPulse, Upload, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import { useUploadDrawer } from "@/contexts/UploadDrawerContext";

/**
 * Reemplaza las DOS cards grises "Pendiente" (score CMF + salud financiera)
 * por UNA card de acción cuando ambas esperan lo mismo: el Informe de Deudas
 * CMF. Dos estados vacíos seguidos deprimen el arranque del panel; uno con
 * CTA claro invita a completarlo.
 */
export default function ScoresPendingCard() {
  const { setOpen: openUploadDrawer } = useUploadDrawer();

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex -space-x-2 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 ring-2 ring-background">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 ring-2 ring-background">
            <HeartPulse className="h-5 w-5 text-primary" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Activa tu score crediticio y tu salud financiera
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground mt-0.5">
            Solo falta tu Informe de Deudas CMF (PDF gratuito desde{" "}
            <a
              href="https://www.cmfchile.cl"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              cmfchile.cl
            </a>
            ). Con él calculamos ambos indicadores.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => openUploadDrawer(true)}>
            <Upload className="h-3.5 w-3.5" />
            Subir informe CMF
          </Button>
          <Link
            href={ROUTES.saludFinanciera}
            className="hidden sm:inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
          >
            Más detalles
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
