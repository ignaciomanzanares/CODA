// Centralized API helper for CODA frontend
export const API_URL: string = import.meta.env.VITE_API_URL as string;

export async function apiFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const url = `${API_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const mergedOptions: RequestInit = {
    credentials: 'include' as RequestCredentials,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ? options.headers : {})
    },
    ...options,
  };
  const response = await fetch(url, mergedOptions);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw error;
  }
  return response.json();
}
