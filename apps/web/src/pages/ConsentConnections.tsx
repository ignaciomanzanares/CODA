import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import type { ConsentGrant, ConsentGrantScopeItem } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Link2, Shield, Calendar, RefreshCw, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const SCOPE_LABELS: Record<string, string> = {
  account_information: "Cuentas y transacciones",
  products_vigentes: "Productos vigentes",
  historical_positions: "Posiciones históricas",
  terms_and_conditions: "Términos y condiciones",
  payment_initiation: "Iniciación de pagos",
};

function scopeToReadable(scope: ConsentGrantScopeItem[]): string {
  if (!scope?.length) return "—";
  return scope
    .map((s) => SCOPE_LABELS[s.type] || s.type)
    .filter(Boolean)
    .join(", ");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: ConsentGrant["status"] }) {
  const config = {
    authorized: { label: "Autorizado", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
    pending: { label: "Pendiente", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
    revoked: { label: "Revocado", className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" },
    rejected: { label: "Rechazado", className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" },
    expired: { label: "Expirado", className: "bg-muted text-muted-foreground border-border" },
  };
  const { label, className } = config[status] ?? config.pending;
  return (
    <Badge variant="outline" className={cn("font-medium", className)}>
      {label}
    </Badge>
  );
}

export default function ConsentConnections() {
  const { getConsents, revokeConsent } = useApi();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [revokeGrantId, setRevokeGrantId] = useState<number | null>(null);

  const { data: grants, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["consents"],
    queryFn: getConsents,
  });

  const revokeMutation = useMutation({
    mutationFn: revokeConsent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consents"] });
      setRevokeGrantId(null);
      toast({ title: "Acceso revocado", description: "El consentimiento se ha revocado correctamente." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Error", description: err.message || "No se pudo revocar el acceso." });
    },
  });

  const handleRevokeConfirm = () => {
    if (revokeGrantId == null) return;
    revokeMutation.mutate(revokeGrantId);
  };

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Cargando conexiones...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container max-w-4xl py-8">
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <p className="text-destructive">Error al cargar los consentimientos.</p>
            <p className="text-sm text-muted-foreground mt-1">{error?.message}</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const list = grants ?? [];

  return (
    <div className="container max-w-4xl py-8">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Link2 className="h-8 w-8" />
            Mis Conexiones Bancarias
          </h1>
          <p className="text-muted-foreground mt-1">
            Panel de control de consentimientos. Aquí ves con qué instituciones compartes datos y puedes revocar el acceso.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {list.length === 0
              ? "Aún no tienes conexiones con instituciones."
              : `${list.length} conexión${list.length !== 1 ? "es" : ""}`}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
        </div>

        {list.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No hay consentimientos registrados.</p>
              <p className="text-sm mt-1">
                Cuando autorices el uso de tus datos con un banco o institución, aparecerán aquí.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-4">
            {list.map((grant) => (
              <li key={grant.id}>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        {grant.ipiId || "Institución"}
                      </CardTitle>
                      <StatusBadge status={grant.status} />
                    </div>
                    <CardDescription>
                      Datos compartidos: {scopeToReadable(grant.scope)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {grant.expiresAt && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4 shrink-0" />
                        <span>Vence: {formatDate(grant.expiresAt)}</span>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Actualizado: {formatDate(grant.updatedAt)}
                    </div>
                    {(grant.status === "authorized" || grant.status === "pending") && (
                      <div className="pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setRevokeGrantId(grant.id)}
                        >
                          Revocar acceso
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog open={revokeGrantId != null} onOpenChange={(open) => !open && setRevokeGrantId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Revocar acceso?</AlertDialogTitle>
            <AlertDialogDescription>
              Dejarás de compartir datos con esta institución. Si más adelante quieres usar de nuevo el servicio,
              tendrás que autorizar un nuevo consentimiento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeConfirm}
              disabled={revokeMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Revocando...
                </>
              ) : (
                "Revocar acceso"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
