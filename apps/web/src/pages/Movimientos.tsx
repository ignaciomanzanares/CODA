import { useState, useRef, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Receipt, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { PastelIcon } from "@/components/ui/pastel-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, API_URL } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import ParsedTransactionsTable from "@/components/ParsedTransactionsTable";

interface TransactionSummary {
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netBalance: number;
    currentBalance: number | null;
    transactionCount: number;
    documentCount: number;
  };
  categoryBreakdown: Record<string, { count: number; total: number }>;
  monthlyData: Array<{ month: string; income: number; expenses: number }>;
}

function formatCLP(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function SummaryCard({
  title,
  amount,
  icon: Icon,
  colorClass,
  subtitle,
  pastelColor = "blue",
}: {
  title: string;
  amount: string;
  icon: React.ElementType;
  colorClass: string;
  subtitle?: string;
  pastelColor?: "blue" | "green" | "red" | "purple" | "orange" | "slate";
}) {
  return (
    <Card className="hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 transition-all">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className={`text-2xl font-bold mt-1 ${colorClass}`}>{amount}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <PastelIcon icon={Icon} color={pastelColor} size="sm" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Movimientos() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const searchString = useSearch();
  const initialCategory = useMemo(() => new URLSearchParams(searchString).get("categoria") ?? undefined, [searchString]);
  const [isUploadingCartolas, setIsUploadingCartolas] = useState(false);
  const cartolaInputRef = useRef<HTMLInputElement>(null);

  const apiBase = (API_URL || "").replace(/\/$/, "");
  const apiUrl = (path: string) => (apiBase ? `${apiBase}${path}` : path);

  // Listen for upload trigger from child components (ParsedTransactionsTable buttons)
  useEffect(() => {
    const handleTriggerUpload = () => cartolaInputRef.current?.click();
    window.addEventListener("trigger-cartola-upload", handleTriggerUpload);
    return () => window.removeEventListener("trigger-cartola-upload", handleTriggerUpload);
  }, []);

  const handleCartolaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !isAuthenticated) return;
    setIsUploadingCartolas(true);
    let successCount = 0;
    const errors: string[] = [];
    for (const file of files) {
      try {
        const token = localStorage.getItem("jwt_token") ?? "";
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(apiUrl("/api/documents/parse-cartola"), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (res.ok) { successCount++; }
        else {
          const body = await res.json().catch(() => ({}));
          errors.push(body.message ?? `Error ${res.status} en ${file.name}`);
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `Error en ${file.name}`);
      }
    }
    setIsUploadingCartolas(false);
    if (successCount > 0) {
      queryClient.removeQueries({ queryKey: ["/api/transactions/parsed"] });
      queryClient.removeQueries({ queryKey: ["/api/transactions/insights"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/documents"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      toast({
        title: `${successCount} cartola${successCount !== 1 ? "s" : ""} procesada${successCount !== 1 ? "s" : ""}`,
        description: errors.length > 0 ? errors[0] : "Tus movimientos ya están disponibles.",
      });
    } else {
      toast({
        title: "Error al subir",
        description: errors[0] ?? "No se pudo procesar ninguna cartola.",
        variant: "destructive",
      });
    }
  };

  const { data: summary, isLoading: isLoadingSummary } = useQuery<TransactionSummary>({
    queryKey: ["/api/transactions/summary"],
    queryFn: async () => {
      const token = localStorage.getItem("jwt_token");
      if (!token) return null;
      return apiFetch("/api/transactions/summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  if (!isAuthenticated) {
    return (
      <div className="container py-8 max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">Movimientos</h2>
            <p className="text-muted-foreground text-sm">
              Inicia sesión para ver todos tus movimientos bancarios de los últimos 90 días.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasData = summary && summary.summary.transactionCount > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <input
        ref={cartolaInputRef}
        type="file"
        multiple
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleCartolaUpload}
      />

      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <PastelIcon icon={Receipt} color="blue" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Movimientos</h1>
            <p className="text-sm text-muted-foreground">
              Todos los movimientos de tus cartolas bancarias
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        {isLoadingSummary ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : hasData ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <SummaryCard
              title="Ingresos Totales"
              amount={formatCLP(summary.summary.totalIncome)}
              icon={TrendingUp}
              colorClass="text-emerald-600 dark:text-emerald-400"
              pastelColor="green"
              subtitle={`${summary.summary.transactionCount} transacciones`}
            />
            <SummaryCard
              title="Egresos Totales"
              amount={formatCLP(summary.summary.totalExpenses)}
              icon={TrendingDown}
              colorClass="text-red-600 dark:text-red-400"
              pastelColor="red"
            />
            <SummaryCard
              title="Balance Neto"
              amount={formatCLP(summary.summary.netBalance)}
              icon={Wallet}
              colorClass={summary.summary.netBalance >= 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"}
              pastelColor={summary.summary.netBalance >= 0 ? "blue" : "orange"}
              subtitle="Ingresos − Egresos"
            />
            <SummaryCard
              title="Saldo Actual"
              amount={summary.summary.currentBalance !== null ? formatCLP(summary.summary.currentBalance) : "N/A"}
              icon={Receipt}
              colorClass="text-violet-600 dark:text-violet-400"
              pastelColor="purple"
              subtitle={`Desde ${summary.summary.documentCount} cartola${summary.summary.documentCount !== 1 ? "s" : ""}`}
            />
          </div>
        ) : null}

        <ParsedTransactionsTable mode="movimientos" initialCategory={initialCategory} />
      </div>
    </div>
  );
}
