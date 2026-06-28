// Finnhub client, server-only, OPTIONAL, free tier (60 req/min, no daily cap
// like FMP's 250). We use it to OFFLOAD the peer set + peer multiples, since
// Finnhub's peers endpoint is free (FMP's is paid). Absent key => callers fall
// back to FMP. Graceful on every failure.
import { getJson, num } from "./http";

const BASE = "https://finnhub.io/api/v1";
export function hasFinnhubKey(): boolean {
  return !!process.env.FINNHUB_API_KEY && process.env.FINNHUB_API_KEY.length > 8;
}
function furl(path: string, params: Record<string, string>): string {
  const sp = new URLSearchParams({ ...params, token: process.env.FINNHUB_API_KEY ?? "" });
  return `${BASE}${path}?${sp.toString()}`;
}

export async function finnhubPeers(symbol: string): Promise<string[]> {
  const r = await getJson<string[]>(furl("/stock/peers", { symbol }), { revalidate: 60 * 60 * 24 });
  return Array.isArray(r) ? r.filter((s) => s && s.toUpperCase() !== symbol.toUpperCase()) : [];
}

export interface FinnhubMultiples { pe: number | null; ps: number | null; pb: number | null; }
export async function finnhubMetric(symbol: string): Promise<FinnhubMultiples | null> {
  const r = await getJson<any>(furl("/stock/metric", { symbol, metric: "all" }), { revalidate: 60 * 60 * 24 });
  const m = r?.metric;
  if (!m) return null;
  return { pe: num(m.peTTM) ?? num(m.peExclExtraTTM), ps: num(m.psTTM), pb: num(m.pbTTM) };
}

export interface FinnhubQuote { price: number; change: number; changePct: number; }
export async function finnhubQuote(symbol: string): Promise<FinnhubQuote | null> {
  const r = await getJson<any>(furl("/quote", { symbol }), { revalidate: 60 * 30 });
  const price = num(r?.c);
  if (price == null || price <= 0) return null;
  return { price, change: num(r?.d) ?? 0, changePct: (num(r?.dp) ?? 0) / 100 };
}

export interface FinnhubProfile { name: string; sector: string; exchange: string; shares: number | null; marketCap: number | null; }
export async function finnhubProfile(symbol: string): Promise<FinnhubProfile | null> {
  const r = await getJson<any>(furl("/stock/profile2", { symbol }), { revalidate: 60 * 60 * 24 });
  if (!r || !r.name) return null;
  return {
    name: String(r.name), sector: String(r.finnhubIndustry ?? ""), exchange: String(r.exchange ?? ""),
    shares: num(r.shareOutstanding) != null ? (num(r.shareOutstanding) as number) * 1e6 : null,
    marketCap: num(r.marketCapitalization) != null ? (num(r.marketCapitalization) as number) * 1e6 : null,
  };
}

export async function finnhubMetricFull(symbol: string): Promise<any | null> {
  const r = await getJson<any>(furl("/stock/metric", { symbol, metric: "all" }), { revalidate: 60 * 60 * 24 });
  return r?.metric ?? null;
}
