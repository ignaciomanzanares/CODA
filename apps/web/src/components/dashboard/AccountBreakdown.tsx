import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Wallet, 
  PiggyBank, 
  CreditCard, 
  Landmark, 
  TrendingUp,
  ChevronRight,
  Building2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Account {
  id: number;
  name: string;
  balance: number;
  institution?: string;
  limit?: number;
}

interface AccountCategory {
  count: number;
  total: number;
  accounts: Account[];
}

interface AccountsByType {
  checking: AccountCategory;
  savings: AccountCategory;
  creditCards: AccountCategory;
  loans: AccountCategory;
  investments: AccountCategory;
}

interface AccountBreakdownProps {
  data: AccountsByType;
  totalAssets: number;
  totalLiabilities: number;
}

const categoryConfig = {
  checking: {
    label: "Checking Accounts",
    icon: Wallet,
    color: "bg-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    textColor: "text-blue-700 dark:text-blue-400",
    type: "asset",
  },
  savings: {
    label: "Savings",
    icon: PiggyBank,
    color: "bg-green-500",
    bgColor: "bg-green-50 dark:bg-green-950/30",
    textColor: "text-green-700 dark:text-green-400",
    type: "asset",
  },
  investments: {
    label: "Investments",
    icon: TrendingUp,
    color: "bg-purple-500",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
    textColor: "text-purple-700 dark:text-purple-400",
    type: "asset",
  },
  creditCards: {
    label: "Credit Cards",
    icon: CreditCard,
    color: "bg-orange-500",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
    textColor: "text-orange-700 dark:text-orange-400",
    type: "liability",
  },
  loans: {
    label: "Loans & Credit Lines",
    icon: Landmark,
    color: "bg-red-500",
    bgColor: "bg-red-50 dark:bg-red-950/30",
    textColor: "text-red-700 dark:text-red-400",
    type: "liability",
  },
};

export default function AccountBreakdown({ data, totalAssets, totalLiabilities }: AccountBreakdownProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const renderCategory = (key: keyof typeof categoryConfig, category: AccountCategory) => {
    const config = categoryConfig[key];
    const Icon = config.icon;
    const isLiability = config.type === "liability";
    const percentage = isLiability 
      ? (totalLiabilities > 0 ? (category.total / totalLiabilities) * 100 : 0)
      : (totalAssets > 0 ? (category.total / totalAssets) * 100 : 0);

    if (category.count === 0) return null;

    return (
      <div key={key} className={cn("rounded-lg p-4", config.bgColor)}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg", config.color)}>
              <Icon className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="font-medium text-sm">{config.label}</p>
              <p className="text-xs text-muted-foreground">{category.count} account{category.count !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={cn("font-bold", config.textColor)}>
              {isLiability ? '-' : ''}{formatCurrency(category.total)}
            </p>
            <p className="text-xs text-muted-foreground">{percentage.toFixed(0)}% of {isLiability ? 'debt' : 'assets'}</p>
          </div>
        </div>

        {/* Account list */}
        <div className="space-y-2">
          {category.accounts.slice(0, 3).map((account) => (
            <div 
              key={account.id} 
              className="flex items-center justify-between py-2 px-3 bg-background/50 rounded-md"
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-3 w-3 text-muted-foreground" />
                <span className="text-sm truncate max-w-[120px]">{account.name}</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-medium">
                  {isLiability ? '-' : ''}{formatCurrency(account.balance)}
                </span>
                {account.limit && (
                  <div className="mt-1">
                    <Progress 
                      value={(account.balance / account.limit) * 100} 
                      className="h-1 w-16"
                    />
                    <span className="text-xs text-muted-foreground">
                      {((account.balance / account.limit) * 100).toFixed(0)}% used
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {category.accounts.length > 3 && (
            <button className="flex items-center gap-1 text-xs text-primary hover:underline w-full justify-center pt-2">
              View all {category.accounts.length} accounts
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Account Overview</CardTitle>
        <CardDescription>Your accounts by category</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Assets Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-muted-foreground">Assets</h4>
            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
              {formatCurrency(totalAssets)}
            </Badge>
          </div>
          <div className="space-y-3">
            {renderCategory('checking', data.checking)}
            {renderCategory('savings', data.savings)}
            {renderCategory('investments', data.investments)}
          </div>
        </div>

        {/* Liabilities Section */}
        {(data.creditCards.count > 0 || data.loans.count > 0) && (
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-muted-foreground">Liabilities</h4>
              <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
                {formatCurrency(totalLiabilities)}
              </Badge>
            </div>
            <div className="space-y-3">
              {renderCategory('creditCards', data.creditCards)}
              {renderCategory('loans', data.loans)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
