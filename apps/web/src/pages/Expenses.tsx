import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Receipt, Trash, AlertTriangle } from "lucide-react";
import { PastelIcon } from "@/components/ui/pastel-icon";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import SignInBanner from "@/components/SignInBanner";
import ParsedTransactionsTable from "@/components/ParsedTransactionsTable";
import { useToast } from "@/hooks/use-toast";
import { useUploadDrawer } from "@/contexts/UploadDrawerContext";

export default function Expenses() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { openWithFilePicker } = useUploadDrawer();

  const [showLimpiarDialog, setShowLimpiarDialog] = useState(false);
  const [isLimpiando, setIsLimpiando] = useState(false);

  const apiBase = (API_URL || "").replace(/\/$/, "");
  const apiUrl = (path: string) => (apiBase ? `${apiBase}${path}` : path);

  // Trigger file upload from child components (ParsedTransactionsTable "Subir cartola" button)
  useEffect(() => {
    const handleTriggerUpload = () => openWithFilePicker();
    window.addEventListener("trigger-cartola-upload", handleTriggerUpload);
    return () => window.removeEventListener("trigger-cartola-upload", handleTriggerUpload);
  }, [openWithFilePicker]);

  const confirmLimpiarCartolas = async () => {
    setIsLimpiando(true);
    try {
      const res = await fetch(apiUrl("/api/user/cartolas"), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      // Deleting cartolas changes all financial data globally
      queryClient.removeQueries({ queryKey: ["/api/transactions/parsed"] });
      queryClient.removeQueries({ queryKey: ["/api/transactions/insights"] });
      queryClient.invalidateQueries();
      toast({
        title: "Datos eliminados",
        description: "Puedes subir nuevas cartolas cuando quieras.",
      });
    } catch (err) {
      toast({
        title: "Error al limpiar",
        description: err instanceof Error ? err.message : "No se pudieron eliminar las cartolas.",
        variant: "destructive",
      });
    } finally {
      setIsLimpiando(false);
      setShowLimpiarDialog(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div className="h-8 bg-muted rounded animate-pulse" />
          <div className="h-64 bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Confirm limpiar dialog */}
      <AlertDialog open={showLimpiarDialog} onOpenChange={setShowLimpiarDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              ¿Eliminar todas las cartolas?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se borrarán todos los movimientos y gastos importados desde tus cartolas bancarias.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLimpiando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmLimpiarCartolas}
              disabled={isLimpiando}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isLimpiando ? "Eliminando..." : "Sí, eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PastelIcon icon={Receipt} color="pink" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Gastos</h1>
              <p className="text-sm text-muted-foreground">
                Gastos identificados desde tus cartolas bancarias
              </p>
            </div>
          </div>

          {isAuthenticated && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 gap-1.5"
              onClick={() => setShowLimpiarDialog(true)}
            >
              <Trash className="h-3.5 w-3.5" />
              Limpiar datos
            </Button>
          )}
        </div>

        {/* Content */}
        {isAuthenticated ? (
          <ParsedTransactionsTable mode="gastos" />
        ) : (
          <SignInBanner
            title="Inicia sesión para ver tus gastos"
            description="Sube tus cartolas bancarias y tus gastos aparecerán categorizados automáticamente."
            actionText="Iniciar sesión"
          />
        )}
      </div>
    </div>
  );
}
