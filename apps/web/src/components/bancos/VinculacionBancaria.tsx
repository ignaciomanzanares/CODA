/**
 * Vinculación bancaria (B2) — qué bancos se pueden conectar hoy, y cuáles todavía no.
 *
 * El punto de esta pantalla no es ofrecer botones: es NO pedirle la clave del banco a alguien
 * para después fallar. Mientras un banco no esté listo, lo dice y ofrece la vía que sí funciona
 * (subir la cartola), en vez de dejar a la persona escribiendo credenciales en un callejón.
 *
 * El estado viene del catálogo de la API, que marca "disponible" sólo cuando el adaptador de ese
 * banco funcionó de punta a punta contra el sitio real. Hoy no hay ninguno.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useUploadDrawer } from "@/contexts/UploadDrawerContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Landmark, Upload, AlertCircle, RefreshCw } from "lucide-react";

interface Institucion {
  bankId: string;
  bankName: string;
  estado: "disponible" | "pendiente";
  mensaje: string;
}

export function VinculacionBancaria({
  /**
   * Arranca la vinculación de un banco disponible. Hoy NO se pasa: el flujo real necesita la
   * máquina del segundo factor, que espera la captura del sitio del banco. Sin callback no se
   * dibuja el botón — preferimos no tener botón a tener uno que no hace nada.
   */
  onVincular,
}: {
  onVincular?: (bankId: string) => void;
} = {}) {
  const { setOpen: abrirSubida } = useUploadDrawer();
  const { data, isLoading, isError, refetch, isFetching } = useQuery<{
    instituciones: Institucion[];
  }>({
    queryKey: ["/api/bank-connections/instituciones"],
    queryFn: () => apiFetch("/api/bank-connections/instituciones"),
  });

  const instituciones = data?.instituciones ?? [];
  const disponibles = instituciones.filter((i) => i.estado === "disponible");

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-xl bg-muted p-2">
            <Landmark className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">Conectar tu banco</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Traer tus movimientos directamente del banco, sin que subas la cartola cada mes. A
              diferencia de los certificados, acá sí se necesita tu clave y tu segundo factor —{" "}
              <strong className="text-foreground">
                se usan sólo durante la consulta y no se guardan
              </strong>
              , porque el banco los pide de nuevo cada vez.
            </p>
          </div>
        </div>

        {isLoading && <div className="h-16 animate-pulse rounded-lg bg-muted" />}

        {/* Un fallo de carga NO se puede leer como "no hay bancos". */}
        {isError && (
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  No pudimos cargar la lista de bancos
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Es un problema de conexión, no que no haya bancos disponibles.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={isFetching}
                  onClick={() => refetch()}
                >
                  <RefreshCw className={`mr-1 h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
                  Reintentar
                </Button>
              </div>
            </div>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            {disponibles.length === 0 && instituciones.length > 0 && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Todavía no tenemos ningún banco conectado. Estamos terminando el primero. Mientras
                tanto, tu cartola en PDF entrega exactamente los mismos movimientos.
              </p>
            )}

            <div className="divide-y divide-border/60">
              {instituciones.map((i) => (
                <div key={i.bankId} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{i.bankName}</p>
                      {i.estado === "disponible" ? (
                        <Badge variant="secondary">Disponible</Badge>
                      ) : (
                        // "Próximamente" promete una fecha que no podemos cumplir mientras el
                        // adaptador dependa de una captura que todavía no existe.
                        <Badge variant="outline">No disponible</Badge>
                      )}
                    </div>
                    {i.mensaje && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{i.mensaje}</p>
                    )}
                  </div>
                  {i.estado === "disponible" && onVincular && (
                    <Button size="sm" onClick={() => onVincular(i.bankId)}>
                      Vincular
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={() => abrirSubida(true)}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Subir mi cartola
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
