import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { getEmpresasCompaniesWithSummary, getEmpresasReconciliation, runEmpresasReconciliation } from "@/lib/empresasApi";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

export default function EmpresasReconciliation() {
  const search = useSearch();
  const companyId = new URLSearchParams(search).get("company_id") ? parseInt(new URLSearchParams(search).get("company_id")!, 10) : null;
  const { data: companies } = useQuery({ queryKey: ["empresas", "companies-summary"], queryFn: getEmpresasCompaniesWithSummary });
  const { data: recon, isLoading, refetch } = useQuery({
    queryKey: ["empresas", "reconciliation", companyId],
    queryFn: () => getEmpresasReconciliation(companyId!),
    enabled: !!companyId,
  });
  const [running, setRunning] = useState(false);

  const firstId = companies?.length ? (companies as { id: number }[])[0]?.id : null;
  const selectedId = companyId ?? firstId;

  const handleRun = async () => {
    if (!selectedId) return;
    setRunning(true);
    try {
      await runEmpresasReconciliation(selectedId);
      refetch();
    } finally {
      setRunning(false);
    }
  };

  const summary = recon as { summary?: { matchedCount: number; unmatchedTransactionCount: number; totalTransactions: number } } | undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground">Empresa:</span>
        {(companies ?? []).map((c: { id: number; name: string }) => (
          <a key={c.id} href={`/empresas/reconciliation?company_id=${c.id}`} className={`px-3 py-1.5 rounded-md text-sm ${selectedId === c.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{c.name}</a>
        ))}
      </div>
      {selectedId && (
        <>
          <div className="flex items-center gap-2">
            <Button onClick={handleRun} disabled={running}>
              <RefreshCw className={`h-4 w-4 mr-2 ${running ? "animate-spin" : ""}`} />
              {running ? "Ejecutando…" : "Ejecutar reconciliación"}
            </Button>
          </div>
          {isLoading ? (
            <div className="h-48 bg-muted animate-pulse rounded-lg" />
          ) : summary?.summary ? (
            <Card>
              <CardContent className="pt-6">
                <p><strong>Emparejados:</strong> {summary.summary.matchedCount} de {summary.summary.totalTransactions} transacciones.</p>
                <p className="text-muted-foreground">Sin emparejar: {summary.summary.unmatchedTransactionCount}.</p>
              </CardContent>
            </Card>
          ) : (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Sin datos de reconciliación. Ejecuta la reconciliación arriba.</CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}
