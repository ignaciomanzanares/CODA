export async function apiFetch(input: RequestInfo, init?: RequestInit) {
  // Allow overriding API host via Vite env var `VITE_API_URL` (e.g. https://api.example.com)
  // If not set, keep relative paths so local dev (`localhost:5173`) works with proxies.
  const apiBase = (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_API_URL) || '';

  let url: RequestInfo = input;
  if (typeof input === 'string') {
    if (input.startsWith('/api')) {
      // If an absolute API base is configured, prefix it; otherwise keep relative path
      url = apiBase ? `${apiBase.replace(/\/$/, '')}${input}` : input;
    } else if (apiBase && !/^https?:\/\//i.test(input)) {
      // If caller passed a path-like input and apiBase exists, prefix it
      url = `${apiBase.replace(/\/$/, '')}/${input.replace(/^\//, '')}`;
    }
  }

  const res = await fetch(url as RequestInfo, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`apiFetch failed: ${res.status} ${res.statusText} ${body}`);
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}
