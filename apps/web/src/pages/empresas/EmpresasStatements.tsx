import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { getEmpresasCompaniesWithSummary, getEmpresasStatements } from "@/lib/empresasApi";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";

export default function EmpresasStatements() {
  const { currency } = useCurrency();
  const search = useSearch();
  const companyId = new URLSearchParams(search).get("company_id") ? parseInt(new URLSearchParams(search).get("company_id")!, 10) : null;
  const { data: companies } = useQuery({ queryKey: ["empresas", "companies-summary"], queryFn: getEmpresasCompaniesWithSummary });
  const { data: statements, isLoading } = useQuery({
    queryKey: ["empresas", "statements", companyId],
    queryFn: () => getEmpresasStatements(companyId!),
    enabled: !!companyId,
  });

  const firstId = companies?.length ? (companies as { id: number }[])[0]?.id : null;
  const selectedId = companyId ?? firstId;
  const st = statements as { period?: string; incomeStatement?: Array<{ label: string; amount: number }>; cashFlow?: Array<{ label: string; amount: number }>; balanceSheet?: Array<{ label: string; amount: number }> } | undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground">Empresa:</span>
        {(companies ?? []).map((c: { id: number; name: string }) => (
          <a key={c.id} href={`/empresas/statements?company_id=${c.id}`} className={`px-3 py-1.5 rounded-md text-sm ${selectedId === c.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{c.name}</a>
        ))}
      </div>
      {selectedId && (isLoading ? (
        <div className="h-48 bg-muted animate-pulse rounded-lg" />
      ) : st ? (
        <div className="grid gap-4 md:grid-cols-3">
          {st.incomeStatement?.length ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Estado de resultado</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                {st.incomeStatement.slice(0, 8).map((line: { label: string; amount: number }, i: number) => (
                  <div key={i} className="flex justify-between"><span>{line.label}</span><span>{formatCurrency(line.amount, currency, { sourceCurrency: "CLP" })}</span></div>
                ))}
              </CardContent>
            </Card>
          ) : null}
          {st.cashFlow?.length ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Flujo de caja</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                {st.cashFlow.slice(0, 6).map((line: { label: string; amount: number }, i: number) => (
                  <div key={i} className="flex justify-between"><span>{line.label}</span><span>{formatCurrency(line.amount, currency, { sourceCurrency: "CLP" })}</span></div>
                ))}
              </CardContent>
            </Card>
          ) : null}
          {st.balanceSheet?.length ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Balance</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                {st.balanceSheet.slice(0, 6).map((line: { label: string; amount: number }, i: number) => (
                  <div key={i} className="flex justify-between"><span>{line.label}</span><span>{formatCurrency(line.amount, currency, { sourceCurrency: "CLP" })}</span></div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Sin estados para este período.</CardContent></Card>
      ))}
    </div>
  );
}
