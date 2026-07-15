import { useState, useMemo, useEffect } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getEmpresasCompaniesWithSummary,
  getEmpresasStatements,
  getEmpresasCashForecast,
} from "@/lib/empresasApi";
import { formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/lib/CurrencyContext";
import { TrendingUp, AlertTriangle } from "lucide-react";

const CASH_THRESHOLD_STORAGE_KEY = "coda_empresas_cash_threshold_clp";
const DEFAULT_THRESHOLD_CLP = 1_000_000;

function getStoredThreshold(companyId: number): number {
  try {
    const raw = localStorage.getItem(`${CASH_THRESHOLD_STORAGE_KEY}_${companyId}`);
    if (raw != null) {
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n >= 0) return n;
    }
  } catch {}
  return DEFAULT_THRESHOLD_CLP;
}

function setStoredThreshold(companyId: number, value: number) {
  try {
    localStorage.setItem(`${CASH_THRESHOLD_STORAGE_KEY}_${companyId}`, String(value));
  } catch {}
}

export default function EmpresasStatements() {
  const { currency } = useCurrency();
  const search = useSearch();
  const companyId = new URLSearchParams(search).get("company_id")
    ? parseInt(new URLSearchParams(search).get("company_id")!, 10)
    : null;
  const [thresholdClp, setThresholdClp] = useState(() =>
    companyId ? getStoredThreshold(companyId) : DEFAULT_THRESHOLD_CLP,
  );
  useEffect(() => {
    if (companyId) setThresholdClp(getStoredThreshold(companyId));
  }, [companyId]);

  const { data: companies } = useQuery({
    queryKey: ["empresas", "companies-summary"],
    queryFn: getEmpresasCompaniesWithSummary,
  });
  const { data: statements, isLoading } = useQuery({
    queryKey: ["empresas", "statements", companyId],
    queryFn: () => getEmpresasStatements(companyId!),
    enabled: !!companyId,
  });
  const { data: cashForecast } = useQuery({
    queryKey: ["empresas", "cash-forecast", companyId],
    queryFn: () => getEmpresasCashForecast(companyId!, 30),
    enabled: !!companyId,
  });

  const firstId = companies?.length ? (companies as { id: number }[])[0]?.id : null;
  const selectedId = companyId ?? firstId;
  const st = statements as
    | {
        period?: string;
        incomeStatement?: Array<{ label: string; amount: number }>;
        cashFlow?: Array<{ label: string; amount: number }>;
        balanceSheet?: Array<{ label: string; amount: number }>;
      }
    | undefined;

  const cashAlerts = useMemo(() => {
    if (!companyId || !cashForecast?.forecast?.length) return [];
    const th = typeof thresholdClp === "number" ? thresholdClp : getStoredThreshold(companyId);
    return (cashForecast.forecast as { date: string; projectedBalance: number }[]).filter(
      (f) => f.projectedBalance < th,
    );
  }, [companyId, cashForecast?.forecast, thresholdClp]);

  const handleThresholdChange = (value: string) => {
    const n = value === "" ? DEFAULT_THRESHOLD_CLP : parseInt(value.replace(/\D/g, ""), 10);
    if (!isNaN(n) && n >= 0) {
      setThresholdClp(n);
      if (companyId) setStoredThreshold(companyId, n);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground">Empresa:</span>
        {(companies ?? []).map((c: { id: number; name: string }) => (
          <a
            key={c.id}
            href={`/empresas/statements?company_id=${c.id}`}
            className={`px-3 py-1.5 rounded-md text-sm ${selectedId === c.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            {c.name}
          </a>
        ))}
      </div>
      {cashAlerts.length > 0 && (
        <Alert variant="destructive" className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <AlertTitle>Alerta de flujo de caja</AlertTitle>
            <AlertDescription>
              La proyección de caja cae bajo tu umbral mínimo (
              {formatCurrency(thresholdClp, "CLP", { sourceCurrency: "CLP" })}) en{" "}
              {cashAlerts.length} día(s):{" "}
              {cashAlerts
                .slice(0, 5)
                .map(
                  (a: { date: string; projectedBalance: number }) =>
                    `${a.date} (${formatCurrency(a.projectedBalance, currency, { sourceCurrency: "CLP" })})`,
                )
                .join(", ")}
              {cashAlerts.length > 5 ? ` y ${cashAlerts.length - 5} más` : ""}.
            </AlertDescription>
          </div>
        </Alert>
      )}
      {selectedId &&
        (isLoading ? (
          <div className="h-48 bg-muted animate-pulse rounded-lg" />
        ) : st ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {st.incomeStatement?.length ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Estado de resultado</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    {st.incomeStatement
                      .slice(0, 8)
                      .map((line: { label: string; amount: number }, i: number) => (
                        <div key={i} className="flex justify-between">
                          <span>{line.label}</span>
                          <span>
                            {formatCurrency(line.amount, currency, { sourceCurrency: "CLP" })}
                          </span>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              ) : null}
              {st.cashFlow?.length ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Flujo de caja</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    {st.cashFlow
                      .slice(0, 6)
                      .map((line: { label: string; amount: number }, i: number) => (
                        <div key={i} className="flex justify-between">
                          <span>{line.label}</span>
                          <span>
                            {formatCurrency(line.amount, currency, { sourceCurrency: "CLP" })}
                          </span>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              ) : null}
              {st.balanceSheet?.length ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Balance</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    {st.balanceSheet
                      .slice(0, 6)
                      .map((line: { label: string; amount: number }, i: number) => (
                        <div key={i} className="flex justify-between">
                          <span>{line.label}</span>
                          <span>
                            {formatCurrency(line.amount, currency, { sourceCurrency: "CLP" })}
                          </span>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              ) : null}
            </div>
            {cashForecast?.forecast?.length ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" /> Proyección de caja (30 días)
                  </CardTitle>
                  <CardDescription>
                    Asistente de flujo de caja — saldo proyectado según histórico. Configura un
                    umbral mínimo para recibir alertas.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="cash-threshold" className="text-muted-foreground">
                      Umbral mínimo (CLP):
                    </Label>
                    <Input
                      id="cash-threshold"
                      type="text"
                      inputMode="numeric"
                      className="w-36"
                      value={thresholdClp.toLocaleString("es-CL")}
                      onChange={(e) => handleThresholdChange(e.target.value)}
                    />
                  </div>
                  <p className="mb-2">
                    Saldo actual:{" "}
                    <strong>
                      {formatCurrency(cashForecast.currentBalance, currency, {
                        sourceCurrency: "CLP",
                      })}
                    </strong>
                  </p>
                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-1">Fecha</th>
                          <th className="text-right py-1">Proyección</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cashForecast.forecast
                          .slice(0, 14)
                          .map((f: { date: string; projectedBalance: number }) => (
                            <tr key={f.date} className="border-b last:border-0">
                              <td className="py-1">{f.date}</td>
                              <td className="text-right">
                                {formatCurrency(f.projectedBalance, currency, {
                                  sourceCurrency: "CLP",
                                })}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Sin estados para este período.
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
