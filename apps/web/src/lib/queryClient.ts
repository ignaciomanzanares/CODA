import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { headers?: Record<string, string> }
): Promise<Response> {
  const headers = {
    ...(data ? { "Content-Type": "application/json" } : {}),
    ...(options?.headers || {})
  };

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

/**
 * Smart retry: retry on server errors (5xx) and network failures (cold start),
 * but NOT on client errors (4xx — auth, validation, not found).
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const msg = error instanceof Error ? error.message : String(error);
  // Extract status from "STATUS: message" format used by throwIfResNotOk
  const statusMatch = msg.match(/^(\d+):/);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    // Don't retry client errors (401, 403, 404, etc.)
    if (status >= 400 && status < 500) return false;
    // Retry server errors (500, 502, 503, etc.) — likely cold start
    return true;
  }
  // Network errors (Failed to fetch, etc.) — retry
  return true;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: false,
      refetchOnWindowFocus: false,
      // 5 minutes: data stays fresh for navigation between pages but
      // isn't so aggressive that we never refetch. After a document upload
      // invalidateQueries() forces immediate refetch regardless.
      staleTime: 5 * 60 * 1000,
      retry: shouldRetry,
      retryDelay: (attempt) => Math.min(2000 * (attempt + 1), 8000),
    },
    mutations: {
      retry: false,
    },
  },
});
