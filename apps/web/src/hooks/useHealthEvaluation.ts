import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api";

export type HealthSalida =
  "ahorro_inversion" | "refinanciamiento" | "reestructuracion" | "concursal";
export type HealthZone = "critica" | "intermedia";
export type HealthLevel = -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5;

export interface HealthEvaluation {
  nivel: HealthLevel;
  nivelNombre: string;
  zona: HealthZone;
  salida: HealthSalida;
  scoreRatios: number;
  scoreInterno: number;
  scoreCompuesto: number;
  nivelBruto: number;
  ratios: {
    deudaFlujo: number;
    deudaActivos: number;
    ahorroIngreso: number;
    moraActiva: boolean;
    diasMora: number;
  };
  productos: {
    productName: string;
    provider: string;
    category: string;
    matchScore: number;
    explanation: string;
  }[];
  insights: string[];
}

export interface HealthResponse {
  hasData: boolean;
  evaluation?: HealthEvaluation;
  modelVersion?: string;
  descripcionNivel?: string;
  missingData?: { cartola: boolean; cmf: boolean };
}

/**
 * Evaluación de salud financiera del usuario. Comparte queryKey con la página
 * /salud-financiera para que el tile del panel y la página completa usen la
 * misma cache (y el recálculo de la página refresque ambos).
 */
export function useHealthEvaluation() {
  const { apiRequest } = useApi();

  return useQuery<HealthResponse>({
    queryKey: ["health-evaluation"],
    queryFn: () => apiRequest<HealthResponse>("GET", "/api/health-evaluation/me"),
    retry: 1,
  });
}
