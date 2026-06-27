"use client";
import type { AnalyzeResult } from "@/lib/types";
import { fmtUSD, fmtPct, fmtDate } from "@/lib/format";
import { PriceChart } from "./Charts";
import { RetailBuzz, NewsFeed, SampleBanner } from "./Panels";
import Watchlist from "./Watchlist";
import PdfButton from "./PdfButton";

export default function FundView({ data }: { data: AnalyzeResult }) {
  const f = data.fund;
  const holdings = f?.holdings ?? [];
  const top = holdings.slice(0, 10);

  return (
    <div className="stack" style={{ gap: 26 }}>
      <div className="ticker-head no-print">
        <div>
          <div className="row center" style={{ gap: 10 }}>
            <h1 className="h2" style={{ fontSize: "2rem" }}>{data.meta.symbol}</h1>
            <span className="badge badge-ink">{f?.assetType || "Fund / ETF"}</span>
          </div>
          <div className="muted">{data.meta.name}</div>
          <div className="as-of">Data as of {fmtDate(data.meta.priceAsOf)}{data.meta.isSample && " · sample"}</div>
        </div>
        <div className="row" style={{ gap: 8 }}><Watchlist current={data.meta.symbol} /><PdfButton /></div>
      </div>

      <SampleBanner data={data} />

      <div className="kpi-row">
        <div className="kpi"><div className="kpi-label">Price</div><div className="kpi-value">{fmtUSD(data.market.price)}</div><div className={`small mono ${data.market.dayChangePct >= 0 ? "delta-pos" : "delta-neg"}`}>{fmtPct(data.market.dayChangePct, 2, true)} today</div></div>
        <div className="kpi"><div className="kpi-label">Expense ratio</div><div className="kpi-value">{f?.expenseRatio != null ? fmtPct(f.expenseRatio, 2) : "—"}</div></div>
        <div className="kpi"><div className="kpi-label">Net assets</div><div className="kpi-value">{f?.netAssets != null ? fmtUSD(f.netAssets, { compact: true }) : "—"}</div></div>
        <div className="kpi"><div className="kpi-label">Dividend yield</div><div className="kpi-value">{f?.dividendYield != null ? fmtPct(f.dividendYield, 2) : "—"}</div></div>
      </div>
      <p className="muted small">
        {f?.inception ? `Inception ${fmtDate(f.inception)} · ` : ""}{f?.turnover != null ? `Turnover ${fmtPct(f.turnover, 0)} · ` : ""}
        {data.meta.sector ? `Category: ${data.meta.sector} · ` : ""}Fund data: Alpha Vantage. A fund — so no valuation football field or congressional section (those don't apply).
      </p>

      <section className="card no-print">
        <div className="section-head"><div><div className="eyebrow">Price</div><div className="section-title">Price history</div></div></div>
        {data.priceSeries.length > 5 ? <PriceChart series={data.priceSeries} /> : <div className="empty"><div className="t">No price history available</div></div>}
      </section>

      <section className="card">
        <div className="section-head"><div><div className="eyebrow">Composition</div><div className="section-title">Top holdings</div></div></div>
        {top.length ? (
          <>
            <table className="table">
              <thead><tr><th>#</th><th>Holding</th><th>Symbol</th><th className="num">Weight</th></tr></thead>
              <tbody>{top.map((h, i) => (<tr key={i}><td className="muted mono">{i + 1}</td><td>{h.name || h.symbol}</td><td className="mono">{h.symbol}</td><td className="num">{fmtPct(h.weight, 2)}</td></tr>))}</tbody>
            </table>
            {holdings.length > 10 && (
              <details className="no-print" style={{ marginTop: 10 }}>
                <summary>Show all {holdings.length} holdings</summary>
                <table className="table" style={{ marginTop: 8 }}>
                  <tbody>{holdings.map((h, i) => (<tr key={i}><td className="muted mono">{i + 1}</td><td>{h.name || h.symbol}</td><td className="mono">{h.symbol}</td><td className="num">{fmtPct(h.weight, 2)}</td></tr>))}</tbody>
                </table>
              </details>
            )}
          </>
        ) : (
          <div className="empty"><div className="ic">📊</div><div className="t">Holdings unavailable</div><p className="muted small">Add an <code>ALPHAVANTAGE_API_KEY</code> in Vercel to populate fund holdings, expense ratio, and sectors.</p></div>
        )}
      </section>

      {f?.sectors?.length ? (
        <section className="card no-print">
          <div className="section-head"><div><div className="eyebrow">Allocation</div><div className="section-title" style={{ fontSize: "1.1rem" }}>Sector weights</div></div></div>
          {f.sectors.map((s, i) => (
            <div className="factor" key={i}>
              <div className="factor-name">{s.sector}</div>
              <div className="factor-bar"><div className="factor-fill" style={{ width: `${Math.min(100, s.weight * 100)}%` }} /></div>
              <div className="factor-score mono">{fmtPct(s.weight, 1)}</div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="grid grid-2 no-print">
        <RetailBuzz data={data} />
        <NewsFeed data={data} />
      </section>

      <p className="muted small">Educational tool. Not investment advice. Fund holdings &amp; expense ratio via Alpha Vantage; prices via Stooq/FMP; mention data via ApeWisdom.</p>
    </div>
  );
}
