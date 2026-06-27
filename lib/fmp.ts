// ============================================================================
// Financial Modeling Prep client.
//
// One commented PATH MAP so any endpoint that FMP shifts (they have been
// migrating across v3 / v4 / "stable") is trivial to correct in ONE place.
// Verified against FMP's live "stable" docs (June 2026). Endpoints most likely
// to be plan-gated on the free tier are marked GATED — they degrade gracefully.
//
// All calls are server-side, cached, and individually fault-tolerant.
// ============================================================================

import { getJson, num, pick } from "./http";
import { median } from "./valuation";
import type {
  Fundamentals, MarketData, OwnMultiples, PeerData, PeerMultiple, AnalystData,
  PricePoint, HistMultiplePoint, CongressTrade, NewsItem, Provenance, SourceRef, TxnType,
} from "./types";

const BASE = "https://financialmodelingprep.com/stable";

// --- single source of truth for endpoint paths (relative to BASE) ----------
export const FMP_PATHS = {
  profile: "/profile",                                  // ?symbol=
  quote: "/quote",                                      // ?symbol=
  incomeAnnual: "/income-statement",                    // ?symbol=&period=annual&limit=
  balanceAnnual: "/balance-sheet-statement",            // ?symbol=&period=annual&limit=
  cashflowAnnual: "/cash-flow-statement",               // ?symbol=&period=annual&limit=
  keyMetricsTtm: "/key-metrics-ttm",                    // ?symbol=
  ratiosTtm: "/ratios-ttm",                             // ?symbol=
  keyMetricsAnnual: "/key-metrics",                     // ?symbol=&period=annual&limit=  (historical multiples)
  peers: "/stock-peers",                                // ?symbol=
  priceEod: "/historical-price-eod/full",               // ?symbol=&from=
  priceTargetConsensus: "/price-target-consensus",      // ?symbol=          (GATED on some plans)
  analystEstimates: "/analyst-estimates",               // ?symbol=&period=annual (GATED)
  dcf: "/discounted-cash-flow",                         // ?symbol=
  senate: "/senate-trades",                             // ?symbol=          (GATED)
  house: "/house-trades",                               // ?symbol=          (GATED)
  newsStock: "/news/stock",                             // ?symbols=&limit=
  treasury: "/treasury-rates",                          // (GATED on some plans; we fall back)
} as const;

function url(path: string, params: Record<string, string | number | undefined>): string {
  const key = process.env.FMP_API_KEY ?? "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) sp.set(k, String(v));
  sp.set("apikey", key);
  return `${BASE}${path}?${sp.toString()}`;
}

const arr = <T = any>(x: any): T[] => (Array.isArray(x) ? x : []);
const first = (x: any): any => (Array.isArray(x) ? x[0] : x) ?? null;

export function hasFmpKey(): boolean {
  return !!process.env.FMP_API_KEY && process.env.FMP_API_KEY.length > 5;
}

// ---- congressional trade normalization ----
function mapTxnType(t: any): TxnType {
  const s = String(t ?? "").toLowerCase();
  if (s.includes("purchase") || s.includes("buy")) return "buy";
  if (s.includes("sale") || s.includes("sell")) return "sell";
  if (s.includes("exchange")) return "exchange";
  return "unknown";
}
function withinYear(dateStr: string): boolean {
  const d = new Date(dateStr).getTime();
  if (isNaN(d)) return false;
  return Date.now() - d <= 400 * 86400000; // ~13 months window
}
function mapCongress(rows: any[], chamber: "house" | "senate"): CongressTrade[] {
  return arr(rows)
    .map((r) => {
      const name = r.representative || r.office ||
        [r.firstName, r.lastName].filter(Boolean).join(" ") || "Member of Congress";
      const txDate = r.transactionDate || r.dateRecieved || r.date || "";
      return {
        representative: String(name),
        chamber,
        type: mapTxnType(r.type || r.transactionType),
        amountRange: String(r.amount || r.range || r.assetDescription || "—"),
        transactionDate: String(txDate),
        disclosureDate: String(r.disclosureDate || r.dateRecieved || r.filingDate || ""),
      } as CongressTrade;
    })
    .filter((t) => t.transactionDate && withinYear(t.transactionDate))
    .sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : -1))
    .slice(0, 25);
}

export interface FmpBundle {
  market: MarketData;
  fundamentals: Fundamentals;
  ownMultiples: OwnMultiples;
  peers: PeerData;
  analyst: AnalystData;
  fmpDcf: number | null;
  priceSeries: PricePoint[];
  histMultiples: HistMultiplePoint[];
  congress: CongressTrade[];
  news: NewsItem[];
  riskFree: number;
  riskFreeIsFallback: boolean;
  meta: { name: string; exchange: string; sector: string; industry: string; currency: string; priceAsOf: string };
  sources: Provenance;
  notes: string[];
}

const RISK_FREE_FALLBACK = 0.043;

export async function getFmpBundle(symbol: string, peerLimit = 5): Promise<FmpBundle | null> {
  if (!hasFmpKey()) return null;
  const sym = symbol.toUpperCase().trim();
  const notes: string[] = [];
  const fromDate = new Date(Date.now() - 760 * 86400000).toISOString().slice(0, 10);

  // Fire the core requests in parallel — keeps us well under the 10s budget.
  const [
    profileR, quoteR, incomeR, balanceR, cashflowR, kmTtmR, ratiosTtmR, kmAnnualR,
    peersR, priceR, ptR, dcfR, senateR, houseR, newsR, treasuryR,
  ] = await Promise.all([
    getJson(url(FMP_PATHS.profile, { symbol: sym })),
    getJson(url(FMP_PATHS.quote, { symbol: sym })),
    getJson(url(FMP_PATHS.incomeAnnual, { symbol: sym, period: "annual", limit: 5 })),
    getJson(url(FMP_PATHS.balanceAnnual, { symbol: sym, period: "annual", limit: 2 })),
    getJson(url(FMP_PATHS.cashflowAnnual, { symbol: sym, period: "annual", limit: 5 })),
    getJson(url(FMP_PATHS.keyMetricsTtm, { symbol: sym })),
    getJson(url(FMP_PATHS.ratiosTtm, { symbol: sym })),
    getJson(url(FMP_PATHS.keyMetricsAnnual, { symbol: sym, period: "annual", limit: 10 })),
    getJson(url(FMP_PATHS.peers, { symbol: sym })),
    getJson(url(FMP_PATHS.priceEod, { symbol: sym, from: fromDate })),
    getJson(url(FMP_PATHS.priceTargetConsensus, { symbol: sym })),
    getJson(url(FMP_PATHS.dcf, { symbol: sym })),
    getJson(url(FMP_PATHS.senate, { symbol: sym })),
    getJson(url(FMP_PATHS.house, { symbol: sym })),
    getJson(url(FMP_PATHS.newsStock, { symbols: sym, limit: 12 })),
    getJson(url(FMP_PATHS.treasury, {})),
  ]);

  const profile = first(profileR);
  const quote = first(quoteR);
  if (!profile && !quote) return null; // truly nothing — let caller fall back

  const income = arr(incomeR);
  const balance = arr(balanceR);
  const cashflow = arr(cashflowR);
  const km = first(kmTtmR);
  const ratios = first(ratiosTtmR);
  const inc0 = income[0] ?? {};
  const bal0 = balance[0] ?? {};
  const cf0 = cashflow[0] ?? {};

  // ---- market ----
  const price = pick(quote, "price") ?? pick(profile, "price") ?? 0;
  const shares = pick(quote, "sharesOutstanding") ?? pick(profile, "sharesOutstanding")
    ?? (price > 0 ? (pick(quote, "marketCap") ?? pick(profile, "marketCap") ?? 0) / price : 0);
  const market: MarketData = {
    price: price ?? 0,
    dayChange: pick(quote, "change") ?? 0,
    dayChangePct: (pick(quote, "changePercentage", "changesPercentage") ?? 0) / 100,
    marketCap: pick(quote, "marketCap") ?? pick(profile, "marketCap") ?? (price && shares ? price * shares : 0),
    sharesOutstanding: shares || 0,
    beta: pick(profile, "beta") ?? 1.0,
  };

  // ---- fundamentals ----
  const fcfHistory = cashflow.map((c) => {
    const f = num(c.freeCashFlow);
    if (f != null) return f;
    const op = num(c.operatingCashFlow ?? c.netCashProvidedByOperatingActivities);
    const capex = num(c.capitalExpenditure);
    return op != null && capex != null ? op + capex : NaN; // capex is negative in FMP
  }).filter((x) => isFinite(x)) as number[];

  const totalDebt = pick(bal0, "totalDebt") ?? ((pick(bal0, "shortTermDebt") ?? 0) + (pick(bal0, "longTermDebt") ?? 0));
  const cash = pick(bal0, "cashAndShortTermInvestments", "cashAndCashEquivalents") ?? 0;
  const netDebt = pick(bal0, "netDebt") ?? (totalDebt - cash);
  const ebitdaTtm = (() => {
    const ev = pick(km, "enterpriseValueTTM", "enterpriseValue");
    const evMult = pick(km, "evToEBITDATTM", "enterpriseValueOverEBITDATTM");
    if (ev != null && evMult && evMult > 0) return ev / evMult;
    return pick(inc0, "ebitda") ?? 0;
  })();
  const incomeBeforeTax = pick(inc0, "incomeBeforeTax", "preTaxIncome");
  const incomeTax = pick(inc0, "incomeTaxExpense");
  let taxRate = incomeBeforeTax && incomeBeforeTax > 0 && incomeTax != null ? incomeTax / incomeBeforeTax : 0.21;
  taxRate = Math.max(0, Math.min(0.35, taxRate));

  const dividendPerShare =
    pick(ratios, "dividendPerShareTTM") ?? pick(km, "dividendPerShareTTM") ?? pick(profile, "lastDiv") ?? 0;

  const revenuePerShare = pick(km, "revenuePerShareTTM") ?? (market.sharesOutstanding > 0 ? (pick(inc0, "revenue") ?? 0) / market.sharesOutstanding : 0);
  const fundamentals: Fundamentals = {
    freeCashFlow: fcfHistory[0] ?? 0,
    fcfHistory,
    ebitda: ebitdaTtm ?? 0,
    epsTTM: pick(quote, "eps") ?? pick(km, "netIncomePerShareTTM") ?? pick(inc0, "epsdiluted", "eps") ?? 0,
    revenue: pick(km, "revenuePerShareTTM") != null && market.sharesOutstanding ? (km.revenuePerShareTTM * market.sharesOutstanding) : (pick(inc0, "revenue") ?? 0),
    revenuePerShare: revenuePerShare ?? 0,
    bookValuePerShare: pick(km, "bookValuePerShareTTM") ?? 0,
    netDebt: netDebt ?? 0,
    totalDebt: totalDebt ?? 0,
    cash: cash ?? 0,
    interestExpense: pick(inc0, "interestExpense") ?? 0,
    taxRate,
    dividendPerShare: dividendPerShare ?? 0,
  };

  // ---- own multiples ----
  const ownMultiples: OwnMultiples = {
    pe: pick(ratios, "priceEarningsRatioTTM", "peRatioTTM") ?? pick(quote, "pe"),
    evEbitda: pick(km, "evToEBITDATTM") ?? pick(ratios, "enterpriseValueMultipleTTM"),
    ps: pick(ratios, "priceToSalesRatioTTM", "priceSalesRatioTTM"),
    pb: pick(ratios, "priceToBookRatioTTM", "priceBookValueRatioTTM"),
  };

  // ---- peers (cap to peerLimit; one ratios-ttm call each) ----
  let peerSymbols: string[] = [];
  const peersRaw = first(peersR);
  if (peersRaw && Array.isArray(peersRaw.peersList)) peerSymbols = peersRaw.peersList;
  else peerSymbols = arr(peersR).map((p: any) => p.symbol || p.peer).filter(Boolean);
  peerSymbols = peerSymbols.filter((s) => s && s !== sym).slice(0, peerLimit);

  const peerRatios = await Promise.all(
    peerSymbols.map((ps) => getJson(url(FMP_PATHS.ratiosTtm, { symbol: ps })))
  );
  const peers: PeerMultiple[] = peerSymbols.map((ps, i) => {
    const r = first(peerRatios[i]);
    return {
      symbol: ps,
      pe: pick(r, "priceEarningsRatioTTM", "peRatioTTM"),
      evEbitda: pick(r, "enterpriseValueMultipleTTM"),
      ps: pick(r, "priceToSalesRatioTTM", "priceSalesRatioTTM"),
      pb: pick(r, "priceToBookRatioTTM", "priceBookValueRatioTTM"),
    };
  });
  const pos = (x: number | null) => (x != null && x > 0 ? x : null);
  const peerData: PeerData = {
    peers,
    medianPE: median(peers.map((p) => pos(p.pe))),
    medianEvEbitda: median(peers.map((p) => pos(p.evEbitda))),
    medianPS: median(peers.map((p) => pos(p.ps))),
  };
  if (!peers.length) notes.push("No peer set returned — relative valuation may be unavailable.");

  // ---- analyst consensus ----
  const pt = first(ptR);
  const analyst: AnalystData = {
    available: !!pt && (pick(pt, "targetConsensus", "targetMean") != null),
    targetLow: pick(pt, "targetLow"),
    targetMean: pick(pt, "targetConsensus", "targetMean", "targetMedian"),
    targetHigh: pick(pt, "targetHigh"),
    numAnalysts: pick(pt, "numberOfAnalysts", "analystCount"),
    estGrowth: null,
  };
  if (!analyst.available) notes.push("No analyst price-target consensus available (free-tier limit or no coverage).");

  // ---- price series (oldest -> newest) ----
  let series: PricePoint[] = [];
  const priceRows = Array.isArray(priceR) ? priceR : arr((priceR as any)?.historical);
  series = priceRows
    .map((p: any) => ({ date: String(p.date).slice(0, 10), close: num(p.close ?? p.adjClose) ?? NaN, volume: num(p.volume) ?? undefined }))
    .filter((p: PricePoint) => isFinite(p.close))
    .reverse();
  if (series.length < 30) notes.push("Sparse price history — some technicals may be limited.");

  // ---- historical multiples ----
  const histMultiples: HistMultiplePoint[] = arr(kmAnnualR)
    .map((k: any) => ({ date: String(k.date).slice(0, 10), pe: pick(k, "peRatio"), evEbitda: pick(k, "evToEBITDA", "enterpriseValueOverEBITDA") }))
    .filter((h) => h.pe != null || h.evEbitda != null)
    .reverse();

  // ---- congressional ----
  const congress = [...mapCongress(arr(senateR), "senate"), ...mapCongress(arr(houseR), "house")]
    .sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : -1));

  // ---- news ----
  const news: NewsItem[] = arr(newsR).slice(0, 10).map((n: any) => ({
    title: String(n.title ?? "").trim(),
    site: String(n.site ?? n.publisher ?? n.source ?? "").trim(),
    url: String(n.url ?? n.link ?? "#"),
    publishedDate: String(n.publishedDate ?? n.date ?? "").slice(0, 19),
    snippet: n.text ? String(n.text).slice(0, 200) : undefined,
  })).filter((n) => n.title);

  // ---- risk-free (10y treasury) ----
  let riskFree = RISK_FREE_FALLBACK, riskFreeIsFallback = true;
  const tr = first(treasuryR);
  const ten = pick(tr, "year10", "10Y", "_10Y");
  if (ten != null && ten > 0) { riskFree = ten / 100; riskFreeIsFallback = false; }
  else notes.push(`10-year Treasury unavailable — risk-free defaulted to ${(RISK_FREE_FALLBACK * 100).toFixed(1)}%.`);

  // ---- DCF cross-check ----
  const fmpDcf = pick(first(dcfR), "dcf", "discountedCashFlow");

  // ---- provenance ----
  const periodLabel = (row: any) => {
    const fy = row?.calendarYear || (row?.date ? String(row.date).slice(0, 4) : "");
    return fy ? `FY${fy}` : "FY";
  };
  const mkSource = (row: any, label: string): SourceRef | undefined => {
    if (!row || !row.date) return undefined;
    return {
      label, form: "10-K", period: periodLabel(row),
      fiscalDate: String(row.date).slice(0, 10),
      filingDate: row.fillingDate ? String(row.fillingDate).slice(0, 10) : (row.filingDate ? String(row.filingDate).slice(0, 10) : null),
      url: row.finalLink || row.link || null,
    };
  };
  const sources: Provenance = {
    incomeAnnual: mkSource(inc0, `Annual income statement (${periodLabel(inc0)})`),
    balanceAnnual: mkSource(bal0, `Annual balance sheet (${periodLabel(bal0)})`),
    cashflowAnnual: mkSource(cf0, `Annual cash-flow statement (${periodLabel(cf0)})`),
    ttm: { label: "Trailing-twelve-month metrics", form: "TTM", period: "TTM", fiscalDate: new Date().toISOString().slice(0, 10), filingDate: null, url: null },
    market: { label: "Market quote", form: "Market data", period: "current", fiscalDate: new Date().toISOString().slice(0, 10), filingDate: null, url: null },
    peers: peers.length ? { label: "Peer multiples (TTM)", form: "Screen", period: "current", fiscalDate: new Date().toISOString().slice(0, 10), filingDate: null, url: null } : undefined,
    analyst: analyst.available ? { label: "Analyst price-target consensus", form: "Consensus", period: "current", fiscalDate: new Date().toISOString().slice(0, 10), filingDate: null, url: null } : undefined,
  };

  return {
    market, fundamentals, ownMultiples, peers: peerData, analyst, fmpDcf,
    priceSeries: series, histMultiples, congress, news, riskFree, riskFreeIsFallback,
    meta: {
      name: String(profile?.companyName ?? quote?.name ?? sym),
      exchange: String(profile?.exchangeShortName ?? profile?.exchange ?? quote?.exchange ?? ""),
      sector: String(profile?.sector ?? ""),
      industry: String(profile?.industry ?? ""),
      currency: String(profile?.currency ?? "USD"),
      priceAsOf: String(quote?.timestamp ? new Date(quote.timestamp * 1000).toISOString().slice(0, 10) : (series.at(-1)?.date ?? new Date().toISOString().slice(0, 10))),
    },
    sources, notes,
  };
}
