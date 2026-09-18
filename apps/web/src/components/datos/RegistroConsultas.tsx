/**
 * "Quién consultó tus datos" (D1) — la traza de auditoría por consulta, vista por su dueño.
 *
 * Cada vez que CODA va a buscar datos a una fuente queda registrado: qué fuente, bajo qué
 * consentimiento, cómo terminó y cuánto tardó. Hasta acá eso existía sólo como API; mostrarlo es
 * lo que lo vuelve control real del titular, y no una promesa en los términos.
 *
 * Los intentos BLOQUEADOS por falta de consentimiento también aparecen, a propósito: son
 * justamente los que prueban que el permiso sirve para algo.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ShieldOff, AlertTriangle, Loader2, History } from "lucide-react";

interface SourceAccessEntry {
  accessId: string;
  resourceType: string;
  connectorId: string | null;
  trigger: string | null;
  institution: string | null;
  outcome: "started" | "succeeded" | "failed" | "denied";
  consentGrantId: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
}

const FUENTES: Record<string, string> = {
  sii_tax_data: "Datos tributarios (SII)",
  cmf_debt_report: "Informe de deudas (CMF)",
  afc_employment: "Historial laboral (AFC)",
  account_information: "Cuentas y movimientos",
  products_vigentes: "Productos vigentes",
  historical_positions: "Posiciones históricas",
  terms_and_conditions: "Términos y condiciones",
  payment_initiation: "Iniciación de pagos",
};

/** Del código de error sale una frase que se entiende; si es uno nuevo, se muestra tal cual. */
const MOTIVOS: Record<string, string> = {
  pending_fetch: "esa conexión todavía no está disponible",
  secret_missing: "faltaba el acceso que tú compartes",
  secret_expired: "el acceso que compartiste había vencido",
  invalid_secret_shape: "el acceso guardado estaba incompleto",
  consent_required: "no había permiso vigente",
  unknown_error: "un error de la fuente",
};

function motivo(errorCode: string | null): string {
  if (!errorCode) return "un error de la fuente";
  return MOTIVOS[errorCode] ?? errorCode;
}

function cuando(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function duracion(ms: number | null): string | null {
  if (ms == null) return null;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function estado(entry: SourceAccessEntry) {
  switch (entry.outcome) {
    case "succeeded":
      return {
        icono: CheckCircle2,
        etiqueta: "Consultada",
        variante: "default" as const,
        detalle: "Trajimos tus datos con tu permiso vigente.",
      };
    case "denied":
      return {
        icono: ShieldOff,
        etiqueta: "Bloqueada",
        variante: "secondary" as const,
        detalle: "Se intentó consultar sin tu permiso y no se hizo.",
      };
    case "failed":
      return {
        icono: AlertTriangle,
        etiqueta: "No se pudo",
        variante: "outline" as const,
        detalle: `No se completó por ${motivo(entry.errorCode)}.`,
      };
    default:
      return {
        icono: Loader2,
        etiqueta: "En curso",
        variante: "outline" as const,
        detalle: "La consulta empezó y todavía no termina.",
      };
  }
}

export function RegistroConsultas() {
  const { data, isError } = useQuery<{ entries: SourceAccessEntry[] }>({
    queryKey: ["/api/data-sources/access-log"],
    queryFn: () => apiFetch("/api/data-sources/access-log?limit=20"),
  });
  return <RegistroConsultasView entries={data?.entries ?? []} isError={isError} />;
}

/**
 * La vista separada de la consulta, para poder probar los tres casos (con consultas, sin
 * consultas y sin poder cargarlas) sin montar react-query.
 *
 * `isError` importa: si la API no responde, decir "todavía no hemos consultado ninguna fuente"
 * sería afirmar algo que no sabemos — el mismo engaño que el panel mostrando "sube tu primer
 * documento" a quien ya subió.
 */
export function RegistroConsultasView({
  entries,
  isError,
}: {
  entries: SourceAccessEntry[];
  isError?: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-muted p-2">
            <History className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium">Quién consultó tus datos</p>
            <p className="text-sm text-muted-foreground">
              Cada vez que consultamos una fuente en tu nombre queda registrado acá, con el permiso
              que lo autorizó. También aparecen los intentos que tu permiso bloqueó.
            </p>
          </div>
        </div>

        {isError ? (
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            No pudimos cargar tu registro ahora. No significa que no haya consultas: vuelve a
            intentarlo en un momento.
          </p>
        ) : entries.length === 0 ? (
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            Todavía no hemos consultado ninguna fuente con tus datos.
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => {
              const { icono: Icono, etiqueta, variante, detalle } = estado(entry);
              const tiempo = duracion(entry.durationMs);
              return (
                <li key={entry.accessId} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={variante} className="gap-1">
                      <Icono className="h-3.5 w-3.5" /> {etiqueta}
                    </Badge>
                    <span className="font-medium">
                      {FUENTES[entry.resourceType] ?? entry.resourceType}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {cuando(entry.startedAt ?? entry.finishedAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {detalle}
                    {entry.consentGrantId != null && ` Permiso n.º ${entry.consentGrantId}.`}
                    {tiempo && ` Tardó ${tiempo}.`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
