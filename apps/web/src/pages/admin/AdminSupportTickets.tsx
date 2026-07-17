/**
 * Gestión del canal de reclamos (NCG 502) — lista de casos con respuesta y
 * cambio de estado. Sección del AdminDashboard.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface AdminTicket {
  id: number;
  folio: string;
  tipo: string;
  asunto: string;
  mensaje: string;
  estado: string;
  respuesta: string | null;
  createdAt: string;
  userEmail: string | null;
}

const ESTADOS = ["abierto", "en_revision", "resuelto", "cerrado"] as const;

const ESTADO_CLASS: Record<string, string> = {
  abierto:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300",
  en_revision:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
  resuelto:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  cerrado: "border-border bg-muted text-muted-foreground",
};

function TicketRow({ ticket }: { ticket: AdminTicket }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [respuesta, setRespuesta] = useState("");
  const [estado, setEstado] = useState(ticket.estado);

  const guardar = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/support/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado: estado !== ticket.estado ? estado : undefined,
          respuesta: respuesta.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      setRespuesta("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/tickets"] });
      toast({ title: `Caso ${ticket.folio} actualizado` });
    },
    onError: () => toast({ title: "No se pudo actualizar", variant: "destructive" }),
  });

  const dirty = respuesta.trim() !== "" || estado !== ticket.estado;

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{ticket.asunto}</p>
            <p className="text-xs text-muted-foreground">
              {ticket.folio} · {ticket.tipo} · {ticket.userEmail ?? "sin email"} ·{" "}
              {String(ticket.createdAt).slice(0, 10)}
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn("shrink-0", ESTADO_CLASS[ticket.estado] ?? ESTADO_CLASS.abierto)}
          >
            {ticket.estado}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ticket.mensaje}</p>
        {ticket.respuesta && (
          <div className="rounded-xl bg-muted/60 border border-border/60 p-3">
            <p className="text-xs font-medium text-foreground mb-1">Respuesta enviada</p>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ticket.respuesta}</p>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <textarea
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            rows={2}
            placeholder={ticket.respuesta ? "Actualizar respuesta…" : "Escribir respuesta…"}
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
          />
          <div className="flex items-center gap-2">
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={() => guardar.mutate()}
              disabled={!dirty || guardar.isPending}
            >
              {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminSupportTickets() {
  const { data, isLoading } = useQuery<{ tickets: AdminTicket[] }>({
    queryKey: ["/api/admin/support/tickets"],
    queryFn: () => apiFetch("/api/admin/support/tickets"),
  });

  const tickets = data?.tickets ?? [];
  const abiertos = tickets.filter((t) => t.estado === "abierto" || t.estado === "en_revision");

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-medium">Reclamos y consultas (NCG 502)</h2>
        <p className="text-sm text-muted-foreground">
          {abiertos.length} caso{abiertos.length !== 1 ? "s" : ""} pendiente
          {abiertos.length !== 1 ? "s" : ""} de respuesta · compromiso: 10 días hábiles.
        </p>
      </div>
      {isLoading ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : tickets.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin casos registrados.</p>
      ) : (
        tickets.map((t) => <TicketRow key={t.id} ticket={t} />)
      )}
    </section>
  );
}
