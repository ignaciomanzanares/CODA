/**
 * Permisos de consulta a fuentes oficiales (D2/D5).
 *
 * Es el paso que faltaba: la app listaba y revocaba consentimientos, pero no había forma de
 * OTORGAR uno. Para las fuentes oficiales no hay banco que lo autorice por webhook, así que el
 * titular lo autoriza acá y recién entonces un conector puede consultar en su nombre.
 *
 * Otorgar son dos pasos en la API (crear + autorizar). Si el segundo falla, el consentimiento
 * queda pendiente y el botón ofrece completar la autorización en vez de crear otro.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import type { ConsentGrant } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, ShieldOff } from "lucide-react";

interface PermisoConfig {
  resourceType: string;
  titulo: string;
  detalle: string;
}

const PERMISOS: PermisoConfig[] = [
  {
    resourceType: "sii_tax_data",
    titulo: "Datos tributarios (SII)",
    detalle: "Renta declarada y boletas de tu carpeta tributaria, mientras la compartas con CODA.",
  },
  {
    resourceType: "cmf_debt_report",
    titulo: "Informe de deudas (CMF)",
    detalle: "Deuda directa, indirecta y morosa que los bancos informan a la CMF.",
  },
  {
    resourceType: "afc_employment",
    titulo: "Historial laboral (AFC)",
    detalle: "Cotizaciones del seguro de cesantía: antigüedad, empleador y renta imponible.",
  },
];

function grantFor(grants: ConsentGrant[], resourceType: string): ConsentGrant | undefined {
  // El más reciente que cubre el recurso y todavía sirve o está a medio otorgar.
  return grants
    .filter(
      (g) =>
        (g.status === "authorized" || g.status === "pending") &&
        g.scope?.some((s) => s.type === resourceType),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export function PermisosConsulta() {
  const { getConsents, createConsent, authorizeConsent, revokeConsent } = useApi();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pendiente, setPendiente] = useState<string | null>(null);

  const { data: grants } = useQuery<ConsentGrant[]>({
    queryKey: ["/api/consent"],
    queryFn: getConsents,
  });

  const porRecurso = useMemo(() => {
    const lista = grants ?? [];
    return Object.fromEntries(
      PERMISOS.map((p) => [p.resourceType, grantFor(lista, p.resourceType)]),
    );
  }, [grants]);

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ["/api/consent"] });

  const otorgar = useMutation({
    mutationFn: async (config: PermisoConfig) => {
      const existente = porRecurso[config.resourceType];
      const grant = existente ?? (await createConsent([config.resourceType]));
      return authorizeConsent(grant.id);
    },
    onSuccess: () => {
      toast({ title: "Permiso otorgado", description: "Puedes revocarlo cuando quieras." });
      void refrescar();
    },
    onError: (e: unknown) => {
      toast({
        title: "No se pudo otorgar",
        description: (e as Error)?.message ?? "Inténtalo de nuevo.",
        variant: "destructive",
      });
      // Puede haber quedado un consentimiento pendiente: refrescar para ofrecer completarlo.
      void refrescar();
    },
    onSettled: () => setPendiente(null),
  });

  const revocar = useMutation({
    mutationFn: (grantId: number) => revokeConsent(grantId),
    onSuccess: () => {
      toast({ title: "Permiso revocado", description: "CODA deja de poder consultar esa fuente." });
      void refrescar();
    },
    onError: (e: unknown) => {
      toast({
        title: "No se pudo revocar",
        description: (e as Error)?.message ?? "Inténtalo de nuevo.",
        variant: "destructive",
      });
    },
    onSettled: () => setPendiente(null),
  });

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <p className="font-medium">Permisos de consulta</p>
          <p className="text-sm text-muted-foreground">
            Autoriza a CODA a consultar cada fuente en tu nombre. Queda registrado con fecha y
            huella, y cada consulta que hagamos aparece en tu registro. Puedes revocarlo cuando
            quieras.
          </p>
        </div>

        <div className="space-y-3">
          {PERMISOS.map((config) => {
            const grant = porRecurso[config.resourceType];
            const autorizado = grant?.status === "authorized";
            const aMedias = grant?.status === "pending";
            const ocupado = pendiente === config.resourceType;

            return (
              <div
                key={config.resourceType}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-[14rem] flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{config.titulo}</p>
                    {autorizado && (
                      <Badge variant="default" className="gap-1">
                        <ShieldCheck className="h-3.5 w-3.5" /> Autorizado
                      </Badge>
                    )}
                    {aMedias && <Badge variant="secondary">Sin autorizar</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{config.detalle}</p>
                </div>

                {autorizado ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={ocupado}
                    onClick={() => {
                      setPendiente(config.resourceType);
                      revocar.mutate(grant!.id);
                    }}
                  >
                    <ShieldOff className="mr-1.5 h-4 w-4" /> Revocar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={ocupado}
                    onClick={() => {
                      setPendiente(config.resourceType);
                      otorgar.mutate(config);
                    }}
                  >
                    {aMedias ? "Completar autorización" : "Autorizar"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
