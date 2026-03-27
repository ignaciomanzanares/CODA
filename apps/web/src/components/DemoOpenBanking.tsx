import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface ObAccount {
  id: number;
  name?: string | null;
  type?: string | null;
  currency?: string | null;
  mask?: string | null;
}

interface ObTransaction {
  id: number;
  postedAt: string;
  description?: string | null;
  merchantName?: string | null;
  amount: string;
  currency?: string | null;
  category?: string | null;
}

interface DemoOpenBankingProps {
  onConnected?: () => void;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("jwt_token");
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/** Sincroniza cuentas Open Banking reales del usuario (misma ingesta que el panel). */
export default function DemoOpenBanking({ onConnected }: DemoOpenBankingProps) {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<ObAccount[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [txs, setTxs] = useState<ObTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function runIngestion() {
    try {
      setLoading(true);
      setError(null);
      await apiFetch("/api/open-banking/sync", { method: "POST", headers: authHeaders() });
      await loadAccounts();
      onConnected?.();
    } catch (_e) {
      setError("No se pudo sincronizar. ¿Tienes sesión iniciada?");
    } finally {
      setLoading(false);
    }
  }

  async function loadAccounts() {
    try {
      const data = await apiFetch("/api/accounts", { headers: authHeaders() });
      setAccounts(data);
    } catch {
      // ignorar
    }
  }

  async function loadTransactions(accountId: number) {
    setSelected(accountId);
    try {
      const data = await apiFetch(`/api/accounts/${accountId}/transactions?limit=25`, {
        headers: authHeaders(),
      });
      setTxs(data);
    } catch {
      // ignorar
    }
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Open Banking</h3>
          <Button onClick={runIngestion} disabled={loading}>
            {loading ? "Sincronizando…" : "Sincronizar cuentas"}
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          Trae cuentas y movimientos de los últimos 90 días según la conexión configurada en el servidor.
        </div>

        {error && <div className="text-red-500 text-sm">{error}</div>}

        <Separator className="my-2" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Cuentas</h4>
              <Button variant="outline" size="sm" onClick={loadAccounts}>
                Actualizar
              </Button>
            </div>
            <div className="space-y-2">
              {accounts.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  Aún no hay cuentas. Pulsa sincronizar tras conectar el banco en el backend.
                </div>
              )}
              {accounts.map((a) => (
                <div
                  key={a.id}
                  className={`p-3 border rounded cursor-pointer ${selected === a.id ? "bg-accent" : ""}`}
                  onClick={() => loadTransactions(a.id)}
                >
                  <div className="font-medium">
                    {a.name || a.type || "Cuenta"} {a.mask ? `•${a.mask}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.type || ""} {a.currency ? `• ${a.currency}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <h4 className="font-semibold mb-2">Transacciones recientes</h4>
            {selected === null ? (
              <div className="text-sm text-muted-foreground">Elige una cuenta para ver movimientos.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-4">Fecha</th>
                      <th className="py-2 pr-4">Descripción</th>
                      <th className="py-2 pr-4">Comercio</th>
                      <th className="py-2 pr-4 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((t) => (
                      <tr key={t.id} className="border-b">
                        <td className="py-2 pr-4">{new Date(t.postedAt).toLocaleDateString()}</td>
                        <td className="py-2 pr-4">{t.description || "-"}</td>
                        <td className="py-2 pr-4">{t.merchantName || "-"}</td>
                        <td
                          className={`py-2 pr-4 text-right ${parseFloat(t.amount) < 0 ? "text-red-600" : "text-emerald-600"}`}
                        >
                          {parseFloat(t.amount).toFixed(2)} {t.currency || ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
