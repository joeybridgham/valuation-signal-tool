// Alpha Vantage, free (25/day, 5/min). A fundamentals/quote BACKUP and the
// source for the fund/ETF view (ETF_PROFILE = holdings + expense ratio).
// Returns null on rate-limit ("Note"/"Information") or empty payloads.
import { getJson, num } from "./http";
import type { PricePoint, FundData, FundHolding } from "./types";

const BASE = "https://www.alphavantage.co/query";
export function hasAvKey(): boolean { return !!process.env.ALPHAVANTAGE_API_KEY && process.env.ALPHAVANTAGE_API_KEY.length > 3; }
function av(fn: string, extra: Record<string, string>): string {
  return `${BASE}?${new URLSearchParams({ function: fn, ...extra, apikey: process.env.ALPHAVANTAGE_API_KEY ?? "" })}`;
}
const limited = (r: any) => !r || r.Note || r.Information || r["Error Message"];

export interface ProviderQuote {
  price: number | null; change: number | null; changePct: number | null;
  name?: string; sector?: string; assetType?: string; shares?: number | null; marketCap?: number | null;
  beta?: number | null; pe?: number | null; ps?: number | null; pb?: number | null; eps?: number | null;
  dividend?: number | null; ebitda?: number | null; revenue?: number | null;
}

export async function avOverview(symbol: string): Promise<ProviderQuote | null> {
  const r = await getJson<any>(av("OVERVIEW", { symbol }), { revalidate: 60 * 60 * 24 });
  if (limited(r) || !r.Symbol) return null;
  return {
    price: null, change: null, changePct: null, name: r.Name, sector: r.Sector, assetType: r.AssetType,
    shares: num(r.SharesOutstanding), marketCap: num(r.MarketCapitalization), beta: num(r.Beta),
    pe: num(r.PERatio), ps: num(r.PriceToSalesRatioTTM), pb: num(r.PriceToBookRatio), eps: num(r.EPS),
    dividend: num(r.DividendPerShare), ebitda: num(r.EBITDA), revenue: num(r.RevenueTTM),
  };
}

export async function avGlobalQuote(symbol: string): Promise<{ price: number; change: number; changePct: number } | null> {
  const r = await getJson<any>(av("GLOBAL_QUOTE", { symbol }), { revalidate: 60 * 30 });
  const q = r?.["Global Quote"]; const price = num(q?.["05. price"]);
  if (price == null) return null;
  const pct = String(q?.["10. change percent"] ?? "").replace("%", "");
  return { price, change: num(q?.["09. change"]) ?? 0, changePct: (num(pct) ?? 0) / 100 };
}

export async function avDailySeries(symbol: string): Promise<PricePoint[]> {
  const r = await getJson<any>(av("TIME_SERIES_DAILY", { symbol, outputsize: "compact" }), { revalidate: 60 * 60 * 12 });
  const ts = r?.["Time Series (Daily)"]; if (!ts) return [];
  return Object.entries(ts).map(([date, v]: [string, any]) => ({ date, close: num(v["4. close"]) ?? NaN, volume: num(v["5. volume"]) ?? undefined }))
    .filter((p) => isFinite(p.close)).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function avEtfProfile(symbol: string): Promise<FundData | null> {
  const r = await getJson<any>(av("ETF_PROFILE", { symbol }), { revalidate: 60 * 60 * 24 });
  if (limited(r)) return null;
  const holdings: FundHolding[] = Array.isArray(r.holdings)
    ? r.holdings.map((h: any) => ({ symbol: String(h.symbol ?? "").toUpperCase(), name: String(h.description ?? ""), weight: num(h.weight) ?? 0 }))
        .filter((h: FundHolding) => h.symbol && h.symbol !== "N/A")
    : [];
  const sectors = Array.isArray(r.sectors) ? r.sectors.map((s: any) => ({ sector: String(s.sector ?? ""), weight: num(s.weight) ?? 0 })).filter((s: any) => s.sector) : [];
  if (!holdings.length && r.net_expense_ratio == null && r.net_assets == null) return null;
  return {
    expenseRatio: num(r.net_expense_ratio), netAssets: num(r.net_assets), inception: r.inception_date || null,
    dividendYield: num(r.dividend_yield), turnover: num(r.portfolio_turnover), issuer: null, assetType: "ETF",
    sectors, holdings: holdings.sort((a, b) => b.weight - a.weight),
  };
}

export interface AvStatements {
  freeCashFlow: number | null; fcfHistory: number[]; netDebt: number | null; cash: number | null;
  totalDebt: number | null; ebitda: number | null; revenue: number | null; taxRate: number | null;
  bookValuePerShare: number | null; shares: number | null;
}
export async function avStatements(symbol: string): Promise<AvStatements | null> {
  const [cf, bs, is] = await Promise.all([
    getJson<any>(av("CASH_FLOW", { symbol }), { revalidate: 60 * 60 * 24 }),
    getJson<any>(av("BALANCE_SHEET", { symbol }), { revalidate: 60 * 60 * 24 }),
    getJson<any>(av("INCOME_STATEMENT", { symbol }), { revalidate: 60 * 60 * 24 }),
  ]);
  if (limited(cf) && limited(bs) && limited(is)) return null;
  const cfa: any[] = cf?.annualReports ?? [];
  const bs0: any = (bs?.annualReports ?? [])[0] ?? {};
  const is0: any = (is?.annualReports ?? [])[0] ?? {};
  if (!cfa.length && !Object.keys(bs0).length && !Object.keys(is0).length) return null;
  const fcfHistory = cfa.map((r) => {
    const op = num(r.operatingCashflow); const capex = num(r.capitalExpenditures);
    return op != null && capex != null ? op - capex : NaN;
  }).filter((x) => isFinite(x)) as number[];
  const totalDebt = num(bs0.shortLongTermDebtTotal) ?? ((num(bs0.shortTermDebt) ?? 0) + (num(bs0.longTermDebt) ?? 0));
  const cash = num(bs0.cashAndShortTermInvestments) ?? num(bs0.cashAndCashEquivalentsAtCarryingValue);
  const equity = num(bs0.totalShareholderEquity);
  const shares = num(bs0.commonStockSharesOutstanding);
  const ibt = num(is0.incomeBeforeTax); const tax = num(is0.incomeTaxExpense);
  return {
    freeCashFlow: fcfHistory[0] ?? null, fcfHistory, cash, totalDebt,
    netDebt: totalDebt != null && cash != null ? totalDebt - cash : null,
    ebitda: num(is0.ebitda), revenue: num(is0.totalRevenue),
    taxRate: ibt && ibt > 0 && tax != null ? Math.max(0, Math.min(0.35, tax / ibt)) : null,
    bookValuePerShare: equity != null && shares ? equity / shares : null, shares,
  };
}
