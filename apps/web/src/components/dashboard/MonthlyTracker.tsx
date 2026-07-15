import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Calendar, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";

interface MonthlyData {
  category: string;
  budget: number;
  spent: number;
  color: string;
}

interface HistoricalData {
  month: string;
  spent: number;
  budget: number;
}

interface MonthlyTrackerProps {
  currentMonth?: string;
  totalBudget?: number;
  totalSpent?: number;
  categoryData?: MonthlyData[];
  historicalData?: HistoricalData[];
}

export default function MonthlyTracker({
  currentMonth = new Date().toLocaleDateString("es-CL", { month: "long", year: "numeric" }),
  totalBudget = 0,
  totalSpent = 0,
  categoryData = [],
  historicalData = [],
}: MonthlyTrackerProps) {
  const { currency } = useCurrency();
  const fmt = (value: number) => formatCurrency(value, currency);
  const [selectedMonth, setSelectedMonth] = useState(0); // 0 = current month

  const percentUsed = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const remaining = totalBudget - totalSpent;
  const isOverBudget = totalSpent > totalBudget;
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const currentDay = new Date().getDate();
  const daysRemaining = daysInMonth - currentDay;
  const dailyBudget = daysRemaining > 0 ? remaining / daysRemaining : 0;

  // Calculate projected end-of-month spending
  const avgDailySpend = currentDay > 0 ? totalSpent / currentDay : 0;
  const projectedTotal = avgDailySpend * daysInMonth;
  const projectedOverUnder = projectedTotal - totalBudget;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3">
          <p className="font-medium text-sm mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {fmt(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Month Navigation & Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Seguimiento de presupuesto mensual
              </CardTitle>
              <CardDescription>Compara tus gastos con tu presupuesto</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" disabled>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-medium min-w-[140px] text-center">{currentMonth}</span>
              <Button variant="outline" size="icon" disabled>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Budget Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Presupuesto mensual</p>
              <p className="text-2xl font-bold">{fmt(totalBudget)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Gastado hasta ahora</p>
              <p className={`text-2xl font-bold ${isOverBudget ? "text-red-600" : ""}`}>
                {fmt(totalSpent)}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Restante</p>
              <p
                className={`text-2xl font-bold ${remaining < 0 ? "text-red-600" : "text-green-600"}`}
              >
                {fmt(remaining)}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Presupuesto diario restante</p>
              <p className="text-2xl font-bold">{dailyBudget > 0 ? fmt(dailyBudget) : fmt(0)}</p>
              <p className="text-xs text-muted-foreground">{daysRemaining} días restantes</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2 mb-6">
            <div className="flex justify-between text-sm">
              <span>{percentUsed.toFixed(0)}% del presupuesto usado</span>
              <span className="text-muted-foreground">
                {currentDay} de {daysInMonth} días ({((currentDay / daysInMonth) * 100).toFixed(0)}%
                del mes)
              </span>
            </div>
            <div className="relative">
              <Progress
                value={Math.min(percentUsed, 100)}
                className={`h-4 ${isOverBudget ? "[&>div]:bg-red-500" : ""}`}
              />
              {/* Day marker */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-gray-800 dark:bg-white"
                style={{ left: `${(currentDay / daysInMonth) * 100}%` }}
              />
            </div>
          </div>

          {/* Projection Alert */}
          <div
            className={`flex items-center gap-3 p-4 rounded-lg ${
              projectedOverUnder > 0
                ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
                : "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
            }`}
          >
            {projectedOverUnder > 0 ? (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-400">
                    Se proyecta superar el presupuesto en {fmt(projectedOverUnder)}
                  </p>
                  <p className="text-sm text-amber-600 dark:text-amber-500">
                    Al ritmo actual, gastarás {fmt(projectedTotal)} este mes
                  </p>
                </div>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-800 dark:text-green-400">
                    En camino de ahorrar {fmt(Math.abs(projectedOverUnder))}
                  </p>
                  <p className="text-sm text-green-600 dark:text-green-500">
                    Gasto proyectado: {fmt(projectedTotal)}
                  </p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Category Breakdown & History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Presupuesto por categoría</CardTitle>
            <CardDescription>Cómo vas en cada categoría</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {categoryData.map((cat) => {
              const catPercent = (cat.spent / cat.budget) * 100;
              const isOver = cat.spent > cat.budget;

              return (
                <div key={cat.category} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-medium">{cat.category}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={isOver ? "text-red-600 font-medium" : ""}>
                        {fmt(cat.spent)}
                      </span>
                      <span className="text-muted-foreground">/ {fmt(cat.budget)}</span>
                      {isOver && (
                        <Badge variant="destructive" className="text-xs">
                          Exceso
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Progress
                    value={Math.min(catPercent, 100)}
                    className={`h-2 ${isOver ? "[&>div]:bg-red-500" : ""}`}
                    style={{
                      ["--progress-color" as any]: cat.color,
                    }}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Historical Comparison */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">6-Month History</CardTitle>
            <CardDescription>Your spending vs budget over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={historicalData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${v / 1000}K`}
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={50}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ paddingTop: "10px" }}
                    formatter={(value) => (
                      <span className="text-xs text-muted-foreground capitalize">{value}</span>
                    )}
                  />
                  <Bar
                    dataKey="budget"
                    name="Budget"
                    fill="#e5e7eb"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Bar
                    dataKey="spent"
                    name="Spent"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
