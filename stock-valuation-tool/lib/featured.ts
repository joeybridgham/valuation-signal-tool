// The four pre-generated featured tickers. Their pages are statically generated
// at build time (real data when keys are present; labeled sample otherwise).
export interface FeaturedTicker {
  symbol: string;
  name: string;
  blurb: string;
  dividendPayer: boolean;
}

export const FEATURED: FeaturedTicker[] = [
  { symbol: "SLS", name: "SELLAS Life Sciences", blurb: "Clinical-stage biotech. Negative FCF, no dividend, little chatter, the clean test of empty states.", dividendPayer: false },
  { symbol: "META", name: "Meta Platforms", blurb: "Mega-cap, heavy free cash flow. Treated as a non-payer, so the DDM is skipped.", dividendPayer: false },
  { symbol: "UNH", name: "UnitedHealth Group", blurb: "Managed care. Dividend payer, the DDM is included.", dividendPayer: true },
  { symbol: "HAL", name: "Halliburton", blurb: "Energy services. Dividend payer with a cyclical earnings base.", dividendPayer: true },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", blurb: "An index fund, shows the fund view: top holdings, full-holdings dropdown, expense ratio, price chart. No valuation/congress.", dividendPayer: true },
  { symbol: "QQQ", name: "Invesco QQQ Trust", blurb: "Nasdaq-100 ETF. Fund view: top holdings, full-holdings dropdown, expense ratio, price chart.", dividendPayer: true },
];

export const FEATURED_SYMBOLS = FEATURED.map((f) => f.symbol);
export function featuredBySymbol(sym: string): FeaturedTicker | undefined {
  return FEATURED.find((f) => f.symbol === sym.toUpperCase());
}
