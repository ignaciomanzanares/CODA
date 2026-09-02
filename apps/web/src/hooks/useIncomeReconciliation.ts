import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api";

export type IncomeSourceId = "sii" | "afp" | "cartola" | "cmf_proxy";

export type DiscrepancyKind =
  "informal_income" | "possible_undeclared_account" | "stale_source" | "large_gap";

export interface IncomeDiscrepancy {
  kind: DiscrepancyKind;
  sources: IncomeSourceId[];
  severity: "info" | "warn";
  detail: string;
}

export interface SourceConfidence {
  source: IncomeSourceId;
  monthlyClp: number;
  /** 0–1: qué tanto confiamos en esta fuente para el ingreso reconciliado. */
  confidence: number;
  stale: boolean;
}

export interface ReconciledIncome {
  monthlyClp: number;
  chosenSource: IncomeSourceId | null;
  confidenceBySource: SourceConfidence[];
  discrepancies: IncomeDiscrepancy[];
  rationale: string;
}

/**
 * D7 — Reconciliación de ingresos: cruza las señales de ingreso (cartola observada + SII/AFP
 * declaradas) y devuelve el ingreso estimado, la confianza por fuente y las discrepancias. Se
 * pide bajo demanda (al expandir el panel) porque es material de transparencia, no algo que el
 * usuario necesite en cada visita.
 */
export function useIncomeReconciliation(enabled = true) {
  const { apiRequest } = useApi();

  return useQuery<ReconciledIncome>({
    queryKey: ["income-reconciliation"],
    queryFn: () => apiRequest<ReconciledIncome>("GET", "/api/income/reconciliation"),
    enabled,
    retry: 1,
    staleTime: 5 * 60_000,
  });
}
