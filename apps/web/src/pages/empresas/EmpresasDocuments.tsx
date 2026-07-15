import { useState } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getEmpresasCompaniesWithSummary,
  getEmpresasDocuments,
  createEmpresasDocument,
} from "@/lib/empresasApi";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";
import { FileText, ArrowUpRight, ArrowDownRight, Plus } from "lucide-react";

export default function EmpresasDocuments() {
  const { currency } = useCurrency();
  const search = useSearch();
  const queryClient = useQueryClient();
  const companyId = new URLSearchParams(search).get("company_id")
    ? parseInt(new URLSearchParams(search).get("company_id")!, 10)
    : null;
  const { data: companies } = useQuery({
    queryKey: ["empresas", "companies-summary"],
    queryFn: getEmpresasCompaniesWithSummary,
  });
  const { data: documents, isLoading } = useQuery({
    queryKey: ["empresas", "documents", companyId],
    queryFn: () => getEmpresasDocuments(companyId!),
    enabled: !!companyId,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [receiverRut, setReceiverRut] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [netAmount, setNetAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");

  const createDte = useMutation({
    mutationFn: (companyId: number) =>
      createEmpresasDocument({
        companyId,
        receiverRut: receiverRut.trim(),
        receiverName: receiverName.trim() || undefined,
        netAmount: parseFloat(netAmount) || 0,
        vatAmount: vatAmount !== "" ? parseFloat(vatAmount) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empresas", "documents"] });
      setDialogOpen(false);
      setReceiverRut("");
      setReceiverName("");
      setNetAmount("");
      setVatAmount("");
    },
  });

  const firstId = companies?.length ? (companies as { id: number }[])[0]?.id : null;
  const selectedId = companyId ?? firstId;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documentos tributarios (DTE)
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Emisión y recepción de documentos. Orden y almacenamiento.
          </p>
        </div>
        {selectedId && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Emitir DTE
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Emitir DTE</DialogTitle>
                <DialogDescription>
                  Crear una factura (DTE emitido) para la empresa seleccionada. El emisor será la
                  empresa.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="receiverRut">RUT receptor *</Label>
                  <Input
                    id="receiverRut"
                    placeholder="12.345.678-9"
                    value={receiverRut}
                    onChange={(e) => setReceiverRut(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="receiverName">Nombre receptor</Label>
                  <Input
                    id="receiverName"
                    placeholder="Cliente o razón social"
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="netAmount">Monto neto (CLP) *</Label>
                  <Input
                    id="netAmount"
                    type="number"
                    min={0}
                    placeholder="1000000"
                    value={netAmount}
                    onChange={(e) => setNetAmount(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="vatAmount">IVA (CLP, opcional)</Label>
                  <Input
                    id="vatAmount"
                    type="number"
                    min={0}
                    placeholder="19% por defecto"
                    value={vatAmount}
                    onChange={(e) => setVatAmount(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  disabled={!receiverRut.trim() || !netAmount || createDte.isPending}
                  onClick={() => selectedId && createDte.mutate(selectedId)}
                >
                  {createDte.isPending ? "Emitiendo…" : "Emitir"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
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
      {selectedId &&
        (isLoading ? (
          <div className="h-48 bg-muted animate-pulse rounded-lg" />
        ) : documents && documents.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Listado de DTE</CardTitle>
              <CardDescription>
                Ordenados por fecha de emisión (más recientes primero)
              </CardDescription>
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
                        <td className="py-2 pr-2">
                          {d.documentType} #{d.folio}
                        </td>
                        <td className="py-2 pr-2">
                          <span
                            className={
                              d.direction === "issued"
                                ? "text-green-600 flex items-center gap-0.5"
                                : "text-blue-600 flex items-center gap-0.5"
                            }
                          >
                            {d.direction === "issued" ? (
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowDownRight className="h-3.5 w-3.5" />
                            )}
                            {d.direction === "issued" ? "Emitido" : "Recibido"}
                          </span>
                        </td>
                        <td className="py-2 pr-2 max-w-[180px] truncate">
                          {d.direction === "issued"
                            ? d.receiverName || d.receiverRut
                            : d.emitterName || d.emitterRut}
                        </td>
                        <td className="py-2 pr-2 text-right">
                          {formatCurrency(d.totalAmount, currency, { sourceCurrency: "CLP" })}
                        </td>
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
              <p>
                No hay documentos DTE. Emite uno con &quot;Emitir DTE&quot; o sincroniza con SII
                desde Conectores.
              </p>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
