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
import { getPersonalToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

export default function DocumentManager({ className }: { className?: string }) {
  const { documents } = useUserDocuments();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const apiBase = (API_URL || "").replace(/\/$/, "");
  const authHeaders = () => ({ Authorization: `Bearer ${getPersonalToken()}` });

  const deleteOne = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        const res = await fetch(`${apiBase}/api/user/documents/${id}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error("delete failed");
        await queryClient.invalidateQueries();
        toast({ title: "Documento eliminado", description: "Puedes volver a subirlo cuando quieras." });
      } catch {
        toast({ title: "No se pudo eliminar", description: "Inténtalo de nuevo.", variant: "destructive" });
      } finally {
        setDeletingId(null);
      }
    },
    [apiBase, queryClient, toast],
  );

  const deleteAll = useCallback(async () => {
    setDeletingAll(true);
    try {
      const res = await fetch(`${apiBase}/api/documents`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("delete all failed");
      await queryClient.invalidateQueries();
      toast({ title: "Documentos eliminados", description: "Tus movimientos quedaron en blanco." });
    } catch {
      toast({ title: "No se pudo eliminar", description: "Inténtalo de nuevo.", variant: "destructive" });
    } finally {
      setDeletingAll(false);
    }
  }, [apiBase, queryClient, toast]);

  if (documents.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Documentos subidos ({documents.length})
        </p>
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
      </div>

      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
        {documents.map((doc) => {
          const periodo = doc.periodoDesde
            ? `${doc.periodoDesde}${doc.periodoHasta ? ` → ${doc.periodoHasta}` : ""}`
            : new Date(doc.uploadedAt).toLocaleDateString("es-CL");
          const label = doc.tipo === "cartola" ? (doc.banco ?? "Cartola") : "Informe CMF";
          return (
            <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-medium">{label}</p>
                <p className="truncate text-[11px] text-muted-foreground">{periodo}</p>
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
