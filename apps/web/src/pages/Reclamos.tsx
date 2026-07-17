/**
 * Canal de reclamos y consultas (NCG 502): formulario para abrir un caso y
 * historial con estado/respuesta. El compromiso de tiempos de respuesta se
 * declara en la propia página.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PastelIcon } from "@/components/ui/pastel-icon";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquareWarning, Send, Loader2, Inbox } from "lucide-react";

interface Ticket {
  id: number;
  folio: string;
  tipo: string;
  asunto: string;
  mensaje: string;
  estado: string;
  respuesta: string | null;
  respondedAt: string | null;
  createdAt: string;
}

const ESTADO_META: Record<string, { label: string; className: string }> = {
  abierto: {
    label: "Abierto",
    className:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300",
  },
  en_revision: {
    label: "En revisión",
    className:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
  },
  resuelto: {
    label: "Resuelto",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  },
  cerrado: {
    label: "Cerrado",
    className: "border-border bg-muted text-muted-foreground",
  },
};

function fmtFecha(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  return isNaN(d.getTime())
    ? iso.slice(0, 10)
    : d.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
}

export default function Reclamos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<"reclamo" | "consulta">("reclamo");
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState("");

  const ticketsQuery = useQuery<{ tickets: Ticket[] }>({
    queryKey: ["/api/support/tickets"],
    queryFn: () => apiFetch("/api/support/tickets"),
  });

  const crear = useMutation({
    mutationFn: () =>
      apiFetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, asunto, mensaje }),
      }),
    onSuccess: (data: { ticket?: Ticket }) => {
      setAsunto("");
      setMensaje("");
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      toast({
        title: `Caso ${data?.ticket?.folio ?? ""} registrado`,
        description: "Te responderemos dentro de 10 días hábiles al correo de tu cuenta.",
      });
    },
    onError: (e: unknown) => {
      toast({
        title: "No pudimos registrar tu caso",
        description: e instanceof Error ? e.message : "Intenta de nuevo.",
        variant: "destructive",
      });
    },
  });

  const tickets = ticketsQuery.data?.tickets ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <div className="flex items-center gap-3">
          <PastelIcon icon={MessageSquareWarning} color="orange" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reclamos y consultas</h1>
            <p className="text-sm text-muted-foreground">
              Registramos cada caso con folio y te respondemos dentro de{" "}
              <span className="font-medium text-foreground">10 días hábiles</span>.
            </p>
          </div>
        </div>

        {/* Formulario */}
        <Card className="rounded-2xl">
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as "reclamo" | "consulta")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reclamo">Reclamo</SelectItem>
                    <SelectItem value="consulta">Consulta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asunto">Asunto</Label>
                <Input
                  id="asunto"
                  value={asunto}
                  onChange={(e) => setAsunto(e.target.value)}
                  placeholder="Ej: Mi cartola quedó marcada como fallida"
                  maxLength={200}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mensaje">Describe tu caso</Label>
              <textarea
                id="mensaje"
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                rows={5}
                maxLength={4000}
                placeholder="Cuéntanos qué pasó, cuándo, y qué esperabas que ocurriera…"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => crear.mutate()}
                disabled={crear.isPending || asunto.trim().length < 3 || mensaje.trim().length < 10}
                className="gap-2"
              >
                {crear.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar {tipo}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Historial */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Mis casos
          </p>
          {ticketsQuery.isLoading ? (
            <Skeleton className="h-24 rounded-2xl" />
          ) : tickets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2">
              <Inbox className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Aún no tienes casos registrados.</p>
            </div>
          ) : (
            tickets.map((t) => {
              const meta = ESTADO_META[t.estado] ?? ESTADO_META.abierto;
              return (
                <Card key={t.id} className="rounded-2xl">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{t.asunto}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.folio} · {t.tipo} · {fmtFecha(t.createdAt)}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("shrink-0", meta.className)}>
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{t.mensaje}</p>
                    {t.respuesta && (
                      <div className="rounded-xl bg-muted/60 border border-border/60 p-3">
                        <p className="text-xs font-medium text-foreground mb-1">
                          Respuesta CODA{t.respondedAt ? ` · ${fmtFecha(t.respondedAt)}` : ""}
                        </p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {t.respuesta}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Los reclamos asociados a productos contratados con una institución financiera se resuelven
          principalmente con el proveedor correspondiente; te orientaremos en el proceso. También
          puedes escribirnos a{" "}
          <a href="mailto:info@codafinance.cl" className="underline underline-offset-2">
            info@codafinance.cl
          </a>
          .
        </p>
      </div>
    </div>
  );
}
