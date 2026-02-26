import { Card, CardContent } from "@/components/ui/card";
import { 
  Wallet, 
  TrendingUp, 
  CreditCard, 
  PiggyBank,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
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

const ICON_BG = "bg-slate-100";
const ICON_COLOR = "text-slate-600";
const CARD_CLASS = "border border-slate-200/90 shadow-none";

interface StatCardProps {
  title: string;
  value: string;
  subValue?: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: React.ElementType;
}

function StatCard({ title, value, subValue, change, changeType, icon: Icon }: StatCardProps) {
  return (
    <Card className={cn("overflow-hidden hover:shadow-md transition-shadow", CARD_CLASS)}>
      <CardContent className="p-4 sm:p-5 min-h-[88px] sm:min-h-0 flex flex-col justify-center">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-600">{title}</p>
            <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
            {subValue && (
              <p className="text-xs text-slate-600">{subValue}</p>
            )}
            {change && (
              <div className={cn(
                "flex items-center gap-1 text-sm font-medium",
                changeType === 'positive' && "text-green-600",
                changeType === 'negative' && "text-red-600",
                changeType === 'neutral' && "text-slate-600"
              )}>
                {changeType === 'positive' && <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0" />}
                {changeType === 'negative' && <ArrowDownRight className="h-3.5 w-3.5 flex-shrink-0" />}
                {changeType === 'neutral' && <Minus className="h-3.5 w-3.5 flex-shrink-0" />}
                <span className="truncate">{change}</span>
              </div>
            )}
          </div>
          <div className={cn("p-2.5 rounded-xl flex-shrink-0", ICON_BG)}>
            <Icon className={cn("h-5 w-5 sm:h-6 sm:w-6", ICON_COLOR)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FinancialSummaryStats({ data }: FinancialSummaryStatsProps) {
  const { currency, rateUsdToClp } = useCurrency();
  const formatCurrency = (value: number) => {
    if (currency === "CLP" && (value >= 1_000_000 || value <= -1_000_000)) {
      return formatCurrencyShort(value, "CLP");
    }
    if (currency === "USD" && (Math.abs(value) >= 100_000)) {
      return formatCurrencyShort(value, "USD");
    }
    return formatCurrencyUtil(value, currency);
  };

  const netWorthChange = data.netWorth * 0.02;
  const savingsThisMonth = data.monthlyIncome - data.monthlyExpenses;
  const expensesBudgetDiff = data.monthlyIncome * 0.5 - data.monthlyExpenses;
  const budgetStatus = expensesBudgetDiff >= 0 
    ? `${Math.round((expensesBudgetDiff / (data.monthlyIncome * 0.5)) * 100)}% bajo presupuesto`
    : `${Math.round(Math.abs(expensesBudgetDiff / (data.monthlyIncome * 0.5)) * 100)}% sobre presupuesto`;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Lateral: Gastos mensuales + Tasa de ahorro en una sola tarjeta más pequeña */}
      <Card className={cn("overflow-hidden hover:shadow-md transition-shadow", CARD_CLASS)}>
        <CardContent className="p-4 sm:p-5 min-h-[88px] flex flex-col justify-center gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-600">Gastos mensuales</p>
              <p className="text-lg font-bold tracking-tight text-foreground">{formatCurrency(data.monthlyExpenses)}</p>
              <p className="text-xs text-slate-600">Últimos 30 días</p>
              <div className={cn(
                "flex items-center gap-1 text-xs font-medium",
                expensesBudgetDiff >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {expensesBudgetDiff >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                <span className="truncate">{budgetStatus}</span>
              </div>
            </div>
            <div className={cn("p-2.5 rounded-xl flex-shrink-0", ICON_BG)}>
              <CreditCard className={cn("h-5 w-5 sm:h-6 sm:w-6", ICON_COLOR)} />
            </div>
          </div>
          <div className="border-t border-slate-200/80 pt-3 flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-600">Tasa de ahorro</p>
              <p className="text-lg font-bold tracking-tight text-foreground">{data.savingsRate}%</p>
              <p className="text-xs text-slate-600">{formatCurrency(savingsThisMonth)}/mes</p>
              <div className={cn(
                "flex items-center gap-1 text-xs font-medium",
                data.savingsRate >= 20 ? "text-green-600" : "text-red-600"
              )}>
                {data.savingsRate >= 20 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                <span>{data.savingsRate >= 20 ? "En buen camino" : "Por debajo del objetivo"}</span>
              </div>
            </div>
            <div className={cn("p-2.5 rounded-xl flex-shrink-0", ICON_BG)}>
              <PiggyBank className={cn("h-5 w-5 sm:h-6 sm:w-6", ICON_COLOR)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Centro: Saldo total */}
      <StatCard
        title="Saldo total"
        value={formatCurrency(data.totalBalance)}
        subValue={`${data.accountCount} cuentas`}
        change={savingsThisMonth >= 0 ? `+${formatCurrency(savingsThisMonth)} este mes` : `${formatCurrency(savingsThisMonth)} este mes`}
        changeType={savingsThisMonth >= 0 ? 'positive' : 'negative'}
        icon={Wallet}
      />

      {/* Centro: Patrimonio neto */}
      <StatCard
        title="Patrimonio neto"
        value={formatCurrency(data.netWorth)}
        subValue={`${formatCurrency(data.totalAssets)} − ${formatCurrency(data.totalLiabilities)}`}
        change={`+${formatCurrency(netWorthChange)} este mes`}
        changeType="positive"
        icon={TrendingUp}
      />
    </div>
  );
}
