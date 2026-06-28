// Massive (formerly Polygon.io) — free tier: prices (aggregates), related
// companies (peers, free), ticker overview, dividends, news. Financial
// statements are a paid add-on, so we use Massive for PRICES + PEERS only.
// Base URL is overridable in case the host changes post-rebrand.
import { getJson, num } from "./http";
import type { PricePoint } from "./types";

const BASE = process.env.MASSIVE_BASE_URL || "https://api.polygon.io";
export function hasMassiveKey(): boolean { return !!process.env.MASSIVE_API_KEY && process.env.MASSIVE_API_KEY.length > 8; }
function m(path: string, params: Record<string, string> = {}): string {
  return `${BASE}${path}?${new URLSearchParams({ ...params, apiKey: process.env.MASSIVE_API_KEY ?? "" })}`;
}

export async function massiveAggs(symbol: string): Promise<PricePoint[]> {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 760 * 86400000).toISOString().slice(0, 10);
  const r = await getJson<any>(m(`/v2/aggs/ticker/${symbol.toUpperCase()}/range/1/day/${from}/${to}`, { adjusted: "true", sort: "asc", limit: "1000" }), { revalidate: 60 * 60 * 12 });
  const res = r?.results;
  if (!Array.isArray(res)) return [];
  return res.map((b: any) => ({ date: new Date(num(b.t) ?? 0).toISOString().slice(0, 10), close: num(b.c) ?? NaN, volume: num(b.v) ?? undefined }))
    .filter((p: PricePoint) => isFinite(p.close));
}

export async function massiveRelated(symbol: string): Promise<string[]> {
  const r = await getJson<any>(m(`/v1/related-companies/${symbol.toUpperCase()}`), { revalidate: 60 * 60 * 24 });
  const res = r?.results;
  if (!Array.isArray(res)) return [];
  return res.map((x: any) => String(x.ticker || "").toUpperCase()).filter((t: string) => t && t !== symbol.toUpperCase());
}

export interface MassiveDetails { name: string; marketCap: number | null; shares: number | null; sector: string; }
export async function massiveDetails(symbol: string): Promise<MassiveDetails | null> {
  const r = await getJson<any>(m(`/v3/reference/tickers/${symbol.toUpperCase()}`), { revalidate: 60 * 60 * 24 });
  const d = r?.results;
  if (!d) return null;
  return { name: String(d.name || symbol), marketCap: num(d.market_cap), shares: num(d.share_class_shares_outstanding ?? d.weighted_shares_outstanding), sector: String(d.sic_description || "") };
}
