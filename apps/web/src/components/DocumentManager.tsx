/**
 * DocumentManager — lista de documentos subidos (cartolas / informes CMF) con
 * borrado por ítem y un "Borrar todo" con confirmación. Tras borrar invalida
 * todas las queries (movimientos, score, flujo) para refrescar la UI.
 *
 * Se usa en Movimientos y dentro del UniversalUploadDrawer (misma lógica, un
 * solo lugar). Si no hay documentos, no renderiza nada.
 */
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUserDocuments } from "@/hooks/useUserDocuments";
import { API_URL } from "@/lib/api";
import { assertBrowserOnline } from "@/lib/networkStatus";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

type DocumentManagerProps = {
  className?: string;
  documentType?: "all" | "cartola";
  showDeleteAll?: boolean;
  showEmptyState?: boolean;
  /** Cuando va embebido en un contenedor ya scrolleable (p. ej. el drawer de subida),
   *  desactiva el scroll interno propio para evitar doble scrollbar. */
  flat?: boolean;
};

function productLabel(doc: { tipo: string; banco: string | null }) {
  if (doc.tipo !== "cartola") return "Informe CMF";
  const banco = doc.banco ?? "Cartola";
  if (/tarjeta\s+(nacional|internacional)/i.test(banco)) return `${banco} · Tarjeta crédito`;
  return `${banco} · Cuenta corriente`;
}

function statusLabel(status?: string | null) {
  if (!status) return "legacy";
  if (status === "success") return "normalizada";
  if (status === "failed") return "fallida";
  if (status === "pending") return "pendiente";
  return status;
}

function statusClass(status?: string | null) {
  if (status === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300";
  if (status === "pending") return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300";
  return "border-border bg-muted text-muted-foreground";
}

export default function DocumentManager({
  className,
  documentType = "all",
  showDeleteAll = true,
  showEmptyState = false,
  flat = false,
}: DocumentManagerProps) {
  const { documents: allDocuments, isLoading } = useUserDocuments();
  const documents = documentType === "cartola"
    ? allDocuments.filter((doc) => doc.tipo === "cartola")
    : allDocuments;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const apiBase = (API_URL || "").replace(/\/$/, "");
  const deleteOne = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        assertBrowserOnline();
        const res = await fetch(`${apiBase}/api/user/documents/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("delete failed");
        await queryClient.invalidateQueries();
        toast({ title: "Documento eliminado", description: "Puedes volver a subirlo cuando quieras." });
      } catch (error) {
        const description = error instanceof Error ? error.message : "Inténtalo de nuevo.";
        toast({ title: "No se pudo eliminar", description, variant: "destructive" });
      } finally {
        setDeletingId(null);
      }
    },
    [apiBase, queryClient, toast],
  );

  const deleteAll = useCallback(async () => {
    setDeletingAll(true);
    try {
      assertBrowserOnline();
      const res = await fetch(`${apiBase}/api/documents`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("delete all failed");
      await queryClient.invalidateQueries();
      toast({ title: "Documentos eliminados", description: "Tus movimientos quedaron en blanco." });
    } catch (error) {
      const description = error instanceof Error ? error.message : "Inténtalo de nuevo.";
      toast({ title: "No se pudo eliminar", description, variant: "destructive" });
    } finally {
      setDeletingAll(false);
    }
  }, [apiBase, queryClient, toast]);

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando documentos...
      </div>
    );
  }

  if (documents.length === 0) {
    if (!showEmptyState) return null;
    return (
      <div className={cn("rounded-lg border border-dashed border-border p-6 text-center", className)}>
        <FileText className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
        <p className="text-sm font-medium">No hay cartolas para borrar</p>
        <p className="text-xs text-muted-foreground">Sube una cartola y aparecerá en esta lista.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {documentType === "cartola" ? "Cartolas subidas" : "Documentos subidos"} ({documents.length})
        </p>
        {showDeleteAll && (
          <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-red-600 hover:text-red-700" disabled={deletingAll}>
              {deletingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Borrar todo
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Borrar todos los documentos?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminarán tus {documents.length} documento{documents.length !== 1 ? "s" : ""} y los movimientos
                derivados de ellos. Esta acción no se puede deshacer, pero puedes volver a subirlos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={deleteAll} className="bg-red-600 hover:bg-red-700">
                Sí, borrar todo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className={cn("space-y-1.5 pr-1", !flat && "max-h-[60vh] overflow-y-auto")}>
        {documents.map((doc) => {
          const periodo = doc.periodoDesde
            ? `${doc.periodoDesde}${doc.periodoHasta ? ` → ${doc.periodoHasta}` : ""}`
            : new Date(doc.uploadedAt).toLocaleDateString("es-CL");
          const label = productLabel(doc);
          const subida = new Date(doc.uploadedAt).toLocaleDateString("es-CL");
          const movimientos =
            typeof doc.movementCount === "number"
              ? `${doc.movementCount} movimiento${doc.movementCount === 1 ? "" : "s"}`
              : null;
          const meta = [periodo, movimientos, `subida ${subida}`].filter(Boolean).join(" · ");
          return (
            <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-xs font-medium">{label}</p>
                  {doc.tipo === "cartola" && (
                    <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px] font-medium", statusClass(doc.normalizationStatus))}>
                      {statusLabel(doc.normalizationStatus)}
                    </Badge>
                  )}
                  {doc.reviewStatus === "required" && (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                      Revisión recomendada
                    </Badge>
                  )}
                  {doc.reviewStatus === "reviewed" && (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                      Revisado
                    </Badge>
                  )}
                </div>
                <p className="truncate text-[11px] text-muted-foreground">{meta}</p>
                {doc.tipo === "cartola" && doc.normalizationStatus === "failed" && (
                  <p className="mt-1 text-[11px] leading-snug text-red-600 dark:text-red-400">
                    No pudimos extraer los movimientos de este documento. Elimínalo e intenta subir un PDF
                    digital descargado directamente desde tu banco (evita fotos o escaneos de la cartola).
                  </p>
                )}
              </div>
              <button
                onClick={() => deleteOne(doc.id)}
                disabled={deletingId === doc.id}
                className="text-muted-foreground hover:text-red-600 disabled:opacity-50 shrink-0"
                aria-label="Eliminar documento"
                title="Eliminar documento"
              >
                {deletingId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
