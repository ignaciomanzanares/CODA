import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEmpresasCompaniesWithSummary, getEmpresasRisk } from "@/lib/empresasApi";
import { Shield } from "lucide-react";

export default function EmpresasRisk() {
  const search = useSearch();
  const companyId = new URLSearchParams(search).get("company_id")
    ? parseInt(new URLSearchParams(search).get("company_id")!, 10)
    : null;
  const { data: companies } = useQuery({
    queryKey: ["empresas", "companies-summary"],
    queryFn: getEmpresasCompaniesWithSummary,
  });
  const { data: risk, isLoading } = useQuery({
    queryKey: ["empresas", "risk", companyId],
    queryFn: () => getEmpresasRisk(companyId!),
    enabled: !!companyId,
  });

  const firstId = companies?.length ? (companies as { id: number }[])[0]?.id : null;
  const selectedId = companyId ?? firstId;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground">Empresa:</span>
        {(companies ?? []).map((c: { id: number; name: string }) => (
          <a
            key={c.id}
            href={`/empresas/risk?company_id=${c.id}`}
            className={`px-3 py-1.5 rounded-md text-sm ${selectedId === c.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            {c.name}
          </a>
        ))}
      </div>
      {selectedId &&
        (isLoading ? (
          <div className="h-48 bg-muted animate-pulse rounded-lg" />
        ) : risk ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Riesgo: {(risk as { rating?: string }).rating ?? "—"} (score{" "}
                {(risk as { numericScore?: number }).numericScore ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(risk as { factors?: Array<{ name: string; score: number; status: string }> })
                .factors?.length ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Factores</p>
                  <ul className="text-sm space-y-1">
                    {(
                      (risk as { factors: Array<{ name: string; score: number; status: string }> })
                        .factors ?? []
                    ).map((f, i) => (
                      <li key={i} className="flex justify-between">
                        <span>{f.name}</span>
                        <span>
                          {f.score} ({f.status})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {(risk as { redFlags?: string[] }).redFlags?.length ? (
                <div>
                  <p className="text-sm font-medium text-destructive">Alertas</p>
                  <ul className="text-sm list-disc pl-4">
                    {(risk as { redFlags: string[] }).redFlags.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Sin evaluación de riesgo para esta empresa.
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
