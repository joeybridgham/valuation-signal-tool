// Small fetch helper: server-side only, Next fetch-caching + a hard timeout, and
// it never throws — callers get null on any failure so one bad source can't break
// the whole analysis.

export interface FetchOpts {
  revalidate?: number;     // seconds; Next data cache window
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export async function getJson<T = any>(url: string, opts: FetchOpts = {}): Promise<T | null> {
  const { revalidate = 60 * 60 * 24, timeoutMs = 7000, headers } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", ...headers },
      next: { revalidate },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    // FMP error payloads come back as objects with an "Error Message" key.
    if (data && typeof data === "object" && !Array.isArray(data) && data["Error Message"]) return null;
    return data as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function num(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v.replace(/[, $%]/g, "")) : Number(v);
  return isFinite(n) ? n : null;
}

// First finite value among candidate keys on an object.
export function pick(obj: any, ...keys: string[]): number | null {
  if (!obj) return null;
  for (const k of keys) {
    const n = num(obj[k]);
    if (n != null) return n;
  }
  return null;
}
