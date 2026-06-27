// Tiny Upstash Redis (REST) client — server-only. Used to persist daily mention
// snapshots and cached Reddit posts. Entirely optional: if no store is
// configured, hasStore() is false and every caller degrades gracefully.
// Works with the env vars the Vercel→Upstash Marketplace integration injects
// (KV_REST_API_URL/TOKEN) or the native Upstash names.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export function hasStore(): boolean { return URL_.length > 0 && TOKEN.length > 0; }

async function post(path: string, body: any, timeoutMs = 6000): Promise<any> {
  if (!hasStore()) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${URL_}${path}`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; } finally { clearTimeout(t); }
}

export async function kvGet<T = any>(keyName: string): Promise<T | null> {
  const r = await post("", ["GET", keyName]);
  const v = r?.result;
  if (v == null) return null;
  try { return JSON.parse(v) as T; } catch { return null; }
}

export async function kvSet(keyName: string, val: any): Promise<void> {
  await post("", ["SET", keyName, JSON.stringify(val)]);
}

// Batched commands in one round-trip. Returns the array of results.
export async function kvPipeline(cmds: string[][]): Promise<(string | null)[]> {
  if (!hasStore() || !cmds.length) return [];
  const r = await post("/pipeline", cmds, 8000);
  if (!Array.isArray(r)) return [];
  return r.map((x: any) => (x && "result" in x ? x.result : null));
}
