export async function apiFetch(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(typeof input === 'string' && input.startsWith('/api') ? input : input, init);
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
