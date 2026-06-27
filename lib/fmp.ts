// ============================================================================
// Financial Modeling Prep client (stable namespace).
//
// Robustness notes baked in after real-world testing on the FREE tier:
//  - Field names differ across FMP's v3/v4/"stable" surfaces, so every metric
//    tries MULTIPLE candidate keys (e.g. dividend = lastDividend OR lastDiv).
//  - `stock-peers` is a PAID endpoint; when it's empty we fall back to a
//    built-in peer set so relative valuation still works on the free tier.
//  - Each endpoint that comes back empty pushes a human-readable note into
//    meta.notes (surfaced in the UI), so it's obvious what a given key returns.
// ============================================================================
import { getJson, num, pick } from "./http";
import { median } from "./valuation";
import type {
  Fundamentals, MarketData, OwnMultiples, PeerData, PeerMultiple, AnalystData,
  PricePoint, HistMultiplePoint, CongressTrade, NewsItem, Provenance, SourceRef, TxnType,
} from "./types";

const BASE = "https://financialmodelingprep.com/stable";

export const FMP_PATHS = {
  profile: "/profile", quote: "/quote",
  incomeAnnual: "/income-statement", balanceAnnual: "/balance-sheet-statement", cashflowAnnual: "/cash-flow-statement",
  keyMetricsTtm: "/key-metrics-ttm", ratiosTtm: "/ratios-ttm", keyMetricsAnnual: "/key-metrics",
  peers: "/stock-peers", priceEod: "/historical-price-eod/full",
  priceTargetConsensus: "/price-target-consensus", dcf: "/discounted-cash-flow",
  senate: "/senate-trades", house: "/house-trades", newsStock: "/news/stock", treasury: "/treasury-rates",
} as const;

// Built-in peer sets (free-tier fallback because FMP's peers endpoint is paid).
const PEER_MAP: Record<string, string[]> = {
  HAL: ["SLB", "BKR", "NOV", "WHD", "TS"], SLB: ["HAL", "BKR", "NOV", "WHD", "TS"], BKR: ["HAL", "SLB", "NOV", "WHD"],
  META: ["GOOGL", "SNAP", "PINS", "RDDT", "GOOG"], GOOGL: ["META", "MSFT", "AMZN", "GOOG"], GOOG: ["META", "MSFT", "AMZN", "GOOGL"],
  UNH: ["ELV", "CI", "HUM", "CVS", "CNC"], ELV: ["UNH", "CI", "HUM", "CVS", "CNC"], CVS: ["UNH", "ELV", "CI", "HUM", "CNC"],
  SLS: ["GERN", "KPTI", "CRVS", "ANAB"],
  AAPL: ["MSFT", "GOOGL", "AMZN", "HPQ", "DELL"], MSFT: ["AAPL", "GOOGL", "AMZN", "ORCL", "CRM"], NVDA: ["AMD", "INTC", "AVGO", "QCOM", "TSM"],
  AMD: ["NVDA", "INTC", "AVGO", "QCOM"], TSLA: ["GM", "F", "RIVN", "LCID", "TM"], AMZN: ["WMT", "GOOGL", "MSFT", "TGT"],
  JPM: ["BAC", "WFC", "C", "GS", "MS"], BAC: ["JPM", "WFC", "C", "GS"], NFLX: ["DIS", "WBD", "PARA", "CMCSA"],
  DIS: ["NFLX", "WBD", "PARA", "CMCSA"], KO: ["PEP", "KDP", "MNST", "CCEP"], PEP: ["KO", "MDLZ", "KDP", "MNST"],
  XOM: ["CVX", "COP", "BP", "SHEL"], CVX: ["XOM", "COP", "BP", "SHEL"], NKE: ["ADDYY", "LULU", "UAA", "SKX"],
  DIS_: [],
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

function mapTxnType(t: any): TxnType {
  const s = String(t ?? "").toLowerCase();
  if (s.includes("purchase") || s.includes("buy")) return "buy";
  if (s.includes("sale") || s.includes("sell")) return "sell";
  if (s.includes("exchange")) return "exchange";
  return "unknown";
}
function withinYear(d: string): boolean { const t = new Date(d).getTime(); return !isNaN(t) && Date.now() - t <= 400 * 86400000; }
function mapCongress(rows: any[], chamber: "house" | "senate"): CongressTrade[] {
  return arr(rows).map((r) => {
    const name = r.representative || r.office || [r.firstName, r.lastName].filter(Boolean).join(" ") || "Member of Congress";
    return { representative: String(name), chamber, type: mapTxnType(r.type || r.transactionType),
      amountRange: String(r.amount || r.range || "—"), transactionDate: String(r.transactionDate || r.date || ""),
      disclosureDate: String(r.disclosureDate || r.dateRecieved || r.filingDate || "") } as CongressTrade;
  }).filter((t) => t.transactionDate && withinYear(t.transactionDate)).sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : -1)).slice(0, 25);
}

export interface FmpBundle {
  market: MarketData; fundamentals: Fundamentals; ownMultiples: OwnMultiples; peers: PeerData; analyst: AnalystData;
  fmpDcf: number | null; priceSeries: PricePoint[]; histMultiples: HistMultiplePoint[]; congress: CongressTrade[];
  news: NewsItem[]; riskFree: number; riskFreeIsFallback: boolean;
  meta: { name: string; exchange: string; sector: string; industry: string; currency: string; priceAsOf: string };
  sources: Provenance; notes: string[];
}
const RISK_FREE_FALLBACK = 0.043;

// fetch P/E·EV-EBITDA·P/S·P/B for one peer, with quote.pe as a free fallback for P/E
async function peerMultiple(sym: string): Promise<PeerMultiple> {
  const [ratiosR, quoteR] = await Promise.all([
    getJson(url(FMP_PATHS.ratiosTtm, { symbol: sym })),
    getJson(url(FMP_PATHS.quote, { symbol: sym })),
  ]);
  const r = first(ratiosR), q = first(quoteR);
  return {
    symbol: sym,
    pe: pick(r, "priceToEarningsRatioTTM", "priceEarningsRatioTTM", "peRatioTTM") ?? pick(q, "pe"),
    evEbitda: pick(r, "enterpriseValueMultipleTTM", "evToEBITDATTM"),
    ps: pick(r, "priceToSalesRatioTTM", "priceSalesRatioTTM"),
    pb: pick(r, "priceToBookRatioTTM", "priceBookValueRatioTTM"),
  };
}

export async function getFmpBundle(symbol: string, peerLimit = 5): Promise<FmpBundle | null> {
  if (!hasFmpKey()) return null;
  const sym = symbol.toUpperCase().trim();
  const notes: string[] = [];
  const fromDate = new Date(Date.now() - 760 * 86400000).toISOString().slice(0, 10);

  const [profileR, quoteR, incomeR, balanceR, cashflowR, kmTtmR, ratiosTtmR, kmAnnualR, peersR, priceR, ptR, dcfR, senateR, houseR, newsR, treasuryR] = await Promise.all([
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

  const profile = first(profileR), quote = first(quoteR);
  if (!profile && !quote) return null;

  const income = arr(incomeR), balance = arr(balanceR), cashflow = arr(cashflowR);
  const km = first(kmTtmR), ratios = first(ratiosTtmR);
  const inc0 = income[0] ?? {}, bal0 = balance[0] ?? {}, cf0 = cashflow[0] ?? {};
  if (!income.length) notes.push("FMP income statement returned no rows for this symbol (free-tier limit or unsupported symbol).");
  if (!cashflow.length) notes.push("FMP cash-flow statement returned no rows — DCF will be unavailable.");

  const price = pick(quote, "price") ?? pick(profile, "price") ?? 0;
  const shares = pick(quote, "sharesOutstanding") ?? pick(profile, "sharesOutstanding")
    ?? (price > 0 ? (pick(quote, "marketCap") ?? pick(profile, "marketCap") ?? 0) / price : 0);
  const market: MarketData = {
    price: price ?? 0, dayChange: pick(quote, "change") ?? 0,
    dayChangePct: (pick(quote, "changePercentage", "changesPercentage") ?? 0) / 100,
    marketCap: pick(quote, "marketCap") ?? pick(profile, "marketCap") ?? (price && shares ? price * shares : 0),
    sharesOutstanding: shares || 0, beta: pick(profile, "beta") ?? 1.0,
  };

  const fcfHistory = cashflow.map((c) => {
    const f = num(c.freeCashFlow);
    if (f != null) return f;
    const op = num(c.operatingCashFlow ?? c.netCashProvidedByOperatingActivities ?? c.cashFlowFromOperations);
    const capex = num(c.capitalExpenditure ?? c.investmentsInPropertyPlantAndEquipment);
    return op != null && capex != null ? op + capex : NaN;
  }).filter((x) => isFinite(x)) as number[];

  const totalDebt = pick(bal0, "totalDebt") ?? ((pick(bal0, "shortTermDebt") ?? 0) + (pick(bal0, "longTermDebt") ?? 0));
  const cash = pick(bal0, "cashAndShortTermInvestments", "cashAndCashEquivalents") ?? 0;
  const netDebt = pick(bal0, "netDebt") ?? (totalDebt - cash);
  const ebitdaAnnual = pick(inc0, "ebitda", "EBITDA");
  const ebitdaTtm = (() => {
    const ev = pick(km, "enterpriseValueTTM", "enterpriseValue");
    const evMult = pick(km, "evToEBITDATTM", "enterpriseValueToEBITDATTM");
    if (ev != null && evMult && evMult > 0) return ev / evMult;
    return ebitdaAnnual ?? 0;
  })();
  const incomeBeforeTax = pick(inc0, "incomeBeforeTax", "preTaxIncome", "incomeBeforeIncomeTaxes");
  const incomeTax = pick(inc0, "incomeTaxExpense");
  let taxRate = incomeBeforeTax && incomeBeforeTax > 0 && incomeTax != null ? incomeTax / incomeBeforeTax : 0.21;
  taxRate = Math.max(0, Math.min(0.35, taxRate));

  const dividendPerShare =
    pick(ratios, "dividendPerShareTTM") ?? pick(km, "dividendPerShareTTM") ?? pick(profile, "lastDividend", "lastDiv") ?? 0;
  const revenueAnnual = pick(inc0, "revenue");
  const revenuePerShare = pick(km, "revenuePerShareTTM") ?? (market.sharesOutstanding > 0 && revenueAnnual ? revenueAnnual / market.sharesOutstanding : 0);

  const fundamentals: Fundamentals = {
    freeCashFlow: fcfHistory[0] ?? 0, fcfHistory, ebitda: ebitdaTtm ?? 0,
    epsTTM: pick(quote, "eps") ?? pick(km, "netIncomePerShareTTM") ?? pick(inc0, "epsDiluted", "epsdiluted", "eps") ?? 0,
    revenue: (pick(km, "revenuePerShareTTM") != null && market.sharesOutstanding) ? (km.revenuePerShareTTM * market.sharesOutstanding) : (revenueAnnual ?? 0),
    revenuePerShare: revenuePerShare ?? 0, bookValuePerShare: pick(km, "bookValuePerShareTTM") ?? 0,
    netDebt: netDebt ?? 0, totalDebt: totalDebt ?? 0, cash: cash ?? 0,
    interestExpense: pick(inc0, "interestExpense") ?? 0, taxRate, dividendPerShare: dividendPerShare ?? 0,
  };

  const ownMultiples: OwnMultiples = {
    pe: pick(ratios, "priceToEarningsRatioTTM", "priceEarningsRatioTTM", "peRatioTTM") ?? pick(quote, "pe"),
    evEbitda: pick(km, "evToEBITDATTM", "enterpriseValueToEBITDATTM") ?? pick(ratios, "enterpriseValueMultipleTTM"),
    ps: pick(ratios, "priceToSalesRatioTTM", "priceSalesRatioTTM"),
    pb: pick(ratios, "priceToBookRatioTTM", "priceBookValueRatioTTM"),
  };

  // peers: FMP endpoint (paid) -> built-in fallback
  let peerSymbols: string[] = [];
  const peersRaw = first(peersR);
  if (peersRaw && Array.isArray(peersRaw.peersList)) peerSymbols = peersRaw.peersList;
  else peerSymbols = arr(peersR).map((p: any) => p.symbol || p.peer).filter(Boolean);
  peerSymbols = peerSymbols.filter((s) => s && s !== sym);
  if (!peerSymbols.length) {
    peerSymbols = (PEER_MAP[sym] ?? []).filter((s) => s !== sym);
    if (peerSymbols.length) notes.push("FMP stock-peers is a paid endpoint — using a built-in peer set for relative valuation.");
    else notes.push("No peer set available for this symbol — relative valuation will be unavailable.");
  }
  peerSymbols = peerSymbols.slice(0, peerLimit);
  const peers: PeerMultiple[] = peerSymbols.length ? await Promise.all(peerSymbols.map(peerMultiple)) : [];
  const posv = (x: number | null) => (x != null && x > 0 ? x : null);
  const peerData: PeerData = {
    peers,
    medianPE: median(peers.map((p) => posv(p.pe))),
    medianEvEbitda: median(peers.map((p) => posv(p.evEbitda))),
    medianPS: median(peers.map((p) => posv(p.ps))),
  };

  const pt = first(ptR);
  const analyst: AnalystData = {
    available: !!pt && (pick(pt, "targetConsensus", "targetMean") != null),
    targetLow: pick(pt, "targetLow"), targetMean: pick(pt, "targetConsensus", "targetMean", "targetMedian"),
    targetHigh: pick(pt, "targetHigh"), numAnalysts: pick(pt, "numberOfAnalysts", "analystCount"), estGrowth: null,
  };
  if (!analyst.available) notes.push("Analyst price targets unavailable (paid FMP endpoint or no coverage) — analyst row hidden.");

  const priceRows = Array.isArray(priceR) ? priceR : arr((priceR as any)?.historical);
  const series: PricePoint[] = priceRows
    .map((p: any) => ({ date: String(p.date).slice(0, 10), close: num(p.close ?? p.adjClose) ?? NaN, volume: num(p.volume) ?? undefined }))
    .filter((p: PricePoint) => isFinite(p.close)).reverse();
  if (series.length < 30) notes.push("Sparse price history — some technicals may be limited.");

  const histMultiples: HistMultiplePoint[] = arr(kmAnnualR)
    .map((k: any) => ({ date: String(k.date).slice(0, 10), pe: pick(k, "peRatio", "priceToEarningsRatio"), evEbitda: pick(k, "evToEBITDA", "enterpriseValueOverEBITDA") }))
    .filter((h) => h.pe != null || h.evEbitda != null).reverse();

  const congress = [...mapCongress(arr(senateR), "senate"), ...mapCongress(arr(houseR), "house")].sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : -1));

  const news: NewsItem[] = arr(newsR).slice(0, 10).map((n: any) => ({
    title: String(n.title ?? "").trim(), site: String(n.site ?? n.publisher ?? "").trim(),
    url: String(n.url ?? n.link ?? "#"), publishedDate: String(n.publishedDate ?? n.date ?? "").slice(0, 19),
  })).filter((n) => n.title);

  let riskFree = RISK_FREE_FALLBACK, riskFreeIsFallback = true;
  const ten = pick(first(treasuryR), "year10", "10Y", "_10Y", "month120");
  if (ten != null && ten > 0) { riskFree = ten / 100; riskFreeIsFallback = false; }

  const fmpDcf = pick(first(dcfR), "dcf", "discountedCashFlow");

  const periodLabel = (row: any) => { const fy = row?.fiscalYear || row?.calendarYear || (row?.date ? String(row.date).slice(0, 4) : ""); return fy ? `FY${fy}` : "FY"; };
  const mkSource = (row: any, label: string): SourceRef | undefined => row && row.date ? {
    label, form: "10-K", period: periodLabel(row), fiscalDate: String(row.date).slice(0, 10),
    filingDate: row.filingDate ? String(row.filingDate).slice(0, 10) : (row.fillingDate ? String(row.fillingDate).slice(0, 10) : null),
    url: row.finalLink || row.link || null,
  } : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const sources: Provenance = {
    incomeAnnual: mkSource(inc0, `Annual income statement (${periodLabel(inc0)})`),
    balanceAnnual: mkSource(bal0, `Annual balance sheet (${periodLabel(bal0)})`),
    cashflowAnnual: mkSource(cf0, `Annual cash-flow statement (${periodLabel(cf0)})`),
    ttm: { label: "Trailing-twelve-month metrics", form: "TTM", period: "TTM", fiscalDate: today, filingDate: null, url: null },
    market: { label: "Market quote", form: "Market data", period: "current", fiscalDate: today, filingDate: null, url: null },
    peers: peers.length ? { label: "Peer multiples (TTM)", form: "Screen", period: "current", fiscalDate: today, filingDate: null, url: null } : undefined,
    analyst: analyst.available ? { label: "Analyst price-target consensus", form: "Consensus", period: "current", fiscalDate: today, filingDate: null, url: null } : undefined,
  };

  return {
    market, fundamentals, ownMultiples, peers: peerData, analyst, fmpDcf, priceSeries: series, histMultiples,
    congress, news, riskFree, riskFreeIsFallback,
    meta: {
      name: String(profile?.companyName ?? quote?.name ?? sym),
      exchange: String(profile?.exchangeShortName ?? profile?.exchange ?? quote?.exchange ?? ""),
      sector: String(profile?.sector ?? ""), industry: String(profile?.industry ?? ""),
      currency: String(profile?.currency ?? "USD"),
      priceAsOf: String(quote?.timestamp ? new Date(quote.timestamp * 1000).toISOString().slice(0, 10) : (series.at(-1)?.date ?? today)),
    },
    sources, notes,
  };
}
