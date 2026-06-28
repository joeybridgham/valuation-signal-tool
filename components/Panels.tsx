"use client";
import { useState } from "react";
import type { AnalyzeResult } from "@/lib/types";
import type { Valuation } from "@/lib/valuation";
import { fmtUSD, fmtPct, fmtNum, fmtDate, titleCase } from "@/lib/format";
import { MentionsTrend } from "./Charts";

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
          <div className={`kpi-value ${mos != null ? (mos >= 0 ? "delta-pos" : "delta-neg") : ""}`}>{mos != null ? fmtPct(mos, 1, true) : "n/a"}</div>
          <div className="small muted">vs current price</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Reverse-DCF growth</div>
          <div className="kpi-value">{valuation.reverseImpliedGrowth != null ? fmtPct(valuation.reverseImpliedGrowth, 1) : "n/a"}</div>
          <div className="small muted">priced-in FCF CAGR</div>
        </div>
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>
        {data.meta.sector || "n/a"}{data.meta.industry ? ` · ${data.meta.industry}` : ""} · Mkt cap {fmtUSD(data.market.marketCap, { compact: true })} · Beta {fmtNum(data.market.beta, 2)} · {data.meta.exchange}
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

function BuzzBars({ prior, now, change }: { prior: number; now: number; change: number | null }) {
  const max = Math.max(prior, now, 1);
  const base = 70, top = 12, h = (v: number) => Math.max(3, (v / max) * (base - top));
  const up = (change ?? 0) >= 0;
  const bars = [{ x: 30, v: prior, label: "24h ago", c: "var(--muted)" }, { x: 150, v: now, label: "now", c: up ? "var(--pos)" : "var(--neg)" }];
  return (
    <svg viewBox="0 0 250 96" style={{ width: "100%", maxWidth: 230, height: "auto" }} role="img" aria-label="Mentions 24h ago vs now">
      <line x1={14} y1={base} x2={236} y2={base} style={{ stroke: "var(--line)" }} strokeWidth={1} />
      {bars.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={base - h(b.v)} width={70} height={h(b.v)} rx={3} style={{ fill: b.c }} opacity={i === 0 ? 0.5 : 0.9} />
          <text x={b.x + 35} y={base - h(b.v) - 5} textAnchor="middle" style={{ fill: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600 }}>{fmtNum(b.v, 0)}</text>
          <text x={b.x + 35} y={base + 14} textAnchor="middle" style={{ fill: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>{b.label}</text>
        </g>
      ))}
      <text x={125} y={24} textAnchor="middle" style={{ fill: up ? "var(--pos)" : "var(--neg)", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>{up ? "▲" : "▼"} {fmtPct(change, 0, true)}</text>
    </svg>
  );
}

const RANGES: { label: string; days: number }[] = [{ label: "1M", days: 30 }, { label: "3M", days: 90 }, { label: "6M", days: 180 }];

export function RetailBuzz({ data }: { data: AnalyzeResult }) {
  const b = data.buzz;
  const hist = data.mentionHistory ?? [];
  const posts = data.redditPosts ?? [];
  const [days, setDays] = useState(90);
  const searchUrl = `https://www.reddit.com/search/?q=${encodeURIComponent("$" + data.meta.symbol)}`;
  const hasTrend = hist.length >= 5;

  return (
    <div className="card">
      <div className="section-head">
        <div><div className="eyebrow">Retail</div><div className="section-title" style={{ fontSize: "1.1rem" }}>Reddit mentions</div></div>
        {b.found && b.rank != null && <span className="badge badge-ink">rank #{b.rank}</span>}
      </div>

      {!b.found && !hasTrend ? (
        <div className="empty"><div className="ic">💬</div><div className="t">Low retail chatter</div><p className="muted small">{data.meta.symbol} isn't in ApeWisdom's ranked list right now.</p></div>
      ) : (
        <>
          {hasTrend ? (
            <>
              <div className="row spread center" style={{ marginBottom: 4 }}>
                <span className="muted small">Mentions over time</span>
                <div className="seg no-print">
                  {RANGES.map((r) => (
                    <button key={r.days} className={`seg-btn ${days === r.days ? "on" : ""}`} onClick={() => setDays(r.days)}>{r.label}</button>
                  ))}
                </div>
              </div>
              <MentionsTrend history={hist} days={days} />
            </>
          ) : (
            b.found && <div style={{ textAlign: "center" }}><BuzzBars prior={b.mentions24hAgo ?? 0} now={b.mentions ?? 0} change={b.change24hPct} /></div>
          )}

          <div className="kpi-row" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginTop: 10 }}>
            <div className="kpi"><div className="kpi-label">Mentions</div><div className="kpi-value sm">{fmtNum(b.mentions ?? (hist.at(-1)?.mentions ?? 0), 0)}</div></div>
            <div className="kpi"><div className="kpi-label">24h change</div><div className={`kpi-value sm ${(b.change24hPct ?? 0) >= 0 ? "delta-pos" : "delta-neg"}`}>{b.change24hPct != null ? fmtPct(b.change24hPct, 0, true) : "n/a"}</div></div>
            <div className="kpi"><div className="kpi-label">Upvotes</div><div className="kpi-value sm">{fmtNum(b.upvotes ?? 0, 0)}</div></div>
          </div>
        </>
      )}

      {/* Reddit posts */}
      <div className="reddit-posts">
        <div className="sources-h" style={{ marginTop: 14 }}>Discussion</div>
        {posts.length > 0 ? posts.slice(0, 2).map((p, i) => (
          <a className="news-item" key={i} href={p.url} target="_blank" rel="noreferrer">
            <div className="news-head">{p.title}</div>
            <div className="news-meta">{p.subreddit} · ▲ {fmtNum(p.score, 0)} · {fmtDate(p.created)}</div>
          </a>
        )) : <p className="muted small">No cached threads yet, browse the live discussion below.</p>}
        <a className="btn btn-sm btn-ghost" href={searchUrl} target="_blank" rel="noreferrer" style={{ marginTop: 10 }}>View discussions on Reddit ↗</a>
      </div>

      <p className="muted small" style={{ marginTop: 10 }}>Source: ApeWisdom (mention volume) + Reddit. {hasTrend ? "Trend builds from daily snapshots." : "Free feed shows the last 24h; a multi-day trend builds once daily snapshots are recording."}</p>
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
          <div className="news-meta">{n.site || "n/a"} · {fmtDate(n.publishedDate)}</div>
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
      <span className="small">Illustrative numbers shown until the first build with API keys. Set <code>FMP_API_KEY</code> (and <code>GEMINI_API_KEY</code>) and redeploy to populate live data.</span>
    </div>
  );
}

export function AiDataBanner({ data }: { data: AnalyzeResult }) {
  if (data.dataSource !== "AI estimate") return null;
  return (
    <div className="sample-banner no-print" style={{ background: "var(--neg-wash)", borderColor: "var(--neg)" }}>
      <span className="tag-sample" style={{ background: "var(--neg-wash)", color: "var(--neg)", borderColor: "var(--neg)" }}>AI estimate</span>
      <span className="small">Every live data source was unavailable, so these figures are an <strong>AI estimate from training knowledge</strong> (approximate, possibly outdated, not live). Prices come from Stooq when available.</span>
    </div>
  );
}
