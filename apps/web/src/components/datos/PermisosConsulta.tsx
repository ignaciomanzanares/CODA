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
import { ShieldCheck, ShieldOff, Download } from "lucide-react";
import { apiFetch } from "@/lib/api";

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

/** Nombre del archivo del expediente. Fecha en el nombre: sirve para archivar varias copias. */
export function nombreExpediente(iso: string): string {
  const fecha = /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : "sin-fecha";
  return `consentimientos-coda-${fecha}.json`;
}

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
  const [descargando, setDescargando] = useState(false);

  const { data: grants, isError } = useQuery<ConsentGrant[]>({
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

  /**
   * Expediente exportable (B3): los hechos consentidos + el sello + su verificación. Es lo que se
   * entrega ante un requerimiento, y también lo que le permite al titular llevarse la prueba de
   * qué autorizó. La API ya lo armaba; hasta ahora no había cómo pedirlo desde la app.
   */
  const descargarExpediente = async () => {
    setDescargando(true);
    try {
      const expediente = await apiFetch("/api/consent/export");
      const blob = new Blob([JSON.stringify(expediente, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombreExpediente(String(expediente?.generatedAt ?? ""));
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({
        title: "No se pudo descargar",
        description: (e as Error)?.message ?? "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setDescargando(false);
    }
  };

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

        {isError && (
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            No pudimos cargar tus permisos ahora. Esta lista puede no reflejar lo que autorizaste,
            así que no ofrecemos cambiarlos hasta poder confirmarlo.
          </p>
        )}

        <div className="space-y-3">
          {PERMISOS.map((config) => {
            const grant = porRecurso[config.resourceType];
            const autorizado = grant?.status === "authorized";
            const aMedias = grant?.status === "pending";
            // Con la lista sin cargar no se sabe qué hay autorizado: actuar a ciegas podría
            // crear un permiso duplicado o revocar el equivocado.
            const ocupado = pendiente === config.resourceType || isError;

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

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="text-sm text-muted-foreground">
            Puedes llevarte la prueba de lo que autorizaste, con su sello y su verificación.
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={descargando}
            onClick={() => void descargarExpediente()}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {descargando ? "Preparando…" : "Descargar expediente"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
