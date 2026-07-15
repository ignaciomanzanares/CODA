import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, Calendar, Target, PiggyBank, Wallet } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

interface AnnualProjectionProps {
  monthlyIncome: number;
  monthlyExpenses: number;
  currentSavings: number;
  savingsGoal: number | null;
}

const MONTHS_ES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export default function AnnualProjection({
  monthlyIncome,
  monthlyExpenses,
  currentSavings,
  savingsGoal,
}: AnnualProjectionProps) {
  const monthlySavings = monthlyIncome - monthlyExpenses;
  const annualIncome = monthlyIncome * 12;
  const projectedAnnualExpenses = monthlyExpenses * 12;
  const projectedAnnualSavings = monthlySavings * 12;
  const savingsRate = monthlyIncome > 0 ? (monthlySavings / monthlyIncome) * 100 : 0;

  const goal = savingsGoal != null && savingsGoal > 0 ? savingsGoal : null;
  const remainingToGoal = goal != null ? goal - currentSavings : null;
  const monthsToGoal =
    goal != null && remainingToGoal != null && monthlySavings > 0
      ? Math.ceil(remainingToGoal / monthlySavings)
      : goal != null && remainingToGoal != null && remainingToGoal <= 0
        ? 0
        : Infinity;

  const currentMonth = new Date().getMonth();

  const projectionData = MONTHS_ES.map((month) => ({
    month,
    projectedIncome: monthlyIncome,
    projectedExpenses: monthlyExpenses,
    projectedSavings: monthlySavings,
  }));

  const formatCurrency = (value: number) => {
    if (!Number.isFinite(value)) return "—";
    if (Math.abs(value) >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1000) {
      return `${(value / 1000).toFixed(0)}k`;
    }
    return `${Math.round(value)}`;
  };

  const formatFullCurrency = (value: number) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(value));

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: { value: number; name: string; color: string }[];
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3">
          <p className="font-medium text-sm mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatFullCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const hasAnyData =
    monthlyIncome > 0 || monthlyExpenses > 0 || currentSavings > 0 || (goal != null && goal > 0);

  if (!hasAnyData) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="font-medium text-foreground">Sin datos para proyectar</p>
          <p className="text-sm mt-2">
            Cuando tengas ingresos y gastos estimados (movimientos o gastos registrados), aquí verás
            una proyección anual sin cifras inventadas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/50 dark:to-green-900/30 border-green-200 dark:border-green-800">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-500 rounded-lg">
                <Wallet className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-medium text-green-800 dark:text-green-300">
                Ingresos anuales (proy.)
              </span>
            </div>
            <p className="text-2xl font-bold text-green-900 dark:text-green-100">
              {formatFullCurrency(annualIncome)}
            </p>
            <p className="text-xs text-green-700 dark:text-green-400 mt-1">
              {formatFullCurrency(monthlyIncome)}/mes (base período reciente)
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/50 dark:to-red-900/30 border-red-200 dark:border-red-800">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-500 rounded-lg">
                <TrendingDown className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-medium text-red-800 dark:text-red-300">
                Gastos anuales (proy.)
              </span>
            </div>
            <p className="text-2xl font-bold text-red-900 dark:text-red-100">
              {formatFullCurrency(projectedAnnualExpenses)}
            </p>
            <p className="text-xs text-red-700 dark:text-red-400 mt-1">
              {formatFullCurrency(monthlyExpenses)}/mes prom.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/30 border-blue-200 dark:border-blue-800">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500 rounded-lg">
                <PiggyBank className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                Ahorro anual (proy.)
              </span>
            </div>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {formatFullCurrency(projectedAnnualSavings)}
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
              {savingsRate.toFixed(0)}% tasa de ahorro
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/50 dark:to-purple-900/30 border-purple-200 dark:border-purple-800">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-500 rounded-lg">
                <Target className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-medium text-purple-800 dark:text-purple-300">
                Meta de ahorro
              </span>
            </div>
            <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
              {goal != null ? (monthsToGoal < 200 ? `${monthsToGoal} mes` : "—") : "—"}
            </p>
            <p className="text-xs text-purple-700 dark:text-purple-400 mt-1">
              {goal != null ? `hasta ${formatFullCurrency(goal)}` : "Define una meta en Metas"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Flujo mensual proyectado ({new Date().getFullYear()})</CardTitle>
              <CardDescription>
                Basado en ingresos y gastos recientes (cuentas / movimientos), sin variación
                aleatoria.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="text-xs">
              <Calendar className="h-3 w-3 mr-1" />
              {new Date().getFullYear()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projectionData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis
                  tickFormatter={formatCurrency}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ paddingTop: "20px" }}
                  formatter={(value) => (
                    <span className="text-sm text-muted-foreground">{value}</span>
                  )}
                />
                <ReferenceLine
                  x={MONTHS_ES[currentMonth]}
                  stroke="#888"
                  strokeDasharray="3 3"
                  label={{ value: "Hoy", position: "top", fontSize: 10 }}
                />
                <Area
                  type="monotone"
                  dataKey="projectedIncome"
                  name="Ingresos"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorIncome)"
                />
                <Area
                  type="monotone"
                  dataKey="projectedExpenses"
                  name="Gastos"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorExpenses)"
                />
                <Area
                  type="monotone"
                  dataKey="projectedSavings"
                  name="Ahorro neto"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorSavings)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {goal != null && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Avance hacia la meta
            </CardTitle>
            <CardDescription>
              Meta: {formatFullCurrency(goal)} · Actual estimado en cuentas:{" "}
              {formatFullCurrency(currentSavings)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-2">
                  <span>Actual: {formatFullCurrency(currentSavings)}</span>
                  <span>Meta: {formatFullCurrency(goal)}</span>
                </div>
                <div className="h-4 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min((currentSavings / goal) * 100, 100)}%`,
                    }}
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {((currentSavings / goal) * 100).toFixed(1)}% completado
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-primary">
                  {monthsToGoal < 200 ? monthsToGoal : "∞"}
                </p>
                <p className="text-sm text-muted-foreground">meses estimados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
