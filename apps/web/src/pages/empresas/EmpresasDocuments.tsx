import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getEmpresasCompaniesWithSummary, getEmpresasDocuments } from "@/lib/empresasApi";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";
import { FileText, ArrowUpRight, ArrowDownRight } from "lucide-react";

export default function EmpresasDocuments() {
  const { currency } = useCurrency();
  const search = useSearch();
  const companyId = new URLSearchParams(search).get("company_id") ? parseInt(new URLSearchParams(search).get("company_id")!, 10) : null;
  const { data: companies } = useQuery({ queryKey: ["empresas", "companies-summary"], queryFn: getEmpresasCompaniesWithSummary });
  const { data: documents, isLoading } = useQuery({
    queryKey: ["empresas", "documents", companyId],
    queryFn: () => getEmpresasDocuments(companyId!),
    enabled: !!companyId,
  });

  const firstId = companies?.length ? (companies as { id: number }[])[0]?.id : null;
  const selectedId = companyId ?? firstId;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documentos tributarios (DTE)
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Emisión y recepción de documentos. Orden y almacenamiento.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground">Empresa:</span>
        {(companies ?? []).map((c: { id: number; name: string }) => (
          <a
            key={c.id}
            href={`/empresas/documents?company_id=${c.id}`}
            className={`px-3 py-1.5 rounded-md text-sm ${selectedId === c.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            {c.name}
          </a>
        ))}
      </div>
      {selectedId && (
        isLoading ? (
          <div className="h-48 bg-muted animate-pulse rounded-lg" />
        ) : documents && documents.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Listado de DTE</CardTitle>
              <CardDescription>Ordenados por fecha de emisión (más recientes primero)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-2 font-medium">Fecha</th>
                      <th className="pb-2 pr-2 font-medium">Tipo / Folio</th>
                      <th className="pb-2 pr-2 font-medium">Dirección</th>
                      <th className="pb-2 pr-2 font-medium">Emisor / Receptor</th>
                      <th className="pb-2 pr-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((d) => (
                      <tr key={d.id} className="border-b last:border-0">
                        <td className="py-2 pr-2 whitespace-nowrap">{d.issueDate}</td>
                        <td className="py-2 pr-2">{d.documentType} #{d.folio}</td>
                        <td className="py-2 pr-2">
                          <span className={d.direction === "issued" ? "text-green-600 flex items-center gap-0.5" : "text-blue-600 flex items-center gap-0.5"}>
                            {d.direction === "issued" ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                            {d.direction === "issued" ? "Emitido" : "Recibido"}
                          </span>
                        </td>
                        <td className="py-2 pr-2 max-w-[180px] truncate">
                          {d.direction === "issued" ? (d.receiverName || d.receiverRut) : (d.emitterName || d.emitterRut)}
                        </td>
                        <td className="py-2 pr-2 text-right">{formatCurrency(d.totalAmount, currency, { sourceCurrency: "CLP" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No hay documentos DTE. Sincroniza con SII desde Conectores.</p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
