import { Card, CardContent } from "@/components/ui/card";
import { 
  Wallet, 
  TrendingUp, 
  CreditCard, 
  PiggyBank,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Building2,
  Percent,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FinancialSummary {
  totalBalance: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  savingsRate: number;
  accountCount: number;
}

interface FinancialSummaryStatsProps {
  data: FinancialSummary;
}

interface StatCardProps {
  title: string;
  value: string;
  subValue?: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: React.ElementType;
  color: string;
}

function StatCard({ title, value, subValue, change, changeType, icon: Icon, color }: StatCardProps) {
  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {subValue && (
              <p className="text-xs text-muted-foreground">{subValue}</p>
            )}
            {change && (
              <div className={cn(
                "flex items-center gap-1 text-sm font-medium",
                changeType === 'positive' && "text-green-600",
                changeType === 'negative' && "text-red-600",
                changeType === 'neutral' && "text-muted-foreground"
              )}>
                {changeType === 'positive' && <ArrowUpRight className="h-4 w-4" />}
                {changeType === 'negative' && <ArrowDownRight className="h-4 w-4" />}
                {changeType === 'neutral' && <Minus className="h-4 w-4" />}
                <span>{change}</span>
              </div>
            )}
          </div>
          <div className={cn("p-3 rounded-xl", color)}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FinancialSummaryStats({ data }: FinancialSummaryStatsProps) {
  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    }
    if (value >= 100000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Calculate month-over-month changes (simulated for demo)
  const netWorthChange = data.netWorth * 0.02; // ~2% monthly growth
  const savingsThisMonth = data.monthlyIncome - data.monthlyExpenses;
  const expensesBudgetDiff = data.monthlyIncome * 0.5 - data.monthlyExpenses; // Assuming 50% budget
  const budgetStatus = expensesBudgetDiff >= 0 
    ? `${Math.round((expensesBudgetDiff / (data.monthlyIncome * 0.5)) * 100)}% under budget`
    : `${Math.round(Math.abs(expensesBudgetDiff / (data.monthlyIncome * 0.5)) * 100)}% over budget`;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Total Balance"
        value={formatCurrency(data.totalBalance)}
        subValue={`${data.accountCount} accounts`}
        change={savingsThisMonth >= 0 ? `+${formatCurrency(savingsThisMonth)} this month` : `${formatCurrency(savingsThisMonth)} this month`}
        changeType={savingsThisMonth >= 0 ? 'positive' : 'negative'}
        icon={Wallet}
        color="bg-blue-500"
      />
      <StatCard
        title="Monthly Spending"
        value={formatCurrency(data.monthlyExpenses)}
        subValue="Last 30 days"
        change={budgetStatus}
        changeType={expensesBudgetDiff >= 0 ? 'positive' : 'negative'}
        icon={CreditCard}
        color="bg-purple-500"
      />
      <StatCard
        title="Savings Rate"
        value={`${data.savingsRate}%`}
        subValue={`${formatCurrency(savingsThisMonth)}/month`}
        change={data.savingsRate >= 20 ? "On track" : "Below target"}
        changeType={data.savingsRate >= 20 ? 'positive' : 'negative'}
        icon={PiggyBank}
        color="bg-green-500"
      />
      <StatCard
        title="Net Worth"
        value={formatCurrency(data.netWorth)}
        subValue={`${formatCurrency(data.totalAssets)} - ${formatCurrency(data.totalLiabilities)}`}
        change={`+${formatCurrency(netWorthChange)} this month`}
        changeType="positive"
        icon={TrendingUp}
        color="bg-orange-500"
      />
    </div>
  );
}
