import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getEmpresasCompaniesWithSummary, getEmpresasDashboard, seedEmpresasDemo, type CompanyWithSummary, type DashboardMetrics } from "@/lib/empresasApi";
import { Building2, TrendingUp, TrendingDown, DollarSign, Wallet, RefreshCw, ArrowRight, PlusCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";

export default function EmpresasDashboard() {
  const { currency } = useCurrency();
  const queryClient = useQueryClient();
  const { data: companies, isLoading, error } = useQuery({
    queryKey: ["empresas", "companies-summary"],
    queryFn: getEmpresasCompaniesWithSummary,
  });
  const seedDemo = useMutation({
    mutationFn: seedEmpresasDemo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empresas", "companies-summary"] });
    },
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader><div className="h-6 bg-muted animate-pulse rounded" /></CardHeader>
            <CardContent><div className="h-20 bg-muted animate-pulse rounded" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }
  if (error || !companies?.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">Sin empresas</h2>
          <p className="text-muted-foreground text-sm mb-4">Crea una empresa demo para explorar el dashboard.</p>
          <Button
            onClick={() => seedDemo.mutate()}
            disabled={seedDemo.isPending}
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            {seedDemo.isPending ? "Creando..." : "Crear empresa demo"}
          </Button>
          {seedDemo.isError && (
            <p className="text-destructive text-sm mt-2">Error al crear. Intenta de nuevo.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Resumen por empresa</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {companies.map((company: CompanyWithSummary) => (
          <Link key={company.id} href={`/empresas/companies?id=${company.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  {company.name}
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Caja</span>
                  <span className="font-medium">{formatCurrency(company.summary?.cashBalance ?? 0, currency, { sourceCurrency: "CLP" })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transacciones</span>
                  <span>{company.summary?.transactionCount ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Riesgo</span>
                  <span className={company.summary?.riskRating ? "font-medium" : "text-muted-foreground"}>
                    {company.summary?.riskRating ?? "—"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function EmpresasDashboardCompany({ companyId }: { companyId: number }) {
  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ["empresas", "dashboard", companyId],
    queryFn: () => getEmpresasDashboard(companyId),
  });

  if (isLoading) return <div className="animate-pulse h-48 bg-muted rounded-lg" />;
  if (error || !metrics) return <p className="text-destructive">Error al cargar el dashboard.</p>;

  const m = metrics as DashboardMetrics;
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Ingresos</CardTitle>
          <TrendingUp className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatCurrency(m.revenue, currency, { sourceCurrency: "CLP" })}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Gastos</CardTitle>
          <TrendingDown className="h-4 w-4 text-red-600" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatCurrency(m.expenses, currency, { sourceCurrency: "CLP" })}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Caja</CardTitle>
          <Wallet className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatCurrency(m.cashBalance, currency, { sourceCurrency: "CLP" })}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Margen neto %</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{m.netMargin?.toFixed(1) ?? 0}%</p>
        </CardContent>
      </Card>
    </div>
  );
}
