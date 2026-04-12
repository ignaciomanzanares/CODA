import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface CategorySpend { categoria: string; total: number; pct: number }
interface InsightsData {
  spendingByCategory: CategorySpend[];
  totalEgresos: number;
  totalIngresos: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  alimentacion:          "Alimentación",
  transporte:            "Transporte",
  entretenimiento:       "Entretenimiento",
  telecomunicaciones:    "Telecomunicaciones",
  transferencia_enviada: "Transferencias",
  transferencia_recibida:"Recibidas",
  comercio:              "Comercio",
  educacion:             "Educación",
  salud:                 "Salud",
  ingreso_principal:     "Ingresos",
  otro:                  "Otros",
};

const COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
  "#14b8a6", "#6366f1",
];

const clpFmt = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value, payload: p } = payload[0];
  return (
    <div className="bg-background border rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold">{name}</p>
      <p className="text-muted-foreground">{clpFmt.format(value)}</p>
      <p className="text-xs text-muted-foreground">{p.pct}% del total</p>
    </div>
  );
}

export default function CategoryPieChart() {
  const { isAuthenticated } = useAuth();

  const { data, isLoading } = useQuery<InsightsData>({
    queryKey: ["/api/transactions/insights"],
    queryFn: () => {
      const token = localStorage.getItem("jwt_token");
      if (!token) return Promise.resolve({ spendingByCategory: [], totalEgresos: 0, totalIngresos: 0 });
      return apiFetch("/api/transactions/insights", { headers: { Authorization: `Bearer ${token}` } });
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const cats = (data?.spendingByCategory ?? []).filter(c =>
    c.categoria !== "ingreso_principal" && c.categoria !== "transferencia_recibida"
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-56 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (cats.length === 0) return null;

  const chartData = cats.map(c => ({
    name: CATEGORY_LABELS[c.categoria] ?? c.categoria,
    value: c.total,
    pct: c.pct,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Gastos por categoría</CardTitle>
        <CardDescription>Distribución de egresos extraídos de tus cartolas</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={96}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
