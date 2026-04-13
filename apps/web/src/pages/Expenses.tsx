import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Receipt, Upload, Loader2, Trash, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import SignInBanner from "@/components/SignInBanner";
import ParsedTransactionsTable from "@/components/ParsedTransactionsTable";
import { useToast } from "@/hooks/use-toast";

export default function Expenses() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Cartola upload state
  const [isUploadingCartolas, setIsUploadingCartolas] = useState(false);
  const cartolaInputRef = useRef<HTMLInputElement>(null);

  // Build absolute API URL
  const apiBase = (API_URL || "").replace(/\/$/, "");
  const apiUrl = (path: string) => (apiBase ? `${apiBase}${path}` : path);

  // Listen for custom event to trigger file upload from child components
  useEffect(() => {
    const handleTriggerUpload = () => {
      cartolaInputRef.current?.click();
    };
    window.addEventListener('trigger-cartola-upload', handleTriggerUpload);
    return () => window.removeEventListener('trigger-cartola-upload', handleTriggerUpload);
  }, []);

  const handleCartolaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !isAuthenticated) return;
    setIsUploadingCartolas(true);
    let successCount = 0;
    const errors: string[] = [];
    for (const file of files) {
      try {
        const token = localStorage.getItem("jwt_token") ?? "";
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(apiUrl("/api/documents/parse-cartola"), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (res.ok) {
          successCount++;
        } else {
          const body = await res.json().catch(() => ({}));
          errors.push(body.message ?? `Error ${res.status} en ${file.name}`);
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `Error en ${file.name}`);
      }
    }
    setIsUploadingCartolas(false);
    if (successCount > 0) {
      queryClient.removeQueries({ queryKey: ["/api/transactions/parsed"] });
      queryClient.removeQueries({ queryKey: ["/api/transactions/insights"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/documents"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      toast({
        title: `${successCount} cartola${successCount !== 1 ? "s" : ""} procesada${successCount !== 1 ? "s" : ""}`,
        description: errors.length > 0 ? `${errors[0]}` : "Tus gastos ya están disponibles en la tabla.",
      });
    } else {
      toast({
        title: "Error al subir",
        description: errors[0] ?? "No se pudo procesar ninguna cartola.",
        variant: "destructive",
      });
    }
  };

  const handleLimpiarCartolas = async () => {
    if (!confirm("¿Borrar todas las cartolas? Esta acción no se puede deshacer.")) return;
    try {
      const token = localStorage.getItem("jwt_token") ?? "";
      const res = await fetch(apiUrl("/api/user/cartolas"), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      queryClient.removeQueries({ queryKey: ["/api/transactions/parsed"] });
      queryClient.removeQueries({ queryKey: ["/api/transactions/insights"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/documents"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      toast({ title: "Cartolas eliminadas", description: "Puedes subir nuevas cartolas cuando quieras." });
    } catch (err) {
      toast({
        title: "Error al limpiar",
        description: err instanceof Error ? err.message : "No se pudieron eliminar las cartolas.",
        variant: "destructive",
      });
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
      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Receipt className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Gastos</h1>
              <p className="text-muted-foreground">Gastos identificados desde tus cartolas bancarias</p>
            </div>
          </div>

          <input
            ref={cartolaInputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleCartolaUpload}
          />

          {isAuthenticated && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 gap-1.5"
              onClick={handleLimpiarCartolas}
            >
              <Trash className="h-3.5 w-3.5" />
              Limpiar datos
            </Button>
          )}
        </div>

        {/* Content */}
        {isAuthenticated ? (
          <>
            <ParsedTransactionsTable mode="gastos" />
          </>
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
