import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { useCurrency } from "@/lib/CurrencyContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface MonthEntry {
  month: string;
  label: string;
  ingresos: number;
  egresos: number;
  balance: number;
  balanceReal?: number;
}

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
  notation: "compact",
});

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const ingresos = payload.find((p: any) => p.dataKey === "ingresos")?.value ?? 0;
  const egresos = payload.find((p: any) => p.dataKey === "egresos")?.value ?? 0;
  const balance = ingresos - egresos;
  const balanceReal = payload[0]?.payload?.balanceReal;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2.5 shadow-lg text-xs space-y-1.5 min-w-[160px]">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Ingresos</span>
        <span className="font-medium text-emerald-600 dark:text-emerald-400">
          {CLP.format(ingresos)}
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Egresos</span>
        <span className="font-medium text-red-500">{CLP.format(egresos)}</span>
      </div>
      <div className="flex justify-between gap-4 border-t border-border pt-1 mt-1">
        <span className="text-muted-foreground">Balance</span>
        <span
          className={`font-semibold ${balance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
        >
          {balance >= 0 ? "+" : ""}
          {CLP.format(balance)}
        </span>
      </div>
      {typeof balanceReal === "number" && balanceReal !== balance && (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Balance real</span>
          <span
            className={`font-semibold ${balanceReal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
          >
            {balanceReal >= 0 ? "+" : ""}
            {CLP.format(balanceReal)}
          </span>
        </div>
      )}
    </div>
  );
}

export default function MonthlyFlowChart() {
  const { apiRequest } = useApi();
  const { currency } = useCurrency();

  // Vista REAL (excluye movimientos entre productos propios): las mismas
  // reglas que las cards de Ingresos/Egresos del header — con view=raw las
  // barras verdes sumaban $50M mientras el header decía $9,9M (los pagos de
  // tarjeta y traspasos propios inflaban el gráfico).
  const { data, isLoading } = useQuery<{ months: MonthEntry[] }>({
    queryKey: ["monthly-flow", "real"],
    queryFn: () => apiRequest("GET", "/api/transactions/monthly-flow?view=real"),
    staleTime: 60_000,
  });

  const months = data?.months ?? [];

  if (isLoading) {
    return (
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-52 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (months.length === 0) return null;

  const totalIngresos = months.reduce((s, m) => s + m.ingresos, 0);
  const totalEgresos = months.reduce((s, m) => s + m.egresos, 0);
  const avgBalance = months.length ? Math.round((totalIngresos - totalEgresos) / months.length) : 0;
  const avgRealBalance = months.length
    ? Math.round(months.reduce((s, m) => s + (m.balanceReal ?? m.balance), 0) / months.length)
    : 0;
  const showRealBalance = avgRealBalance !== avgBalance;

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Flujo mensual</CardTitle>
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>
              Balance promedio:{" "}
              <span
                className={`font-semibold ${avgBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
              >
                {avgBalance >= 0 ? "+" : ""}
                {CLP.format(avgBalance)}
              </span>
            </span>
            {showRealBalance && (
              <span className="hidden sm:inline">
                Real:{" "}
                <span
                  className={`font-semibold ${avgRealBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
                >
                  {avgRealBalance >= 0 ? "+" : ""}
                  {CLP.format(avgRealBalance)}
                </span>
              </span>
            )}
          </div>
        </div>
        <CardDescription>
          Flujo real por mes — excluye movimientos entre tus propios productos
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={months}
            barCategoryGap="30%"
            barGap={2}
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => CLP.format(v)}
              width={58}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "hsl(var(--muted))", radius: 6 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(value) => (value === "ingresos" ? "Ingresos" : "Egresos")}
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Bar dataKey="ingresos" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} maxBarSize={40} />
            <Bar dataKey="egresos" fill="hsl(0 84% 60%)" radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
