import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEmpresasCompaniesWithSummary, type CompanyWithSummary } from "@/lib/empresasApi";
import { Building2, ArrowRight, Wallet, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

function getRiskBadgeClass(rating: string | null): string {
  switch (rating) {
    case "A": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "B": return "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-400";
    case "C": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "D": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
    case "E": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function EmpresasCompanies() {
  const { data: companies, isLoading, error } = useQuery({
    queryKey: ["empresas", "companies-summary"],
    queryFn: getEmpresasCompaniesWithSummary,
  });

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}><CardContent className="py-12"><div className="h-32 bg-muted animate-pulse rounded" /></CardContent></Card>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <Card><CardContent className="py-8 text-center text-destructive">Error al cargar empresas.</CardContent></Card>
    );
  }
  if (!companies?.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Building2 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold mb-2">No hay empresas registradas</h2>
          <p className="text-muted-foreground">Ejecuta el seed de la base de datos para crear datos de prueba.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Empresas</h2>
      <p className="text-muted-foreground text-sm">Selecciona una empresa para ver su dashboard y datos.</p>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {(companies as CompanyWithSummary[]).map((company) => (
          <Link key={company.id} href={`/empresas/dashboard?company=${company.id}`}>
            <Card className="hover:shadow-lg transition-all hover:border-primary/50 cursor-pointer h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{company.name}</CardTitle>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${getRiskBadgeClass(company.summary?.riskRating ?? null)}`}>
                    {company.summary?.riskRating ?? "—"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">RUT {company.rut}</p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <span>{formatCurrency(company.summary?.cashBalance ?? 0)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span>{company.summary?.transactionCount ?? 0} transacciones · {company.summary?.invoiceCount ?? 0} documentos</span>
                </div>
              </CardContent>
              <CardContent className="pt-0">
                <span className="inline-flex items-center gap-1 text-primary font-medium text-sm">
                  Ver dashboard <ArrowRight className="h-3 w-3" />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
