"use client";
import type { AnalyzeResult } from "@/lib/types";
import type { Valuation } from "@/lib/valuation";
import { fmtUSD, fmtPct, fmtNum, compact, fmtDate, titleCase } from "@/lib/format";

export function KpiRow({ data, valuation }: { data: AnalyzeResult; valuation: Valuation }) {
  const mos = valuation.marginOfSafety;
  return (
    <>
      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Price</div>
          <div className="kpi-value">{fmtUSD(data.market.price)}</div>
          <div className={`small mono ${data.market.dayChangePct >= 0 ? "delta-pos" : "delta-neg"}`}>{fmtPct(data.market.dayChangePct, 2, true)} today</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Blended fair value</div>
          <div className="kpi-value">{fmtUSD(valuation.blendedFairValue)}</div>
          <div className="small muted">{valuation.blendMethodKeys.length} intrinsic methods</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Margin of safety</div>
          <div className={`kpi-value ${mos != null ? (mos >= 0 ? "delta-pos" : "delta-neg") : ""}`}>{mos != null ? fmtPct(mos, 1, true) : "—"}</div>
          <div className="small muted">vs current price</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Reverse-DCF growth</div>
          <div className="kpi-value">{valuation.reverseImpliedGrowth != null ? fmtPct(valuation.reverseImpliedGrowth, 1) : "n/a"}</div>
          <div className="small muted">priced-in FCF CAGR</div>
        </div>
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>
        {data.meta.sector || "—"}{data.meta.industry ? ` · ${data.meta.industry}` : ""} · Mkt cap {fmtUSD(data.market.marketCap, { compact: true })} · Beta {fmtNum(data.market.beta, 2)} · {data.meta.exchange}
      </p>
    </>
  );
}

export function CongressTrades({ data }: { data: AnalyzeResult }) {
  const t = data.congress;
  return (
    <div className="card">
      <div className="section-head"><div><div className="eyebrow">Congressional</div><div className="section-title" style={{ fontSize: "1.1rem" }}>Recent trades</div></div></div>
      {t.length === 0 ? (
        <div className="empty"><div className="ic">🏛️</div><div className="t">No disclosed trades</div><p className="muted small">No House or Senate transactions in {data.meta.symbol} in the past year.</p></div>
      ) : (
        <table className="table">
          <thead><tr><th>Member</th><th>Chamber</th><th>Type</th><th>Amount</th><th>Traded</th></tr></thead>
          <tbody>
            {t.slice(0, 8).map((r, i) => (
              <tr key={i}>
                <td>{r.representative}</td>
                <td className="muted">{titleCase(r.chamber)}</td>
                <td><span className={`badge ${r.type === "buy" ? "badge-pos" : r.type === "sell" ? "badge-neg" : "badge-ink"}`}>{r.type}</span></td>
                <td className="mono small">{r.amountRange}</td>
                <td className="mono small">{fmtDate(r.transactionDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small" style={{ marginTop: 10 }}>STOCK Act disclosures: lag up to ~45 days, cover trades above $1,000, reported as ranges. Members of Congress only.</p>
    </div>
  );
}

export function RetailBuzz({ data }: { data: AnalyzeResult }) {
  const b = data.buzz;
  return (
    <div className="card">
      <div className="section-head"><div><div className="eyebrow">Retail</div><div className="section-title" style={{ fontSize: "1.1rem" }}>Reddit buzz</div></div></div>
      {!b.found ? (
        <div className="empty"><div className="ic">💬</div><div className="t">Low retail chatter</div><p className="muted small">{data.meta.symbol} isn't in ApeWisdom's ranked mention list right now.</p></div>
      ) : (
        <div className="kpi-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="kpi"><div className="kpi-label">Mentions (24h)</div><div className="kpi-value sm">{fmtNum(b.mentions ?? 0, 0)}</div></div>
          <div className="kpi"><div className="kpi-label">24h change</div><div className={`kpi-value sm ${(b.change24hPct ?? 0) >= 0 ? "delta-pos" : "delta-neg"}`}>{fmtPct(b.change24hPct, 0, true)}</div></div>
          <div className="kpi"><div className="kpi-label">Rank</div><div className="kpi-value sm">#{b.rank ?? "—"}</div></div>
          <div className="kpi"><div className="kpi-label">Upvotes</div><div className="kpi-value sm">{fmtNum(b.upvotes ?? 0, 0)}</div></div>
        </div>
      )}
      <p className="muted small" style={{ marginTop: 10 }}>Source: ApeWisdom. Mention volume and its 24h change — a spike signals attention, not direction.</p>
    </div>
  );
}

export function NewsFeed({ data }: { data: AnalyzeResult }) {
  if (!data.news.length) return null;
  return (
    <div className="card">
      <div className="section-head"><div><div className="eyebrow">Headlines</div><div className="section-title" style={{ fontSize: "1.1rem" }}>Recent news</div></div></div>
      {data.news.slice(0, 6).map((n, i) => (
        <a className="news-item" key={i} href={n.url} target="_blank" rel="noreferrer">
          <div className="news-head">{n.title}</div>
          <div className="news-meta">{n.site || "—"} · {fmtDate(n.publishedDate)}</div>
        </a>
      ))}
    </div>
  );
}

export function SampleBanner({ data }: { data: AnalyzeResult }) {
  if (!data.meta.isSample) return null;
  return (
    <div className="sample-banner no-print">
      <span className="tag-sample">Sample data</span>
      <span className="small">Illustrative numbers shown until the first build with API keys. Set <code>FMP_API_KEY</code> and <code>ANTHROPIC_API_KEY</code> and redeploy to populate live data.</span>
    </div>
  );
}
