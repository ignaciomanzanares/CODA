/**
 * Movimientos puntuales: CODA detecta gastos o ingresos que se salen del ritmo del
 * usuario (un matrimonio, un auto, un pie) y le pregunta si fueron eventos únicos.
 *
 * Por qué se pregunta en vez de asumir: excluir plata del diagnóstico cambia el nivel
 * de salud y la tasa de ahorro. Hacerlo solo sería reescribirle las finanzas a alguien
 * sin avisarle. El detector propone; la persona decide, y puede deshacerlo.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarClock, Loader2, Undo2 } from "lucide-react";

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("es-CL", { day: "numeric", month: "short" });

interface Candidate {
  id: string;
  postedAt: string;
  month: string;
  description: string;
  categoria: string;
  tipo: "ingreso" | "egreso";
  amountClp: number;
  medianMultiple: number;
  monthShare: number;
}

interface MarkedTx {
  id: string;
  postedAt: string;
  description: string;
  tipo: "ingreso" | "egreso";
  amountClp: number;
}

interface ExtraordinaryResponse {
  candidates: Candidate[];
  marked: MarkedTx[];
}

function useDecide() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, isExtraordinary }: { id: string; isExtraordinary: boolean | null }) =>
      apiFetch(`/api/transactions/${id}/extraordinary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isExtraordinary }),
      }),
    // Marcar cambia salud, tasa de ahorro y features del score: se refresca todo.
    onSuccess: () => queryClient.invalidateQueries(),
    onError: () => toast({ title: "No se pudo guardar", variant: "destructive" }),
  });
}

function CandidateRow({ c }: { c: Candidate }) {
  const decide = useDecide();
  const esIngreso = c.tipo === "ingreso";

  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{c.description}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {fmtDate(c.postedAt)} · {esIngreso ? "Ingreso" : "Gasto"} de{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {CLP.format(c.amountClp)}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {c.medianMultiple >= 1000
            ? "Muy por encima"
            : `${c.medianMultiple.toLocaleString("es-CL")}×`}{" "}
          de tu {esIngreso ? "ingreso" : "gasto"} habitual · explica el{" "}
          {Math.round(c.monthShare * 100)}% del mes
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={decide.isPending}
          onClick={() => decide.mutate({ id: c.id, isExtraordinary: true })}
        >
          {decide.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Fue puntual
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={decide.isPending}
          onClick={() => decide.mutate({ id: c.id, isExtraordinary: false })}
        >
          Es habitual
        </Button>
      </div>
    </div>
  );
}

function MarkedRow({ m }: { m: MarkedTx }) {
  const decide = useDecide();

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{m.description}</span> ·{" "}
          <span className="tabular-nums">{CLP.format(m.amountClp)}</span>
        </p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 shrink-0 px-2 text-xs"
        disabled={decide.isPending}
        onClick={() => decide.mutate({ id: m.id, isExtraordinary: null })}
      >
        <Undo2 className="mr-1 h-3 w-3" />
        Deshacer
      </Button>
    </div>
  );
}

export default function ExtraordinaryEventsCard() {
  const { data, isLoading, isError } = useQuery<ExtraordinaryResponse>({
    queryKey: ["/api/transactions/extraordinary"],
    queryFn: () => apiFetch("/api/transactions/extraordinary"),
  });

  // Sin candidatos ni marcados no hay nada que decidir: la tarjeta no aparece.
  // (Es un estado normal, no un error — por eso tampoco se muestra si falla.)
  if (isLoading || isError || !data) return null;
  const { candidates, marked } = data;
  if (candidates.length === 0 && marked.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-500/20 dark:bg-amber-500/5">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-xl bg-white/70 p-2 dark:bg-white/10">
            <CalendarClock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            {candidates.length > 0 ? (
              <>
                <p className="text-sm font-semibold text-foreground">
                  {candidates.length === 1
                    ? "Detectamos un movimiento que parece puntual"
                    : `Detectamos ${candidates.length} movimientos que parecen puntuales`}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Si fueron eventos únicos —un matrimonio, un auto, un pie— dejan de contar como tu
                  ritmo mensual: tu tasa de ahorro y tu nivel de salud pasan a reflejar cómo vivís
                  normalmente. La plata sigue contando en tu saldo y en tus movimientos.
                </p>
                <div className="mt-2 divide-y divide-border/60">
                  {candidates.map((c) => (
                    <CandidateRow key={c.id} c={c} />
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm font-semibold text-foreground">
                Movimientos marcados como puntuales
              </p>
            )}

            {marked.length > 0 && (
              <div className="mt-3 border-t border-border/60 pt-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Fuera de tu ritmo mensual
                </p>
                <div className="mt-1">
                  {marked.map((m) => (
                    <MarkedRow key={m.id} m={m} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
