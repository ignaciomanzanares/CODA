import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";
import { Package, CreditCard, Wallet } from "lucide-react";

/**
 * Comparador de productos financieros para empresas.
 * Reutiliza la API de productos y filtra/muestra ofertas orientadas a empresas (créditos, líneas, etc.).
 */
export default function EmpresasProducts() {
  const { currency } = useCurrency();
  const { getFinancialProducts } = useApi();

  const { data: loans, isLoading: loansLoading } = useQuery({
    queryKey: ["/api/financial-products", "loans"],
    queryFn: () => getFinancialProducts("loans"),
  });
  const { data: creditCards } = useQuery({
    queryKey: ["/api/financial-products", "credit_cards"],
    queryFn: () => getFinancialProducts("credit_cards"),
  });

  const loanList = Array.isArray(loans) ? loans : [];
  const cardList = Array.isArray(creditCards) ? creditCards : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Package className="h-5 w-5" />
          Comparador de productos financieros para empresas
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Créditos, líneas de crédito y tarjetas para tu empresa. Compara condiciones.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Créditos y líneas
            </CardTitle>
            <CardDescription>Productos de financiamiento para empresas</CardDescription>
          </CardHeader>
          <CardContent>
            {loansLoading && <div className="text-sm text-muted-foreground">Cargando...</div>}
            {!loansLoading && loanList.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay productos de crédito cargados.</p>
            )}
            {!loansLoading && loanList.length > 0 && (
              <ul className="space-y-2 text-sm">
                {(
                  loanList as {
                    productName?: string;
                    provider?: string;
                    interestRate?: number;
                    loanAmount?: number;
                    description?: string;
                  }[]
                )
                  .slice(0, 8)
                  .map((p, i) => (
                    <li
                      key={i}
                      className="flex justify-between items-start border-b pb-2 last:border-0"
                    >
                      <div>
                        <span className="font-medium">{p.productName ?? "Crédito"}</span>
                        <span className="text-muted-foreground ml-1">— {p.provider ?? ""}</span>
                      </div>
                      <div className="text-right">
                        {p.interestRate != null && (
                          <span className="text-muted-foreground">{p.interestRate}%</span>
                        )}
                        {p.loanAmount != null && (
                          <div>{formatCurrency(p.loanAmount, currency)}</div>
                        )}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Tarjetas empresariales
            </CardTitle>
            <CardDescription>Tarjetas de crédito corporativas</CardDescription>
          </CardHeader>
          <CardContent>
            {cardList.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No hay tarjetas empresariales cargadas.
              </p>
            )}
            {cardList.length > 0 && (
              <ul className="space-y-2 text-sm">
                {(cardList as { productName?: string; provider?: string; interestRate?: number }[])
                  .slice(0, 8)
                  .map((p, i) => (
                    <li
                      key={i}
                      className="flex justify-between items-start border-b pb-2 last:border-0"
                    >
                      <div>
                        <span className="font-medium">{p.productName ?? "Tarjeta"}</span>
                        <span className="text-muted-foreground ml-1">— {p.provider ?? ""}</span>
                      </div>
                      {p.interestRate != null && (
                        <span className="text-muted-foreground">{p.interestRate}%</span>
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Los productos se obtienen del catálogo compartido con CODA Personal. Para ofertas
        específicas PYME, integrar con proveedores o API de productos empresariales.
      </p>
    </div>
  );
}
