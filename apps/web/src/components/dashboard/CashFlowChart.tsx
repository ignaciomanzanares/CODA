import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

interface CashFlowData {
  month: string;
  income: number;
  expenses: number;
}

interface CashFlowChartProps {
  data: CashFlowData[];
  monthlyIncome: number;
  monthlyExpenses: number;
}

export default function CashFlowChart({ data, monthlyIncome, monthlyExpenses }: CashFlowChartProps) {
  const netCashFlow = monthlyIncome - monthlyExpenses;
  const isPositive = netCashFlow >= 0;

  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value}`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const income = payload.find((p: any) => p.dataKey === 'income')?.value || 0;
      const expenses = payload.find((p: any) => p.dataKey === 'expenses')?.value || 0;
      const net = income - expenses;
      
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3">
          <p className="font-medium text-sm mb-2">{label}</p>
          <p className="text-sm text-green-600">Ingresos: {formatCurrency(income)}</p>
          <p className="text-sm text-red-500">Gastos: {formatCurrency(expenses)}</p>
          <div className="border-t mt-2 pt-2">
            <p className={`text-sm font-medium ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              Neto: {net >= 0 ? '+' : ''}{formatCurrency(net)}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Flujo de caja mensual</CardTitle>
            <CardDescription>Ingresos vs gastos</CardDescription>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Este mes</p>
            <div className={`flex items-center justify-end gap-1 text-lg font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
              <span>{isPositive ? '+' : ''}{formatCurrency(netCashFlow)}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
            <p className="text-xs text-green-600 font-medium">Ingresos</p>
            <p className="text-xl font-bold text-green-700 dark:text-green-400">
              {formatCurrency(monthlyIncome)}
            </p>
          </div>
          <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
            <p className="text-xs text-red-600 font-medium">Gastos</p>
            <p className="text-xl font-bold text-red-700 dark:text-red-400">
              {formatCurrency(monthlyExpenses)}
            </p>
          </div>
        </div>

        {/* Chart */}
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                tickFormatter={formatCurrency}
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: '10px' }}
                formatter={(value) => <span className="text-xs text-muted-foreground capitalize">{value}</span>}
              />
              <Bar 
                dataKey="income" 
                name="Ingresos"
                fill="#22c55e" 
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
              <Bar 
                dataKey="expenses" 
                name="Gastos"
                fill="#ef4444" 
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
