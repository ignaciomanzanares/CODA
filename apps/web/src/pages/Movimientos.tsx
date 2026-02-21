import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";
import { useAuth } from "@/lib/auth";
import { Receipt, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface UnifiedTransaction {
  accountId: number;
  accountName?: string;
  accountType?: string;
  id: number;
  postedAt: string;
  description?: string | null;
  amount: number;
  currency?: string | null;
  category?: string | null;
}

export default function Movimientos() {
  const { currency } = useCurrency();
  const { isAuthenticated } = useAuth();

  const { data: transactions, isLoading, error } = useQuery<UnifiedTransaction[]>({
    queryKey: ["/api/transactions"],
    queryFn: async () => {
      const token = localStorage.getItem("jwt_token");
      if (!token) return [];
      const res = await apiFetch("/api/transactions?limit=200", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return Array.isArray(res) ? res : [];
    },
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <div className="container py-8 max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">Movimientos</h2>
            <p className="text-muted-foreground text-sm">Inicia sesión para ver todos tus movimientos bancarios en una sola vista.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Receipt className="h-7 w-7" />
          Movimientos
        </h1>
        <p className="text-muted-foreground mt-1">
          Todos los movimientos de tus cuentas (corrientes, tarjetas, líneas de crédito) en una sola vista.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimos movimientos</CardTitle>
          <CardDescription>Interbancarios e intrabancarios — últimos 90 días</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="h-48 flex items-center justify-center text-muted-foreground">Cargando...</div>
          )}
          {error && (
            <div className="text-destructive text-sm">Error al cargar movimientos.</div>
          )}
          {!isLoading && !error && (!transactions || transactions.length === 0) && (
            <div className="py-12 text-center text-muted-foreground">
              <Wallet className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No hay movimientos. Conecta tus cuentas desde el Panel (demo: Conectar y analizar).</p>
            </div>
          )}
          {!isLoading && transactions && transactions.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-2 font-medium">Fecha</th>
                    <th className="pb-2 pr-2 font-medium">Cuenta</th>
                    <th className="pb-2 pr-2 font-medium">Descripción</th>
                    <th className="pb-2 pr-2 font-medium text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={`${t.accountId}-${t.id}`} className="border-b last:border-0">
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {new Date(t.postedAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="py-2 pr-2">
                        <span className="text-muted-foreground">{t.accountName || t.accountType || `Cuenta ${t.accountId}`}</span>
                      </td>
                      <td className="py-2 pr-2 max-w-[200px] truncate">{t.description || "—"}</td>
                      <td className="py-2 pr-2 text-right">
                        <span className={t.amount >= 0 ? "text-green-600 flex items-center justify-end gap-0.5" : "text-destructive flex items-center justify-end gap-0.5"}>
                          {t.amount >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                          {formatCurrency(Math.abs(t.amount), currency)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
