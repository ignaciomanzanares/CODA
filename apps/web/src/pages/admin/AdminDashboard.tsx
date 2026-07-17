/**
 * Dashboard de administración (solo role=admin). Back-office del motor de ingresos y compliance:
 *  - Revenue & funnel: KPIs de /api/products/metrics.
 *  - Gestión de leads: tabla de todas las aplicaciones, con acción de avanzar estado manualmente
 *    mientras la institución no integre la API.
 *  - Compliance: export de recomendaciones (algorithm_prediction_logs) por rango de fechas.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, TrendingUp, Users, CheckCircle } from "lucide-react";
import AdminSupportTickets from "./AdminSupportTickets";

interface AdminLead {
  leadId: number;
  status: string;
  userId: string;
  product: { id: number; name: string; provider: string; category: string };
  requestedAmount: number | null;
  revenueEarned: number | null;
  revenueType: string | null;
  appliedAt: string;
  respondedAt: string | null;
}

const STATUS_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  pending: { label: "Pendiente", variant: "secondary" },
  delivered: { label: "Entregado", variant: "outline" },
  accepted: { label: "Aceptado", variant: "default" },
  approved: { label: "Originado", variant: "default" },
  rejected: { label: "Rechazado", variant: "destructive" },
  expired: { label: "Expirado", variant: "secondary" },
  withdrawn: { label: "Retirado", variant: "secondary" },
};

export default function AdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["/api/products/metrics"],
    queryFn: () => apiFetch("/api/products/metrics"),
    refetchInterval: 30000,
  });

  const { data: leadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ["/api/admin/leads"],
    queryFn: () => apiFetch("/api/admin/leads?limit=200"),
    refetchInterval: 30000,
  });

  const { data: outcomes, isLoading: outcomesLoading } = useQuery({
    queryKey: ["/api/admin/risk-outcomes"],
    queryFn: () => apiFetch("/api/admin/risk-outcomes"),
    refetchInterval: 30000,
  });

  const statusMutation = useMutation({
    mutationFn: async (vars: { leadId: number; status: string; originatedAmount?: number }) => {
      return apiFetch(`/api/admin/leads/${vars.leadId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: vars.status, originatedAmount: vars.originatedAmount }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/metrics"] });
      toast({ title: "Lead actualizado" });
    },
    onError: () => toast({ title: "No se pudo actualizar el lead", variant: "destructive" }),
  });

  const revenue = metrics?.revenue ?? {};
  const funnel = metrics?.funnel ?? {};
  const leads: AdminLead[] = leadsData?.leads ?? [];

  const advance = (lead: AdminLead, status: "accepted" | "rejected" | "originated") => {
    let originatedAmount: number | undefined;
    if (status === "originated") {
      const input = window.prompt("Monto originado (CLP):", String(lead.requestedAmount ?? ""));
      if (input === null) return;
      originatedAmount = Number(input.replace(/\D/g, ""));
      if (!originatedAmount || originatedAmount <= 0) {
        toast({ title: "Monto inválido", variant: "destructive" });
        return;
      }
    }
    statusMutation.mutate({ leadId: lead.leadId, status, originatedAmount });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Administración</h1>
        <p className="text-muted-foreground">Motor de ingresos y trazabilidad para compliance.</p>
      </div>

      {/* Revenue & funnel */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={DollarSign}
          label="Revenue total"
          loading={metricsLoading}
          value={formatCurrency(Number(revenue.totalRevenue ?? 0), "CLP")}
        />
        <KpiCard
          icon={CheckCircle}
          label="Originaciones"
          loading={metricsLoading}
          value={String(revenue.approvalsCount ?? 0)}
        />
        <KpiCard
          icon={Users}
          label="Aplicaciones"
          loading={metricsLoading}
          value={String(revenue.applicationsCount ?? 0)}
        />
        <KpiCard
          icon={TrendingUp}
          label="Conversión"
          loading={metricsLoading}
          value={`${Number(funnel.overallConversionRate ?? 0).toFixed(1)}%`}
        />
      </section>

      {/* Aprendizaje del modelo (Fase G): outcomes reales para recalibrar con data chilena */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">Aprendizaje del modelo</h2>
          <p className="text-sm text-muted-foreground">
            Decisiones reales capturadas (snapshot al aplicar + resultado de la institución). Es el
            dataset propio con el que se recalibran los scores y se aprende qué proveedor otorga a
            quién.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard
            icon={Users}
            label="Snapshots"
            loading={outcomesLoading}
            value={String(outcomes?.total ?? 0)}
          />
          <KpiCard
            icon={CheckCircle}
            label="Con resultado"
            loading={outcomesLoading}
            value={String(outcomes?.labeled ?? 0)}
          />
          <KpiCard
            icon={TrendingUp}
            label="Pendientes"
            loading={outcomesLoading}
            value={String(outcomes?.pending ?? 0)}
          />
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-3 font-medium">Proveedor</th>
                  <th className="p-3 font-medium">Decisiones</th>
                  <th className="p-3 font-medium">Aprobaciones</th>
                  <th className="p-3 font-medium">Tasa aprobación</th>
                </tr>
              </thead>
              <tbody>
                {(outcomes?.byProvider ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                      Aún no hay decisiones con resultado. Se acumulan cuando las instituciones
                      responden leads.
                    </td>
                  </tr>
                ) : (
                  outcomes.byProvider.map(
                    (p: {
                      provider: string;
                      decisions: number;
                      approvals: number;
                      approvalRate: number;
                    }) => (
                      <tr key={p.provider} className="border-b last:border-0">
                        <td className="p-3 font-medium">{p.provider}</td>
                        <td className="p-3 tabular-nums">{p.decisions}</td>
                        <td className="p-3 tabular-nums">{p.approvals}</td>
                        <td className="p-3 tabular-nums font-semibold">{p.approvalRate}%</td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Gestión de leads */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Gestión de leads</h2>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {leadsLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : leads.length === 0 ? (
              <p className="p-6 text-center text-muted-foreground">Aún no hay leads.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="p-3">Producto</th>
                    <th className="p-3">Institución</th>
                    <th className="p-3">Monto</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Revenue</th>
                    <th className="p-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => {
                    const badge = STATUS_BADGE[lead.status] ?? {
                      label: lead.status,
                      variant: "secondary" as const,
                    };
                    const closed = ["approved", "rejected", "expired", "withdrawn"].includes(
                      lead.status,
                    );
                    return (
                      <tr key={lead.leadId} className="border-b last:border-0">
                        <td className="p-3">{lead.product.name}</td>
                        <td className="p-3 text-muted-foreground">{lead.product.provider}</td>
                        <td className="p-3">
                          {lead.requestedAmount ? formatCurrency(lead.requestedAmount, "CLP") : "—"}
                        </td>
                        <td className="p-3">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </td>
                        <td className="p-3">
                          {lead.revenueEarned ? formatCurrency(lead.revenueEarned, "CLP") : "—"}
                        </td>
                        <td className="p-3">
                          {!closed && (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => advance(lead, "originated")}
                                disabled={statusMutation.isPending}
                              >
                                Originar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => advance(lead, "rejected")}
                                disabled={statusMutation.isPending}
                              >
                                Rechazar
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Canal de reclamos (NCG 502) */}
      <AdminSupportTickets />

      {/* Compliance export */}
      <ComplianceExport />
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="text-xs">{label}</span>
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-24" />
        ) : (
          <p className="mt-1 text-xl font-semibold">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ComplianceExport() {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [busy, setBusy] = useState(false);

  const runExport = async () => {
    setBusy(true);
    try {
      const data = await apiFetch("/api/audit/admin/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: start,
          endDate: `${end}T23:59:59.999Z`,
          kind: "product_recommendation",
        }),
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `coda-recomendaciones-${start}_${end}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Export listo (${data?.count ?? 0} registros)` });
    } catch {
      toast({ title: "No se pudo exportar", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">Compliance — auditoría de recomendaciones (NCG 502)</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exportar recomendaciones</CardTitle>
          <CardDescription>
            Descarga la traza de recomendaciones (inputs, versión de modelo, resultado) del período,
            para la auditoría trimestral. Fuente: algorithm_prediction_logs (persistido en DB).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="start">Desde</Label>
            <Input
              id="start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="end">Hasta</Label>
            <Input id="end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <Button onClick={runExport} disabled={busy}>
            {busy ? "Exportando…" : "Exportar JSON"}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
