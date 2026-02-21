import { useState } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getEmpresasCompaniesWithSummary,
  getEmpresasPurchaseOrders,
  getEmpresasPurchaseOrdersByVendor,
  getEmpresasDocuments,
  linkPurchaseOrderToDte,
  type PurchaseOrder,
  type DTEDocument,
} from "@/lib/empresasApi";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";
import { FileText, Link2, Building2, CheckCircle } from "lucide-react";

export default function EmpresasPurchaseOrders() {
  const { currency } = useCurrency();
  const queryClient = useQueryClient();
  const search = useSearch();
  const companyId = new URLSearchParams(search).get("company_id") ? parseInt(new URLSearchParams(search).get("company_id")!, 10) : null;

  const [linkPoId, setLinkPoId] = useState<number | null>(null);
  const [linkDteId, setLinkDteId] = useState<number | null>(null);

  const { data: companies } = useQuery({
    queryKey: ["empresas", "companies-summary"],
    queryFn: getEmpresasCompaniesWithSummary,
  });
  const { data: orders } = useQuery({
    queryKey: ["empresas", "purchase-orders", companyId],
    queryFn: () => getEmpresasPurchaseOrders(companyId!),
    enabled: !!companyId,
  });
  const { data: byVendor } = useQuery({
    queryKey: ["empresas", "purchase-orders-by-vendor", companyId],
    queryFn: () => getEmpresasPurchaseOrdersByVendor(companyId!),
    enabled: !!companyId,
  });
  const { data: documents } = useQuery({
    queryKey: ["empresas", "documents", companyId],
    queryFn: () => getEmpresasDocuments(companyId!),
    enabled: !!companyId && linkPoId != null,
  });

  const linkMutation = useMutation({
    mutationFn: ({ poId, dteId }: { poId: number; dteId: number }) => linkPurchaseOrderToDte(poId, dteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empresas", "purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["empresas", "purchase-orders-by-vendor"] });
      setLinkPoId(null);
      setLinkDteId(null);
    },
  });

  const firstId = companies?.length ? (companies as { id: number }[])[0]?.id : null;
  const selectedId = companyId ?? firstId;
  const receivedDtes = (documents ?? []).filter((d: DTEDocument) => d.direction === "received");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Órdenes de compra
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Por proveedor y vinculación con facturas recibidas (DTE).
        </p>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground">Empresa:</span>
        {(companies ?? []).map((c: { id: number; name: string }) => (
          <a
            key={c.id}
            href={`/empresas/purchase-orders?company_id=${c.id}`}
            className={`px-3 py-1.5 rounded-md text-sm ${selectedId === c.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            {c.name}
          </a>
        ))}
      </div>

      {selectedId && (
        <>
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList>
              <TabsTrigger value="all">Todas las OC</TabsTrigger>
              <TabsTrigger value="by-vendor">Por proveedor</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Listado de órdenes de compra</CardTitle>
                  <CardDescription>Vincule una OC a un DTE recibido para marcar como facturado.</CardDescription>
                </CardHeader>
                <CardContent>
                  {!orders?.length ? (
                    <p className="text-muted-foreground text-sm py-4">No hay órdenes de compra. Sincronice desde Conectores → Órdenes de Compra.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="pb-2 pr-2 font-medium">OC</th>
                            <th className="pb-2 pr-2 font-medium">Proveedor</th>
                            <th className="pb-2 pr-2 font-medium text-right">Total</th>
                            <th className="pb-2 pr-2 font-medium text-right">Facturado</th>
                            <th className="pb-2 pr-2 font-medium">Estado</th>
                            <th className="pb-2 pr-2 font-medium"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(orders as PurchaseOrder[]).map((po) => (
                            <tr key={po.id} className="border-b last:border-0">
                              <td className="py-2 pr-2 font-medium">{po.poNumber}</td>
                              <td className="py-2 pr-2">{po.customerName ?? po.customerRut}</td>
                              <td className="py-2 pr-2 text-right">{formatCurrency(po.totalAmount, currency, { sourceCurrency: "CLP" })}</td>
                              <td className="py-2 pr-2 text-right">{formatCurrency(po.invoicedAmount ?? 0, currency, { sourceCurrency: "CLP" })}</td>
                              <td className="py-2 pr-2">
                                {po.dteDocumentId || po.status === "fully_invoiced" ? (
                                  <span className="inline-flex items-center gap-1 text-green-600">
                                    <CheckCircle className="h-3.5 w-3.5" /> Facturado
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">{po.status ?? "—"}</span>
                                )}
                              </td>
                              <td className="py-2 pr-2">
                                {!po.dteDocumentId && (
                                  <Button variant="outline" size="sm" onClick={() => setLinkPoId(po.id)}>
                                    <Link2 className="h-3.5 w-3.5 mr-1" /> Vincular DTE
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="by-vendor" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>OC por proveedor</CardTitle>
                  <CardDescription>Agrupado por RUT / nombre del proveedor.</CardDescription>
                </CardHeader>
                <CardContent>
                  {!byVendor?.length ? (
                    <p className="text-muted-foreground text-sm py-4">No hay órdenes de compra.</p>
                  ) : (
                    <div className="space-y-4">
                      {(byVendor as { vendorRut: string; vendorName: string; orders: PurchaseOrder[]; totalAmount: number }[]).map((v) => (
                        <div key={v.vendorRut} className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{v.vendorName}</span>
                            <span className="text-xs text-muted-foreground">RUT {v.vendorRut}</span>
                            <span className="text-sm text-muted-foreground ml-auto">
                              Total: {formatCurrency(v.totalAmount, currency, { sourceCurrency: "CLP" })}
                            </span>
                          </div>
                          <ul className="text-sm space-y-1">
                            {v.orders.map((po) => (
                              <li key={po.id} className="flex justify-between items-center">
                                <span>{po.poNumber} — {formatCurrency(po.totalAmount, currency, { sourceCurrency: "CLP" })}</span>
                                {po.dteDocumentId || po.status === "fully_invoiced" ? (
                                  <span className="text-green-600 text-xs">Facturado</span>
                                ) : (
                                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setLinkPoId(po.id)}>
                                    Vincular DTE
                                  </Button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Dialog open={linkPoId != null} onOpenChange={(open) => !open && setLinkPoId(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Vincular OC a DTE recibido</DialogTitle>
                <DialogDescription>Seleccione la factura recibida (DTE) que corresponde a esta orden de compra. El estado se actualizará a facturado.</DialogDescription>
              </DialogHeader>
              <div className="py-2">
                {receivedDtes.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No hay documentos recibidos. Sincronice con SII o ingrese DTE recibidos.</p>
                ) : (
                  <ul className="space-y-2 max-h-64 overflow-y-auto">
                    {receivedDtes.map((d: DTEDocument) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => setLinkDteId(d.id)}
                          className={`w-full text-left px-3 py-2 rounded-md border text-sm ${linkDteId === d.id ? "border-primary bg-primary/10" : "border-muted hover:bg-muted/50"}`}
                        >
                          <span className="font-medium">{d.documentType} #{d.folio}</span>
                          <span className="text-muted-foreground ml-2">{d.issueDate}</span>
                          <span className="ml-2">{d.emitterName ?? d.emitterRut}</span>
                          <span className="float-right">{formatCurrency(d.totalAmount, currency, { sourceCurrency: "CLP" })}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setLinkPoId(null); setLinkDteId(null); }}>Cancelar</Button>
                <Button
                  disabled={!linkDteId || linkMutation.isPending}
                  onClick={() => linkPoId != null && linkDteId != null && linkMutation.mutate({ poId: linkPoId, dteId: linkDteId })}
                >
                  {linkMutation.isPending ? "Vinculando…" : "Vincular"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
