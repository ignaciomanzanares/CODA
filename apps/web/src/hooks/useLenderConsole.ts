import { useQuery, useMutation } from "@tanstack/react-query";
import { useApi } from "@/lib/api";

export type VariableClass = "exposable" | "proxy_risk" | "protected" | "internal";

export interface B2BVariable {
  id: string;
  label: string;
  clazz: VariableClass;
  rationale: string;
}

export type PolicyOperator = ">=" | "<=" | ">" | "<" | "==";

export interface PolicyCriterion {
  variable: string;
  op: PolicyOperator;
  threshold: number | boolean;
  label?: string;
}

export interface PolicyValidation {
  valid: boolean;
  nonExposable: string[];
  errors: string[];
}

export interface SimulationResult {
  total: number;
  approved: number;
  rejected: number;
  approvalRate: number;
  failuresByVariable: Record<string, number>;
}

export interface LenderConsoleSimulation {
  validation: PolicyValidation;
  simulation: SimulationResult;
  cohort: { size: number; synthetic: true };
  examples: Array<{
    values: Record<string, number | boolean | undefined>;
    decision: "approve" | "reject";
    failed: string[];
  }>;
}

/** R4 — Catálogo de variables agrupado por clase (metodología; sin datos de usuario). */
export function useLenderVariables() {
  const { apiRequest } = useApi();
  return useQuery<{ catalog: Record<VariableClass, B2BVariable[]> }>({
    queryKey: ["lender-variables"],
    queryFn: () => apiRequest("GET", "/api/lender/variables"),
    staleTime: 30 * 60_000,
  });
}

/** R5 — Simula una política sobre el cohorte sintético. Se dispara bajo demanda (mutación). */
export function useLenderSimulation() {
  const { apiRequest } = useApi();
  return useMutation<
    LenderConsoleSimulation,
    Error,
    { name?: string; criteria: PolicyCriterion[] }
  >({
    mutationFn: (policy) =>
      apiRequest(
        "POST",
        "/api/lender/policy/simulate",
        policy as unknown as Record<string, unknown>,
      ),
  });
}
