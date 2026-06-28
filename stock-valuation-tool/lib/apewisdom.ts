// ApeWisdom (Reddit mention volume). Free, no key. We page through the ranked
// list to locate the ticker; the reliable signals are mention count and the 24h
// change. Not found => clean "low chatter" state.
import { getJson } from "./http";
import type { BuzzData } from "./types";

const BASE = "https://apewisdom.io/api/v1.0/filter/all-stocks/page/";

export async function getBuzz(symbol: string, maxPages = 5): Promise<BuzzData> {
  const sym = symbol.toUpperCase();
  const empty: BuzzData = { found: false, rank: null, mentions: null, mentions24hAgo: null, upvotes: null, change24hPct: null };
  try {
    const pages = await Promise.all(
      Array.from({ length: maxPages }, (_, i) =>
        getJson<any>(`${BASE}${i + 1}`, { revalidate: 1800, timeoutMs: 5000 })
      )
    );
    for (const page of pages) {
      const results = page?.results ?? [];
      const hit = results.find((r: any) => String(r.ticker).toUpperCase() === sym);
      if (hit) {
        const mentions = Number(hit.mentions);
        const prior = Number(hit.mentions_24h_ago);
        const change = prior > 0 ? (mentions - prior) / prior : null;
        return {
          found: true,
          rank: Number(hit.rank) || null,
          mentions: isFinite(mentions) ? mentions : null,
          mentions24hAgo: isFinite(prior) ? prior : null,
          upvotes: Number(hit.upvotes) || null,
          change24hPct: change,
        };
      }
    }
    return empty;
  } catch {
    return empty;
  }
}
