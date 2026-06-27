import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth, getPersonalToken, hasPersonalSession } from "@/lib/auth";

interface UserDocument {
  id: string;
  tipo: string;
  banco: string | null;
  periodoDesde: string | null;
  periodoHasta: string | null;
  parseStatus: string;
  normalizationStatus?: string | null;
  uploadedAt: string;
  movementCount?: number;
}

interface UserDocumentsResponse {
  documents: UserDocument[];
  count: number;
}

export function useUserDocuments() {
  const { isAuthenticated } = useAuth();

  const { data, isLoading } = useQuery<UserDocumentsResponse>({
    queryKey: ["/api/user/documents"],
    queryFn: async () => {
      const token = getPersonalToken();
      if (!token && !hasPersonalSession()) return { documents: [], count: 0 };
      return apiFetch("/api/user/documents", {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    enabled: isAuthenticated,
    staleTime: 30000,
  });

  return {
    documents: data?.documents ?? [],
    count: data?.count ?? 0,
    hasDocuments: (data?.count ?? 0) > 0,
    isLoading,
  };
}
