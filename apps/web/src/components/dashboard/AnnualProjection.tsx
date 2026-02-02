import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown,
  Calendar,
  Target,
  PiggyBank,
  Wallet,
  ArrowRight,
} from "lucide-react";
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
  monthlyIncome?: number;
  monthlyExpenses?: number;
  currentSavings?: number;
  savingsGoal?: number;
}

export default function AnnualProjection({
  monthlyIncome = 7500,
  monthlyExpenses = 3845,
  currentSavings = 16000,
  savingsGoal = 50000,
}: AnnualProjectionProps) {
  const monthlySavings = monthlyIncome - monthlyExpenses;
  const annualIncome = monthlyIncome * 12;
  const projectedAnnualExpenses = monthlyExpenses * 12;
  const projectedAnnualSavings = monthlySavings * 12;
  const savingsRate = (monthlySavings / monthlyIncome) * 100;
  
  // Calculate months to reach savings goal
  const remainingToGoal = savingsGoal - currentSavings;
  const monthsToGoal = monthlySavings > 0 ? Math.ceil(remainingToGoal / monthlySavings) : Infinity;
  
  // Generate projection data for the year
  const currentMonth = new Date().getMonth();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const projectionData = months.map((month, index) => {
    const isPast = index < currentMonth;
    const isCurrent = index === currentMonth;
    
    // Simulate some variance for past months
    const variance = isPast ? (Math.random() * 0.2 - 0.1) : 0;
    const actualIncome = isPast ? monthlyIncome * (1 + variance * 0.5) : null;
    const actualExpenses = isPast ? monthlyExpenses * (1 + variance) : null;
    
    return {
      month,
      projectedIncome: monthlyIncome,
      projectedExpenses: monthlyExpenses,
      projectedSavings: monthlySavings,
      actualIncome: actualIncome ? Math.round(actualIncome) : undefined,
      actualExpenses: actualExpenses ? Math.round(actualExpenses) : undefined,
      actualSavings: actualIncome && actualExpenses ? Math.round(actualIncome - actualExpenses) : undefined,
      cumulativeSavings: currentSavings + (index - currentMonth + 1) * monthlySavings,
    };
  });

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value}`;
  };

  const formatFullCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3">
          <p className="font-medium text-sm mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatFullCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Annual Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/50 dark:to-green-900/30 border-green-200 dark:border-green-800">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-500 rounded-lg">
                <Wallet className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-medium text-green-800 dark:text-green-300">Annual Income</span>
            </div>
            <p className="text-2xl font-bold text-green-900 dark:text-green-100">
              {formatFullCurrency(annualIncome)}
            </p>
            <p className="text-xs text-green-700 dark:text-green-400 mt-1">
              {formatFullCurrency(monthlyIncome)}/month
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/50 dark:to-red-900/30 border-red-200 dark:border-red-800">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-500 rounded-lg">
                <TrendingDown className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-medium text-red-800 dark:text-red-300">Projected Expenses</span>
            </div>
            <p className="text-2xl font-bold text-red-900 dark:text-red-100">
              {formatFullCurrency(projectedAnnualExpenses)}
            </p>
            <p className="text-xs text-red-700 dark:text-red-400 mt-1">
              {formatFullCurrency(monthlyExpenses)}/month avg
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/30 border-blue-200 dark:border-blue-800">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500 rounded-lg">
                <PiggyBank className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-medium text-blue-800 dark:text-blue-300">Projected Savings</span>
            </div>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {formatFullCurrency(projectedAnnualSavings)}
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
              {savingsRate.toFixed(0)}% savings rate
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/50 dark:to-purple-900/30 border-purple-200 dark:border-purple-800">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-500 rounded-lg">
                <Target className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-medium text-purple-800 dark:text-purple-300">Goal Progress</span>
            </div>
            <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
              {monthsToGoal < 100 ? `${monthsToGoal} mo` : '—'}
            </p>
            <p className="text-xs text-purple-700 dark:text-purple-400 mt-1">
              to reach {formatFullCurrency(savingsGoal)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Projection Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Annual Cash Flow Projection</CardTitle>
              <CardDescription>Projected income, expenses, and savings by month</CardDescription>
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
                  width={60}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  wrapperStyle={{ paddingTop: '20px' }}
                  formatter={(value) => <span className="text-sm text-muted-foreground">{value}</span>}
                />
                <ReferenceLine 
                  x={months[new Date().getMonth()]} 
                  stroke="#888" 
                  strokeDasharray="3 3"
                  label={{ value: 'Today', position: 'top', fontSize: 10 }}
                />
                <Area
                  type="monotone"
                  dataKey="projectedIncome"
                  name="Income"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorIncome)"
                />
                <Area
                  type="monotone"
                  dataKey="projectedExpenses"
                  name="Expenses"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorExpenses)"
                />
                <Area
                  type="monotone"
                  dataKey="projectedSavings"
                  name="Savings"
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

      {/* Savings Goal Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Savings Goal Trajectory
          </CardTitle>
          <CardDescription>
            Tracking progress toward your {formatFullCurrency(savingsGoal)} savings goal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1">
              <div className="flex justify-between text-sm mb-2">
                <span>Current: {formatFullCurrency(currentSavings)}</span>
                <span>Goal: {formatFullCurrency(savingsGoal)}</span>
              </div>
              <div className="h-4 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((currentSavings / savingsGoal) * 100, 100)}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {((currentSavings / savingsGoal) * 100).toFixed(1)}% complete
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-primary">
                {monthsToGoal < 100 ? monthsToGoal : '∞'}
              </p>
              <p className="text-sm text-muted-foreground">months to goal</p>
            </div>
          </div>

          {/* Milestones */}
          <div className="grid grid-cols-4 gap-2">
            {[25, 50, 75, 100].map((milestone) => {
              const milestoneAmount = (savingsGoal * milestone) / 100;
              const isReached = currentSavings >= milestoneAmount;
              const monthsToMilestone = monthlySavings > 0 
                ? Math.max(0, Math.ceil((milestoneAmount - currentSavings) / monthlySavings))
                : Infinity;
              
              return (
                <div 
                  key={milestone}
                  className={`text-center p-3 rounded-lg ${
                    isReached 
                      ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800' 
                      : 'bg-muted/50'
                  }`}
                >
                  <p className={`text-lg font-bold ${isReached ? 'text-green-600' : ''}`}>
                    {milestone}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(milestoneAmount)}
                  </p>
                  <p className="text-xs mt-1">
                    {isReached ? '✓ Reached' : `${monthsToMilestone} mo`}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
