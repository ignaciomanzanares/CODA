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
import { cn, formatCurrency as formatCurrencyUtil, formatCurrencyShort } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";

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
  const { currency, rateUsdToClp } = useCurrency();
  // rateUsdToClp hace que al cargar la tasa en tiempo real se re-renderice y se use en formatCurrency
  const formatCurrency = (value: number) => {
    if (currency === "CLP" && (value >= 1_000_000 || value <= -1_000_000)) {
      return formatCurrencyShort(value, "CLP");
    }
    if (currency === "USD" && (Math.abs(value) >= 100_000)) {
      return formatCurrencyShort(value, "USD");
    }
    return formatCurrencyUtil(value, currency);
  };

  const netWorthChange = 0;
    const savingsThisMonth = data.monthlyIncome - data.monthlyExpenses;
  const expensesBudgetDiff = data.monthlyIncome * 0.5 - data.monthlyExpenses;
  const budgetStatus = expensesBudgetDiff >= 0 
    ? `${Math.round((expensesBudgetDiff / (data.monthlyIncome * 0.5)) * 100)}% bajo presupuesto`
    : `${Math.round(Math.abs(expensesBudgetDiff / (data.monthlyIncome * 0.5)) * 100)}% sobre presupuesto`;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Saldo total"
        value={formatCurrency(data.totalBalance)}
        subValue={`${data.accountCount} cuentas`}
        change={savingsThisMonth >= 0 ? `+${formatCurrency(savingsThisMonth)} este mes` : `${formatCurrency(savingsThisMonth)} este mes`}
        changeType={savingsThisMonth >= 0 ? 'positive' : 'negative'}
        icon={Wallet}
        color="bg-blue-500"
      />
      <StatCard
        title="Gastos mensuales"
        value={formatCurrency(data.monthlyExpenses)}
        subValue="Últimos 30 días"
        change={budgetStatus}
        changeType={expensesBudgetDiff >= 0 ? 'positive' : 'negative'}
        icon={CreditCard}
        color="bg-purple-500"
      />
      <StatCard
        title="Tasa de ahorro"
        value={`${data.savingsRate}%`}
        subValue={`${formatCurrency(savingsThisMonth)}/mes`}
        change={data.savingsRate >= 20 ? "En buen camino" : "Por debajo del objetivo"}
        changeType={data.savingsRate >= 20 ? 'positive' : 'negative'}
        icon={PiggyBank}
        color="bg-green-500"
      />
      <StatCard
        title="Patrimonio neto"
        value={formatCurrency(data.netWorth)}
        subValue={`${formatCurrency(data.totalAssets)} - ${formatCurrency(data.totalLiabilities)}`}
        change={`+${formatCurrency(netWorthChange)} este mes`}
        changeType="positive"
        icon={TrendingUp}
        color="bg-orange-500"
      />
    </div>
  );
}
