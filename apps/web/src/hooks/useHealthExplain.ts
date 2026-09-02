import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api";

/** Un paso de la traza auditable del motor de salud v2 (R1). */
export interface HealthAuditStep {
  variable: string;
  value: number | boolean;
  /** Corte comparado (si aplica). */
  cut?: number;
  /** ¿Cruzó el corte? */
  triggered?: boolean;
  /** Peso de la variable en su score. */
  weight?: number;
  /** Valor normalizado 0–100 (si aplica). */
  normalized?: number;
  /** Aporte al score (positivo suma, negativo resta). */
  contribution?: number;
  note: string;
}

export interface HealthAudit {
  version: string;
  stage: "critica" | "intermedia";
  steps: HealthAuditStep[];
  scoreRatios: number;
  scoreInterno: number;
  scoreCompuesto: number;
  nivelBruto: number;
  nivel: number;
  moraPenaltyApplied: boolean;
  salida: "ahorro_inversion" | "refinanciamiento" | "reestructuracion" | "concursal";
}

export interface HealthExplainResponse {
  available: boolean;
  audit?: HealthAudit;
  reason?: string;
}

/**
 * R1 — Traza auditable de la salud del usuario ("por qué este nivel"). Comparte
 * insumos con la evaluación (cartola + CMF) pero se pide bajo demanda: la traza
 * es más pesada y solo se muestra cuando el usuario abre el detalle. Por eso
 * `enabled` permite diferir el fetch hasta que se expande el panel.
 */
export function useHealthExplain(enabled = true) {
  const { apiRequest } = useApi();

  return useQuery<HealthExplainResponse>({
    queryKey: ["health-explain"],
    queryFn: () => apiRequest<HealthExplainResponse>("GET", "/api/health/explain"),
    enabled,
    retry: 1,
    staleTime: 5 * 60_000,
  });
}
