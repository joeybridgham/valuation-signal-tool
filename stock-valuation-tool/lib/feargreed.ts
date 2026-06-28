// CNN Business Fear & Greed Index (market-wide gauge). Unofficial endpoint;
// requires a browser-like User-Agent + Accept: application/json or it rejects.
// Server-side only.
import { getJson } from "./http";
import type { FearGreed } from "./types";

const URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";

export async function getFearGreed(): Promise<FearGreed> {
  const data = await getJson<any>(URL, {
    revalidate: 1800,
    timeoutMs: 6000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      "Accept": "application/json",
      "Referer": "https://www.cnn.com/markets/fear-and-greed",
    },
  });
  const fg = data?.fear_and_greed;
  if (!fg || fg.score == null) return { available: false, score: null, rating: null, asOf: null };
  return {
    available: true,
    score: Math.round(Number(fg.score)),
    rating: fg.rating ? String(fg.rating).replace(/\b\w/g, (c: string) => c.toUpperCase()) : null,
    asOf: fg.timestamp ? new Date(fg.timestamp).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  };
}
