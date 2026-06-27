// ============================================================================
// Data layer: FMP (primary, rich) with multi-source resilience.
//  - Prices come from Stooq (free/unlimited) so charts never burn FMP budget.
//  - Peers come from Finnhub (free) when configured, else a built-in set.
//  - Gated FMP endpoints (Congress, analyst targets, treasury, key-metrics) are
//    NOT called on the free plan — they only wasted the 250/day budget.
//  - getLiteBundle() is a Finnhub+Stooq fallback used when FMP is exhausted, so
//    the page still loads (price, comps, technicals, narrative) without DCF.
// ============================================================================
import { getJson, num, pick } from "./http";
import { median } from "./valuation";
import { getStooqSeries } from "./stooq";
import { hasAvKey, avGlobalQuote, avOverview, avDailySeries } from "./alphavantage";
import {
  hasFinnhubKey, finnhubPeers, finnhubMetric, finnhubQuote, finnhubProfile, finnhubMetricFull,
} from "./finnhub";
import type { SecurityKind } from "./types";
import type {
  Fundamentals, MarketData, OwnMultiples, PeerData, PeerMultiple, AnalystData,
  PricePoint, HistMultiplePoint, CongressTrade, NewsItem, Provenance, SourceRef,
} from "./types";

const BASE = "https://financialmodelingprep.com/stable";
export const FMP_PATHS = {
  profile: "/profile", quote: "/quote", incomeAnnual: "/income-statement",
  balanceAnnual: "/balance-sheet-statement", cashflowAnnual: "/cash-flow-statement",
  ratiosTtm: "/ratios-ttm", priceEod: "/historical-price-eod/full", newsStock: "/news/stock",
} as const;

const PEER_MAP: Record<string, string[]> = {
  HAL: ["SLB", "BKR", "NOV", "WHD", "TS"], SLB: ["HAL", "BKR", "NOV", "WHD"], BKR: ["HAL", "SLB", "NOV", "WHD"],
  META: ["GOOGL", "SNAP", "PINS", "RDDT", "GOOG"], GOOGL: ["META", "MSFT", "AMZN", "GOOG"], GOOG: ["META", "MSFT", "AMZN", "GOOGL"],
  UNH: ["ELV", "CI", "HUM", "CVS", "CNC"], ELV: ["UNH", "CI", "HUM", "CVS"], CVS: ["UNH", "ELV", "CI", "HUM"],
  SLS: ["GERN", "KPTI", "CRVS", "ANAB"],
  AAPL: ["MSFT", "GOOGL", "AMZN", "HPQ", "DELL"], MSFT: ["AAPL", "GOOGL", "AMZN", "ORCL", "CRM"],
  NVDA: ["AMD", "INTC", "AVGO", "QCOM", "TSM"], AMD: ["NVDA", "INTC", "AVGO", "QCOM"], TSLA: ["GM", "F", "RIVN", "LCID"],
  AMZN: ["WMT", "GOOGL", "MSFT", "TGT"], JPM: ["BAC", "WFC", "C", "GS"], NFLX: ["DIS", "WBD", "PARA", "CMCSA"],
  XOM: ["CVX", "COP", "BP", "SHEL"], CVX: ["XOM", "COP", "BP"], KO: ["PEP", "KDP", "MNST"], PEP: ["KO", "MDLZ", "KDP"],
};

function url(path: string, params: Record<string, string | number | undefined>): string {
  const key = process.env.FMP_API_KEY ?? "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) sp.set(k, String(v));
  sp.set("apikey", key);
  return `${BASE}${path}?${sp.toString()}`;
}
const arr = <T = any>(x: any): T[] => (Array.isArray(x) ? x : []);
const first = (x: any): any => (Array.isArray(x) ? x[0] : x) ?? null;
export function hasFmpKey(): boolean { return !!process.env.FMP_API_KEY && process.env.FMP_API_KEY.length > 5; }
const posv = (x: number | null) => (x != null && x > 0 ? x : null);

export interface FmpBundle {
  market: MarketData; fundamentals: Fundamentals; ownMultiples: OwnMultiples; peers: PeerData; analyst: AnalystData;
  fmpDcf: number | null; priceSeries: PricePoint[]; histMultiples: HistMultiplePoint[]; congress: CongressTrade[];
  news: NewsItem[]; riskFree: number; riskFreeIsFallback: boolean;
  meta: { name: string; exchange: string; sector: string; industry: string; currency: string; priceAsOf: string };  sources: Provenance; notes: string[]; source: string; kind: SecurityKind;
}

// shared: build peer multiples (Finnhub-first, FMP-ratios fallback)
async function getPeers(sym: string, notes: string[]): Promise<PeerData> {
  let peers: PeerMultiple[] = [];
  if (hasFinnhubKey()) {
    const syms = (await finnhubPeers(sym)).slice(0, 5);
    if (syms.length) {
      peers = await Promise.all(syms.map(async (s) => {
        const m = await finnhubMetric(s);
        return { symbol: s, pe: m?.pe ?? null, evEbitda: null, ps: m?.ps ?? null, pb: m?.pb ?? null };
      }));
    }
  }
  if (!peers.length) {
    const syms = (PEER_MAP[sym] ?? []).filter((s) => s !== sym).slice(0, 4);
    if (syms.length && hasFmpKey()) {
      peers = await Promise.all(syms.map(async (s) => {
        const r = first(await getJson(url(FMP_PATHS.ratiosTtm, { symbol: s })));
        return { symbol: s, pe: pick(r, "priceToEarningsRatioTTM", "priceEarningsRatioTTM", "peRatioTTM"), evEbitda: pick(r, "enterpriseValueMultipleTTM"), ps: pick(r, "priceToSalesRatioTTM", "priceSalesRatioTTM"), pb: pick(r, "priceToBookRatioTTM") };
      }));
    } else if (syms.length) {
      peers = syms.map((s) => ({ symbol: s, pe: null, evEbitda: null, ps: null, pb: null }));
    }
  }
  if (!peers.length) notes.push("No peer set available — relative valuation unavailable.");
  return { peers, medianPE: median(peers.map((p) => posv(p.pe))), medianEvEbitda: median(peers.map((p) => posv(p.evEbitda))), medianPS: median(peers.map((p) => posv(p.ps))) };
}

const blankSources = (today: string): Provenance => ({
  ttm: { label: "Trailing-twelve-month metrics", form: "TTM", period: "TTM", fiscalDate: today, filingDate: null, url: null },
  market: { label: "Market quote", form: "Market data", period: "current", fiscalDate: today, filingDate: null, url: null },
});

// ---- FMP primary (rich: includes statements -> DCF) ----
export async function getFmpBundle(symbol: string): Promise<FmpBundle | null> {
  if (!hasFmpKey()) return null;
  const sym = symbol.toUpperCase().trim();
  const notes: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  const [profileR, quoteR, incomeR, balanceR, cashflowR, ratiosTtmR, newsR, stooq] = await Promise.all([
    getJson(url(FMP_PATHS.profile, { symbol: sym })),
    getJson(url(FMP_PATHS.quote, { symbol: sym })),
    getJson(url(FMP_PATHS.incomeAnnual, { symbol: sym, period: "annual", limit: 2 })),
    getJson(url(FMP_PATHS.balanceAnnual, { symbol: sym, period: "annual", limit: 1 })),
    getJson(url(FMP_PATHS.cashflowAnnual, { symbol: sym, period: "annual", limit: 4 })),
    getJson(url(FMP_PATHS.ratiosTtm, { symbol: sym })),
    getJson(url(FMP_PATHS.newsStock, { symbols: sym, limit: 10 })),
    getStooqSeries(sym),
  ]);

  const profile = first(profileR), quote = first(quoteR);
  if (!profile && !quote) return null; // FMP gave nothing -> caller tries lite fallback

  const income = arr(incomeR), cashflow = arr(cashflowR);
  const inc0 = income[0] ?? {}, bal0 = first(balanceR) ?? {}, cf0 = cashflow[0] ?? {}, ratios = first(ratiosTtmR);
  if (!cashflow.length) notes.push("FMP cash-flow statement returned no rows — DCF unavailable for this name.");

  const price = pick(quote, "price") ?? pick(profile, "price") ?? 0;
  const shares = pick(quote, "sharesOutstanding") ?? pick(profile, "sharesOutstanding") ?? (price > 0 ? (pick(quote, "marketCap") ?? pick(profile, "marketCap") ?? 0) / price : 0);
  const marketCap = pick(quote, "marketCap") ?? pick(profile, "marketCap") ?? (price && shares ? price * shares : 0);
  const market: MarketData = {
    price, dayChange: pick(quote, "change") ?? 0, dayChangePct: (pick(quote, "changePercentage", "changesPercentage") ?? 0) / 100,
    marketCap, sharesOutstanding: shares || 0, beta: pick(profile, "beta") ?? 1.0,
  };

  const fcfHistory = cashflow.map((c) => {
    const f = num(c.freeCashFlow); if (f != null) return f;
    const op = num(c.operatingCashFlow ?? c.netCashProvidedByOperatingActivities);
    const capex = num(c.capitalExpenditure); return op != null && capex != null ? op + capex : NaN;
  }).filter((x) => isFinite(x)) as number[];
  const totalDebt = pick(bal0, "totalDebt") ?? ((pick(bal0, "shortTermDebt") ?? 0) + (pick(bal0, "longTermDebt") ?? 0));
  const cash = pick(bal0, "cashAndShortTermInvestments", "cashAndCashEquivalents") ?? 0;
  const netDebt = pick(bal0, "netDebt") ?? (totalDebt - cash);
  const ebitda = pick(inc0, "ebitda", "EBITDA") ?? 0;
  const revenue = pick(inc0, "revenue") ?? 0;
  const ibt = pick(inc0, "incomeBeforeTax", "preTaxIncome"); const tax = pick(inc0, "incomeTaxExpense");
  let taxRate = ibt && ibt > 0 && tax != null ? tax / ibt : 0.21; taxRate = Math.max(0, Math.min(0.35, taxRate));
  const dividend = pick(ratios, "dividendPerShareTTM") ?? pick(profile, "lastDividend", "lastDiv") ?? 0;

  const fundamentals: Fundamentals = {
    freeCashFlow: fcfHistory[0] ?? 0, fcfHistory, ebitda, epsTTM: pick(quote, "eps") ?? pick(inc0, "epsDiluted", "epsdiluted", "eps") ?? 0,
    revenue, revenuePerShare: shares > 0 ? revenue / shares : 0, bookValuePerShare: 0,
    netDebt, totalDebt, cash, interestExpense: pick(inc0, "interestExpense") ?? 0, taxRate, dividendPerShare: dividend,
  };
  const ownEvEbitda = ebitda > 0 ? (marketCap + netDebt) / ebitda : null;
  const ownMultiples: OwnMultiples = {
    pe: pick(ratios, "priceToEarningsRatioTTM", "priceEarningsRatioTTM", "peRatioTTM") ?? pick(quote, "pe"),
    evEbitda: ownEvEbitda, ps: pick(ratios, "priceToSalesRatioTTM", "priceSalesRatioTTM"), pb: pick(ratios, "priceToBookRatioTTM"),
  };

  const peers = await getPeers(sym, notes);

  let series = stooq as PricePoint[];
  if (!series.length) {
    const priceR = await getJson(url(FMP_PATHS.priceEod, { symbol: sym, from: new Date(Date.now() - 760 * 86400000).toISOString().slice(0, 10) }));
    const rows = Array.isArray(priceR) ? priceR : arr((priceR as any)?.historical);
    series = rows.map((p: any) => ({ date: String(p.date).slice(0, 10), close: num(p.close ?? p.adjClose) ?? NaN, volume: num(p.volume) ?? undefined })).filter((p: PricePoint) => isFinite(p.close)).reverse();
  }
  if (series.length < 30) notes.push("Sparse price history — some technicals may be limited.");

  const news: NewsItem[] = arr(newsR).slice(0, 8).map((n: any) => ({ title: String(n.title ?? "").trim(), site: String(n.site ?? n.publisher ?? "").trim(), url: String(n.url ?? n.link ?? "#"), publishedDate: String(n.publishedDate ?? n.date ?? "").slice(0, 19) })).filter((n) => n.title);

  const periodLabel = (row: any) => { const fy = row?.fiscalYear || row?.calendarYear || (row?.date ? String(row.date).slice(0, 4) : ""); return fy ? `FY${fy}` : "FY"; };
  const mkSource = (row: any, label: string): SourceRef | undefined => row && row.date ? { label, form: "10-K", period: periodLabel(row), fiscalDate: String(row.date).slice(0, 10), filingDate: row.filingDate ? String(row.filingDate).slice(0, 10) : (row.fillingDate ? String(row.fillingDate).slice(0, 10) : null), url: row.finalLink || row.link || null } : undefined;

  return {
    market, fundamentals, ownMultiples, peers, analyst: { available: false, targetLow: null, targetMean: null, targetHigh: null, numAnalysts: null, estGrowth: null },
    fmpDcf: null, priceSeries: series, histMultiples: [], congress: [], news, riskFree: 0.043, riskFreeIsFallback: true,
    meta: { name: String(profile?.companyName ?? quote?.name ?? sym), exchange: String(profile?.exchangeShortName ?? profile?.exchange ?? ""), sector: String(profile?.sector ?? ""), industry: String(profile?.industry ?? ""), currency: String(profile?.currency ?? "USD"), priceAsOf: series.at(-1)?.date ?? today },
    sources: { ...blankSources(today), incomeAnnual: mkSource(inc0, `Annual income statement (${periodLabel(inc0)})`), balanceAnnual: mkSource(bal0, `Annual balance sheet (${periodLabel(bal0)})`), cashflowAnnual: mkSource(cf0, `Annual cash-flow statement (${periodLabel(cf0)})`), peers: peers.peers.length ? { label: "Peer multiples (TTM)", form: "Screen", period: "current", fiscalDate: today, filingDate: null, url: null } : undefined },
    notes, source: "FMP", kind: (profile?.isEtf === true || profile?.isFund === true) ? "fund" : "stock",
  };
}

// ---- Multi-source "lite" fallback when FMP is exhausted: Finnhub -> Alpha Vantage; prices Stooq -> AV ----
export async function getLiteBundle(symbol: string): Promise<FmpBundle | null> {
  const sym = symbol.toUpperCase().trim();
  const today = new Date().toISOString().slice(0, 10);
  const notes: string[] = [];

  let series = await getStooqSeries(sym);
  let price: number | null = null, change = 0, changePct = 0;
  let name = sym, sector = "", assetType = "", shares = 0, marketCap = 0, beta = 1;
  let pe: number | null = null, ps: number | null = null, pb: number | null = null, eps = 0, dividend = 0;
  let src = "";

  if (hasFinnhubKey()) {
    const [fq, fp, fm] = await Promise.all([finnhubQuote(sym), finnhubProfile(sym), finnhubMetricFull(sym)]);
    if (fq) { price = fq.price; change = fq.change; changePct = fq.changePct; src = "Finnhub"; }
    if (fp) { name = fp.name || name; sector = fp.sector || ""; shares = fp.shares || 0; marketCap = fp.marketCap || 0; }
    if (fm) { beta = num(fm.beta) ?? 1; pe = num(fm.peTTM); ps = num(fm.psTTM); pb = num(fm.pbTTM); eps = num(fm.epsTTM) ?? 0; dividend = num(fm.dividendPerShareTTM) ?? 0; }
  }
  if (price == null && hasAvKey()) {
    const [gq, ov] = await Promise.all([avGlobalQuote(sym), avOverview(sym)]);
    if (gq) { price = gq.price; change = gq.change; changePct = gq.changePct; src = "Alpha Vantage"; }
    if (ov) { name = ov.name || name; sector = ov.sector || ""; assetType = ov.assetType || ""; shares = ov.shares ?? 0; marketCap = ov.marketCap ?? 0; beta = ov.beta ?? 1; pe = ov.pe ?? null; ps = ov.ps ?? null; pb = ov.pb ?? null; eps = ov.eps ?? 0; dividend = ov.dividend ?? 0; }
    if (!series.length) series = await avDailySeries(sym);
  }
  if (price == null && series.length) price = series.at(-1)!.close;
  if (price == null && !series.length) return null;

  notes.push(`Live FMP budget exhausted — lighter read via ${src || "Stooq"} (+ Stooq prices). DCF needs FMP's statements and resumes at the daily reset.`);
  const peers = await getPeers(sym, notes);
  const market: MarketData = { price: price ?? 0, dayChange: change, dayChangePct: changePct, marketCap: marketCap || (price && shares ? price * shares : 0), sharesOutstanding: shares, beta };
  const fundamentals: Fundamentals = { freeCashFlow: 0, fcfHistory: [], ebitda: 0, epsTTM: eps, revenue: 0, revenuePerShare: 0, bookValuePerShare: 0, netDebt: 0, totalDebt: 0, cash: 0, interestExpense: 0, taxRate: 0.21, dividendPerShare: dividend };
  const ownMultiples: OwnMultiples = { pe, evEbitda: null, ps, pb };
  return {
    market, fundamentals, ownMultiples, peers, analyst: { available: false, targetLow: null, targetMean: null, targetHigh: null, numAnalysts: null, estGrowth: null },
    fmpDcf: null, priceSeries: series, histMultiples: [], congress: [], news: [], riskFree: 0.043, riskFreeIsFallback: true,
    meta: { name, exchange: "", sector, industry: sector, currency: "USD", priceAsOf: series.at(-1)?.date ?? today },
    sources: blankSources(today), notes, source: src || "Stooq", kind: assetType.toUpperCase() === "ETF" ? "fund" : "stock",
  };
}
