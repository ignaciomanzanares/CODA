import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth, getPersonalToken, hasPersonalSession } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface CategoryComparison {
  categoria: string;
  lastMonth: number;
  previousMonth: number;
  changePct: number | null;
}

interface MonthlyComparisonData {
  months: string[];
  comparison: CategoryComparison[];
}

const CATEGORY_LABELS: Record<string, string> = {
  alimentacion: "Alimentación",
  transporte: "Transporte",
  entretenimiento: "Entretenimiento",
  telecomunicaciones: "Telecomunicaciones",
  transferencia_enviada: "Transferencias",
  comercio: "Comercio",
  educacion: "Educación",
  salud: "Salud",
  otro: "Otros",
};

const clpFmt = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
}

export default function MonthlyComparisonCard() {
  const { isAuthenticated } = useAuth();

  const { data, isLoading } = useQuery<MonthlyComparisonData>({
    queryKey: ["/api/transactions/monthly-comparison"],
    queryFn: () => {
      const token = getPersonalToken();
      if (!token && !hasPersonalSession()) return Promise.resolve({ months: [], comparison: [] });
      return apiFetch("/api/transactions/monthly-comparison", {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }

  if (!data || data.months.length < 2 || data.comparison.length === 0) return null;

  const lastMonth = data.months[data.months.length - 1];
  const prevMonth = data.months[data.months.length - 2];

  // Only show categories with activity
  const rows = data.comparison.filter(c => c.lastMonth > 0 || c.previousMonth > 0);

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Comparación mensual</CardTitle>
        <CardDescription>
          {formatMonth(prevMonth)} vs {formatMonth(lastMonth)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.categoria}
              className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm"
            >
              <span className="font-medium truncate mr-3">
                {CATEGORY_LABELS[row.categoria] ?? row.categoria}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-muted-foreground text-xs tabular-nums">
                  {clpFmt.format(row.previousMonth)}
                </span>
                <span className="text-foreground font-medium tabular-nums">
                  {clpFmt.format(row.lastMonth)}
                </span>
                {row.changePct != null ? (
                  <span
                    className={cn(
                      "flex items-center gap-0.5 text-xs font-medium min-w-[4rem] justify-end",
                      row.changePct > 0
                        ? "text-rose-600 dark:text-rose-400"
                        : row.changePct < 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground"
                    )}
                  >
                    {row.changePct > 0 ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : row.changePct < 0 ? (
                      <TrendingDown className="h-3.5 w-3.5" />
                    ) : (
                      <Minus className="h-3.5 w-3.5" />
                    )}
                    {row.changePct > 0 ? "+" : ""}
                    {row.changePct}%
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground min-w-[4rem] text-right">Nuevo</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
