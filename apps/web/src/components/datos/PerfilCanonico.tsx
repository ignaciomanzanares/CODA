/**
 * "Qué sabemos de ti y de dónde" (D1) — el perfil canónico visto por su dueño.
 *
 * La promesa de D1 es que cada dato sabe de dónde salió. Hasta acá eso vivía sólo en la API
 * (GET /api/profile/canonical): el usuario veía cifras en su diagnóstico sin poder rastrear de
 * qué documento salió cada una. Esto lo muestra: valor, fuente, fecha del dato y qué tan
 * confiable es.
 *
 * Lo que NO hace: no permite editar. Un dato traído de una fuente oficial no se corrige acá; se
 * corrige subiendo el documento correcto, y eso deja rastro. Si el usuario no está de acuerdo con
 * un dato, el camino es revocar el permiso o reemplazar la fuente.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { FileSearch } from "lucide-react";

export interface Procedencia {
  source: string;
  asOf: string | null;
  confidence: number;
}

export interface Hecho<T> {
  value: T;
  provenance: Procedencia;
}

export interface PerfilCanonicoData {
  userId: string;
  identidad: { rut?: Hecho<string>; nombre?: Hecho<string> };
  renta: { mensualClp?: Hecho<number> };
  deuda: { totalClp?: Hecho<number>; moraActiva?: Hecho<boolean> };
  empleo: { cotizacionMeses?: Hecho<number> };
  sources: string[];
  assembledAt: string;
}

const FUENTES: Record<string, string> = {
  cmf: "Informe CMF",
  sii: "Carpeta tributaria (SII)",
  afp: "Certificado AFP",
  afc: "Certificado AFC",
  tgr: "Tesorería",
  cartola: "Tus cartolas",
  user_declared: "Lo declaraste tú",
  reconciled: "Cruce de varias fuentes",
  registro_civil: "Registro Civil",
};

/** La confianza se muestra en palabras: un 0,7 no le dice nada a nadie. */
function confianza(valor: number): {
  texto: string;
  variante: "default" | "secondary" | "outline";
} {
  if (valor >= 0.85) return { texto: "Confianza alta", variante: "default" };
  if (valor >= 0.65) return { texto: "Confianza media", variante: "secondary" };
  return { texto: "Confianza baja", variante: "outline" };
}

function fecha(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

interface Fila {
  etiqueta: string;
  valor: string;
  procedencia: Procedencia;
}

/** Aplana el perfil a filas legibles. Pura: es lo que se prueba. */
export function filasDelPerfil(perfil: PerfilCanonicoData): Fila[] {
  const filas: Fila[] = [];
  const push = <T,>(etiqueta: string, hecho: Hecho<T> | undefined, formato: (v: T) => string) => {
    if (!hecho) return;
    filas.push({ etiqueta, valor: formato(hecho.value), procedencia: hecho.provenance });
  };

  push("Nombre", perfil.identidad?.nombre, (v) => String(v));
  push("RUT", perfil.identidad?.rut, (v) => String(v));
  push("Ingreso mensual", perfil.renta?.mensualClp, (v) => formatCurrency(Number(v), "CLP"));
  push("Deuda total", perfil.deuda?.totalClp, (v) => formatCurrency(Number(v), "CLP"));
  push("Deuda morosa", perfil.deuda?.moraActiva, (v) => (v ? "Sí, registras mora" : "Sin mora"));
  push("Meses cotizados", perfil.empleo?.cotizacionMeses, (v) => `${v} meses`);
  return filas;
}

export function PerfilCanonico() {
  const { data, isError } = useQuery<PerfilCanonicoData>({
    queryKey: ["/api/profile/canonical"],
    queryFn: () => apiFetch("/api/profile/canonical"),
  });
  return <PerfilCanonicoView perfil={data} isError={isError} />;
}

export function PerfilCanonicoView({
  perfil,
  isError,
}: {
  perfil?: PerfilCanonicoData;
  isError?: boolean;
}) {
  const filas = perfil ? filasDelPerfil(perfil) : [];

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-muted p-2">
            <FileSearch className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium">Qué sabemos de ti y de dónde</p>
            <p className="text-sm text-muted-foreground">
              Cada dato que usamos para tu diagnóstico, con la fuente de la que salió, de cuándo es
              y qué tan confiable lo consideramos.
            </p>
          </div>
        </div>

        {isError ? (
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            No pudimos cargar tu perfil ahora. No significa que no tengamos datos: vuelve a
            intentarlo en un momento.
          </p>
        ) : filas.length === 0 ? (
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            Todavía no tenemos datos tuyos. Sube una cartola o conecta una fuente y aparecerán acá
            con su procedencia.
          </p>
        ) : (
          <ul className="space-y-2">
            {filas.map((fila) => {
              const { texto, variante } = confianza(fila.procedencia.confidence);
              const cuando = fecha(fila.procedencia.asOf);
              return (
                <li
                  key={fila.etiqueta}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="min-w-[10rem]">
                    <p className="text-sm text-muted-foreground">{fila.etiqueta}</p>
                    <p className="font-medium">{fila.valor}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {FUENTES[fila.procedencia.source] ?? fila.procedencia.source}
                      {cuando && ` · ${cuando}`}
                    </span>
                    <Badge variant={variante}>{texto}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
