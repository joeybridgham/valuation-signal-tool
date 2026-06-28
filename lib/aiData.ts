// Last-resort data source: when FMP, Finnhub, Alpha Vantage and Stooq all fail,
// ask the AI for a BEST-EFFORT snapshot from training knowledge. Clearly flagged
// as an estimate (not live). Prices are pulled from Stooq when available so at
// least the chart/technicals are real.
import type { FmpBundle } from "./fmp";
import { aiChat, hasAnyAiKey, safeParse } from "./anthropic";
import { getStooqSeries } from "./stooq";
import { num } from "./http";

const AI_SYSTEM =
  "You are a financial-data assistant. From your training knowledge, output a BEST-EFFORT approximate snapshot for the given " +
  "US-listed ticker as JSON ONLY. Numbers are approximate and may be outdated; that is acceptable. Use ABSOLUTE USD values " +
  '(NOT millions). Unknown fields -> null. Schema: {"name":string,"sector":string,"assetType":"stock"|"etf","price":number,' +
  '"sharesOutstanding":number,"marketCap":number,"beta":number,"freeCashFlow":number,"ebitda":number,"epsTTM":number,' +
  '"revenue":number,"netDebt":number,"cash":number,"totalDebt":number,"dividendPerShare":number,"bookValuePerShare":number}';

export async function getAiBundle(symbol: string): Promise<FmpBundle | null> {
  if (!hasAnyAiKey()) return null;
  const sym = symbol.toUpperCase().trim();
  const r = await aiChat(AI_SYSTEM, `Ticker: ${sym}`);
  if (!r.text) return null;
  const d = safeParse(r.text);
  if (!d || (d.price == null && d.freeCashFlow == null)) return null;

  const today = new Date().toISOString().slice(0, 10);
  const series = await getStooqSeries(sym);
  const price = num(d.price) ?? series.at(-1)?.close ?? 0;
  const shares = num(d.sharesOutstanding) ?? 0;
  const totalDebt = num(d.totalDebt) ?? 0;
  const cash = num(d.cash) ?? 0;
  const fcf = num(d.freeCashFlow);
  return {
    market: { price, dayChange: 0, dayChangePct: 0, marketCap: num(d.marketCap) ?? (price && shares ? price * shares : 0), sharesOutstanding: shares, beta: num(d.beta) ?? 1 },
    fundamentals: {
      freeCashFlow: fcf ?? 0, fcfHistory: fcf != null ? [fcf] : [], ebitda: num(d.ebitda) ?? 0, epsTTM: num(d.epsTTM) ?? 0,
      revenue: num(d.revenue) ?? 0, revenuePerShare: shares > 0 && d.revenue ? (num(d.revenue) as number) / shares : 0,
      bookValuePerShare: num(d.bookValuePerShare) ?? 0, netDebt: num(d.netDebt) ?? (totalDebt - cash), totalDebt, cash,
      interestExpense: 0, taxRate: 0.21, dividendPerShare: num(d.dividendPerShare) ?? 0,
    },
    ownMultiples: { pe: null, evEbitda: null, ps: null, pb: null },
    peers: { peers: [], medianPE: null, medianEvEbitda: null, medianPS: null, medianPB: null },
    analyst: { available: false, targetLow: null, targetMean: null, targetHigh: null, numAnalysts: null, estGrowth: null },
    fmpDcf: null, priceSeries: series, histMultiples: [], congress: [], news: [], riskFree: 0.043, riskFreeIsFallback: true,
    meta: { name: String(d.name || sym), exchange: "", sector: String(d.sector || ""), industry: String(d.sector || ""), currency: "USD", priceAsOf: series.at(-1)?.date ?? today },
    sources: { market: { label: "AI estimate (training knowledge)", form: "AI estimate", period: "approx", fiscalDate: today, filingDate: null, url: null } },
    notes: ["All live data sources were unavailable, so these figures are an AI ESTIMATE from training knowledge — approximate, possibly outdated, and NOT live data."],
    source: "AI estimate", kind: String(d.assetType).toLowerCase() === "etf" ? "fund" : "stock",
  };
}
