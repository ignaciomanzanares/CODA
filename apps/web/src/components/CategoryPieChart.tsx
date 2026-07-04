import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useAuth, getPersonalToken, hasPersonalSession } from "@/lib/auth";
import { ROUTES } from "@/lib/routes";
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
  vivienda:               "Vivienda",
  alimentacion:           "Alimentación",
  transporte:             "Transporte",
  seguros:                "Otros pagos recurrentes",
  servicios_basicos:      "Servicios básicos",
  salud_bienestar:        "Salud y bienestar",
  educacion:              "Educación",
  cuidado_personal:       "Cuidado personal",
  diversion:              "Diversión",
  hobbies:                "Hobbies",
  suscripciones:          "Suscripciones",
  deudas:                 "Deudas",
  inversiones:            "Inversiones",
  ahorros:                "Ahorros",
  regalos:                "Regalos",
  reparaciones:           "Reparaciones",
  imprevistos:            "Imprevistos",
  telecomunicaciones:     "Telecomunicaciones",
  transferencia_enviada:  "Transferencias",
  transferencia_recibida: "Recibidas",
  comercio:               "Comercio",
  entretenimiento:        "Entretenimiento",
  salud:                  "Salud",
  ingreso_principal:      "Ingresos",
  servicios:              "Servicios",
  otro:                   "Otros",
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
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<InsightsData>({
    queryKey: ["/api/transactions/insights"],
    queryFn: () => {
      const token = getPersonalToken();
      if (!token && !hasPersonalSession()) return Promise.resolve({ spendingByCategory: [], totalEgresos: 0, totalIngresos: 0 });
      return apiFetch("/api/transactions/insights");
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
          <Skeleton className="h-72 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (cats.length === 0) return null;

  const chartData = cats.map(c => ({
    name: CATEGORY_LABELS[c.categoria] ?? c.categoria,
    categoria: c.categoria,
    value: c.total,
    pct: c.pct,
  }));

  const handleSliceClick = (_: unknown, idx: number) => {
    const cat = chartData[idx]?.categoria;
    if (cat) setLocation(`${ROUTES.movimientos}?categoria=${encodeURIComponent(cat)}`);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Gastos por categoría</CardTitle>
        <CardDescription>Distribución de egresos — haz clic en una categoría para ver detalle</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="40%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              onClick={handleSliceClick}
              className="cursor-pointer"
            >
              {chartData.map((_, idx) => (
                <Cell key={idx} fill={COLORS[idx % COLORS.length]} className="cursor-pointer" />
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
