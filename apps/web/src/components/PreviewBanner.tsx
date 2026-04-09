import { Link } from "wouter";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

export default function PreviewBanner() {
  return (
    <div className="sticky top-16 z-40 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Vista previa</strong> — Estos datos son ilustrativos.
            Sube tus documentos financieros para ver tu diagnóstico real.
          </span>
        </div>
        <Link href={ROUTES.panel}>
          <Button size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-100">
            Subir documentos →
          </Button>
        </Link>
      </div>
    </div>
  );
}
