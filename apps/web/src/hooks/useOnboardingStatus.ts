import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth, getPersonalToken } from "@/lib/auth";
import { FEATURES } from "@/config/features";

export interface OnboardingStatus {
  completed: boolean;
  consentGiven: boolean;
  kycStatus: string | null;
  twoFactorEnabled: boolean;
}

/**
 * Estado del onboarding de primer ingreso. Sólo consulta cuando el flag está
 * encendido y hay sesión personal — con el flag apagado no hace fetch (no-op).
 */
export function useOnboardingStatus() {
  const { isAuthenticated } = useAuth("personal");
  const { data, isLoading, refetch } = useQuery<OnboardingStatus>({
    queryKey: ["/api/onboarding/status"],
    queryFn: async () => {
      const token = getPersonalToken();
      return apiFetch("/api/onboarding/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: FEATURES.onboarding && isAuthenticated,
    staleTime: 60_000,
  });

  return { status: data, isLoading, refetch };
}
