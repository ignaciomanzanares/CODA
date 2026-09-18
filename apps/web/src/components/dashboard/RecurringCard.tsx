/**
 * Lo que se repite todos los meses: suscripciones y cobros fijos, ingresos recurrentes y
 * posibles cargos duplicados.
 *
 * El detector (B6) vivía terminado en la API y no se veía en ninguna pantalla. Lo que aporta
 * no es la lista: es el total comprometido — la plata que ya está tomada antes de decidir
 * nada — y ver que un cobro sigue activo aunque uno lo haya olvidado.
 *
 * Todo acá es de SÓLO LECTURA: describe patrones, no cambia ni marca nada. Los duplicados se
 * muestran para que la persona los revise en su banco, no para actuar por ella.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { Card, CardContent } from "@/components/ui/card";
import { Repeat, Copy } from "lucide-react";

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

interface RecurringItem {
  label: string;
  direction: "egreso" | "ingreso";
  typicalAmountClp: number;
  typicalDay: number;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  active: boolean;
  fixedAmount: boolean;
}

interface RecurringInventory {
  asOf: string | null;
  charges: RecurringItem[];
  income: RecurringItem[];
  monthlyChargesClp: number;
  monthlyIncomeClp: number;
}

interface DuplicateCandidate {
  label: string;
  amountClp: number;
  daysApart: number;
  first: { postedAt: string };
  second: { postedAt: string };
}

/** Tope de filas: la tarjeta informa, no reemplaza a Movimientos. */
const MAX_FILAS = 8;

const fmtDia = (d: number) => `día ${d}`;

const fmtFecha = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("es-CL", { day: "numeric", month: "short" });

function Fila({ item }: { item: RecurringItem }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {fmtDia(item.typicalDay)} · {item.occurrences} meses
          {item.fixedAmount ? " · monto fijo" : ""}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
        {CLP.format(item.typicalAmountClp)}
      </span>
    </div>
  );
}

export default function RecurringCard() {
  const inventario = useQuery<RecurringInventory>({
    queryKey: ["/api/transactions/recurring"],
    queryFn: () => apiFetch("/api/transactions/recurring"),
  });
  const duplicados = useQuery<{ candidates: DuplicateCandidate[] }>({
    queryKey: ["/api/transactions/duplicates"],
    queryFn: () => apiFetch("/api/transactions/duplicates"),
  });

  const inv = inventario.data;
  const dups = duplicados.data?.candidates ?? [];

  // Sin nada que mostrar la tarjeta no aparece (estado normal, no error: quien recién sube
  // su primera cartola todavía no tiene meses suficientes para que algo sea "recurrente").
  const cobros = inv?.charges ?? [];
  const ingresos = inv?.income ?? [];
  if (cobros.length === 0 && ingresos.length === 0 && dups.length === 0) return null;

  const activos = cobros.filter((c) => c.active);
  // Los que dejaron de cobrarse van aparte: la frase de arriba cuenta sólo los activos, y
  // mezclarlos hacía que dijera "3 cobros" sobre una lista de 5.
  const detenidos = cobros.filter((c) => !c.active);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-xl bg-muted p-2">
            <Repeat className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Todos los meses</p>
            {activos.length > 0 && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Tienes{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {CLP.format(inv!.monthlyChargesClp)}
                </span>{" "}
                comprometidos al mes en {activos.length}{" "}
                {activos.length === 1 ? "cobro que se repite" : "cobros que se repiten"}. Es plata
                que ya está tomada antes de decidir en qué gastar.
              </p>
            )}

            {activos.length > 0 && (
              <div className="mt-2 divide-y divide-border/60">
                {activos.slice(0, MAX_FILAS).map((c) => (
                  <Fila key={`${c.label}-${c.typicalDay}`} item={c} />
                ))}
                {activos.length > MAX_FILAS && (
                  <p className="pt-2 text-xs text-muted-foreground">
                    y {activos.length - MAX_FILAS} más
                  </p>
                )}
              </div>
            )}

            {detenidos.length > 0 && (
              <div className="mt-3 border-t border-border/60 pt-2">
                {/* "Ya no se cobran" afirmaría que la suscripción terminó, y lo único que
                    sabemos es que no hubo cobro en la ventana activa respecto del último
                    movimiento que tenemos: una cartola atrasada se ve idéntica a una baja. */}
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Sin cobro reciente
                </p>
                <div className="mt-1 divide-y divide-border/60">
                  {detenidos.slice(0, MAX_FILAS).map((c) => (
                    <Fila key={`${c.label}-${c.typicalDay}`} item={c} />
                  ))}
                </div>
              </div>
            )}

            {ingresos.length > 0 && (
              <div className="mt-3 border-t border-border/60 pt-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Ingresos que se repiten
                </p>
                <div className="mt-1 divide-y divide-border/60">
                  {ingresos.map((i) => (
                    <Fila key={`${i.label}-${i.typicalDay}`} item={i} />
                  ))}
                </div>
              </div>
            )}

            {dups.length > 0 && (
              <div className="mt-3 border-t border-border/60 pt-3">
                <div className="flex items-center gap-2">
                  <Copy className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Para revisar: podrían estar cobrados dos veces
                  </p>
                </div>
                <div className="mt-1 space-y-1">
                  {dups.slice(0, MAX_FILAS).map((d, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{d.label}</span> ·{" "}
                      <span className="tabular-nums">{CLP.format(d.amountClp)}</span>{" "}
                      {d.first.postedAt === d.second.postedAt
                        ? `dos veces el ${fmtFecha(d.first.postedAt)}`
                        : `el ${fmtFecha(d.first.postedAt)} y el ${fmtFecha(d.second.postedAt)}`}
                    </p>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Puede ser un cobro repetido o dos compras reales en el mismo comercio. CODA no
                  cambia nada: revísalo en tu banco si no lo reconoces.
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
