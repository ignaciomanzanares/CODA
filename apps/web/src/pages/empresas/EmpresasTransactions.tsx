import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { getEmpresasCompaniesWithSummary, getEmpresasTransactions } from "@/lib/empresasApi";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";
import { Building2, ArrowDownLeft, ArrowUpRight } from "lucide-react";

export default function EmpresasTransactions() {
  const { currency } = useCurrency();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const companyId = params.get("company_id") ? parseInt(params.get("company_id")!, 10) : null;

  const { data: companies } = useQuery({
    queryKey: ["empresas", "companies-summary"],
    queryFn: getEmpresasCompaniesWithSummary,
  });
  const { data: transactions, isLoading } = useQuery({
    queryKey: ["empresas", "transactions", companyId],
    queryFn: () => getEmpresasTransactions(companyId!),
    enabled: !!companyId,
  });

  if (!companies?.length) {
    return (
      <Card><CardContent className="py-12 text-center text-muted-foreground">No hay empresas. Selecciona una desde Empresas.</CardContent></Card>
    );
  }
  const firstId = companyId ?? (companies as { id: number }[])[0]?.id;
  const selectedId = companyId ?? firstId;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground">Empresa:</span>
        {(companies as { id: number; name: string }[]).map((c) => (
          <a
            key={c.id}
            href={`/empresas/transactions?company_id=${c.id}`}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${selectedId === c.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
          >
            {c.name}
          </a>
        ))}
      </div>
      {!selectedId ? null : isLoading ? (
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3">Fecha</th>
                    <th className="text-left p-3">Cuenta</th>
                    <th className="text-left p-3">Descripción</th>
                    <th className="text-left p-3">Contraparte</th>
                    <th className="text-right p-3">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {(transactions ?? []).map((t: { id: number; transactionDate: string; description: string | null; counterpartyName: string | null; amount: number; accountType?: string | null }) => (
                    <tr key={t.id} className="border-b">
                      <td className="p-3">{t.transactionDate}</td>
                      <td className="p-3 text-muted-foreground">
                        {t.accountType === "credit" ? "Tarjeta/línea" : t.accountType === "savings" ? "Ahorro" : t.accountType === "checking" ? "Corriente" : "—"}
                      </td>
                      <td className="p-3">{t.description ?? "—"}</td>
                      <td className="p-3">{t.counterpartyName ?? "—"}</td>
                      <td className={`p-3 text-right font-medium ${t.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {t.amount >= 0 ? <ArrowDownLeft className="inline h-3 w-3 mr-0.5" /> : <ArrowUpRight className="inline h-3 w-3 mr-0.5" />}
                        {formatCurrency(t.amount, currency, { sourceCurrency: "CLP" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(!transactions || transactions.length === 0) && (
              <p className="p-6 text-center text-muted-foreground">Sin transacciones para esta empresa.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
