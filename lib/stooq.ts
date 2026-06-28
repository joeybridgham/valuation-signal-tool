// Stooq daily prices, free, keyless, effectively unlimited. Primary source for
// the price series so charts/technicals don't consume the FMP budget.
import { num } from "./http";
import type { PricePoint } from "./types";

export async function getStooqSeries(symbol: string): Promise<PricePoint[]> {
  const s = symbol.toLowerCase().replace(/[^a-z0-9.\-]/g, "");
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(s + ".us")}&i=d`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, next: { revalidate: 60 * 60 * 12 } });
    if (!res.ok) return [];
    const text = await res.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2 || !/^date/i.test(lines[0])) return [];
    const out: PricePoint[] = [];
    for (const line of lines.slice(1)) {
      const c = line.split(",");
      const close = num(c[4]);
      if (c[0] && close != null) out.push({ date: c[0], close, volume: num(c[5]) ?? undefined });
    }
    return out.slice(-760); // ~2y, already oldest -> newest
  } catch { return []; } finally { clearTimeout(t); }
}
