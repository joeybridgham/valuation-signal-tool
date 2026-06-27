"use client";
import { useEffect, useMemo, useState } from "react";
import type { AnalyzeResult, Assumptions, ScoreWeights, Narrative } from "@/lib/types";
import { computeValuation } from "@/lib/valuation";
import { computeScorecard, DEFAULT_WEIGHTS } from "@/lib/scorecard";
import { technicalSnapshot } from "@/lib/technicals";
import { fmtUSD, fmtPct, fmtDate } from "@/lib/format";
import { buildNarrativeInput, congressSummary } from "@/lib/narrativeInput";

import FootballField from "./FootballField";
import MethodDetail from "./MethodDetail";
import AssumptionControls from "./Assumptions";
import ReverseDcf from "./ReverseDcf";
import ScorecardPanel from "./Scorecard";
import NarrativePanel from "./Narrative";
import { PriceChart, RsiChart, HistValuation, FearGreedGauge } from "./Charts";
import { KpiRow, CongressTrades, RetailBuzz, NewsFeed, SampleBanner } from "./Panels";
import Watchlist from "./Watchlist";
import PdfButton from "./PdfButton";

export default function AnalysisView({
  data, initialNarrative = null, live = false,
}: { data: AnalyzeResult; initialNarrative?: Narrative | null; live?: boolean }) {
  const [a, setA] = useState<Assumptions>(data.defaults);
  const [weights, setWeights] = useState<ScoreWeights>(DEFAULT_WEIGHTS);
  const [selected, setSelected] = useState<string | null>(null);
  const [narrative, setNarrative] = useState<Narrative | null>(initialNarrative);
  const [narrLoading, setNarrLoading] = useState(false);
  const [narrError, setNarrError] = useState<string | null>(null);

  const tech = useMemo(() => technicalSnapshot(data.priceSeries), [data]);
  const val = useMemo(() => computeValuation(data, a), [data, a]);
  const score = useMemo(() => computeScorecard(data, val, tech, weights), [data, val, tech, weights]);

  // Lazy narrative for live pages (featured pages arrive pre-generated).
  useEffect(() => {
    if (!live || initialNarrative) return;
    let cancel = false;
    setNarrLoading(true); setNarrError(null);
    fetch("/api/narrative", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(buildNarrativeInput(data, val, score)),
    })
      .then(async (r) => { if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "Narrative unavailable."); } return r.json(); })
      .then((n) => { if (!cancel) setNarrative(n); })
      .catch((e) => { if (!cancel) setNarrError(String(e.message || e)); })
      .finally(() => { if (!cancel) setNarrLoading(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showHist = data.histMultiples.filter((h) => h.pe != null).length >= 3;

  return (
    <div className="stack" style={{ gap: 26 }}>
      {/* print-only header */}
      <div className="print-only print-head">
        <h2>{data.meta.symbol} — {data.meta.name}</h2>
        <div>Valuation & Signal report · data as of {fmtDate(data.meta.priceAsOf)} · Educational, not investment advice.</div>
      </div>

      {/* heading */}
      <div className="ticker-head no-print">
        <div>
          <div className="row center" style={{ gap: 10 }}>
            <h1 className="h2" style={{ fontSize: "2rem" }}>{data.meta.symbol}</h1>
            <span className="muted">{data.meta.name}</span>
          </div>
          <div className="as-of">Data as of {fmtDate(data.meta.priceAsOf)} · end-of-day (FMP free tier){data.meta.isSample && " · sample"}</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Watchlist current={data.meta.symbol} />
          <PdfButton />
        </div>
      </div>

      <SampleBanner data={data} />

      <KpiRow data={data} valuation={val} />

      {/* valuation */}
      <section className="grid grid-5-2">
        <div className="card pad-lg">
          <div className="section-head">
            <div><div className="eyebrow">Valuation</div><div className="section-title">Football field</div></div>
          </div>
          <FootballField valuation={val} onSelect={setSelected} />
        </div>
        <div className="stack" style={{ gap: 18 }}>
          <AssumptionControls a={a} defaults={data.defaults} onChange={setA} costEquity={data.costEquity} waccFallback={data.waccFallback} />
          <ReverseDcf valuation={val} a={a} />
        </div>
      </section>

      <ScorecardPanel score={score} weights={weights} onWeights={setWeights} />

      {/* print-only compact signals */}
      <div className="print-only print-signals">
        <strong>Signals:</strong> Conditions {score.label} ({score.composite?.toFixed(0)}/100) · Fear &amp; Greed {data.fearGreed.score ?? "—"} · Congress: {congressSummary(data)} · Reverse-DCF growth {val.reverseImpliedGrowth != null ? fmtPct(val.reverseImpliedGrowth, 1) : "n/a"}.
      </div>

      <NarrativePanel narrative={narrative} loading={narrLoading} error={narrError} />

      {/* market signals (kept out of the 1-page PDF) */}
      <section className="grid grid-3 no-print">
        <div className="card">
          <div className="section-head"><div><div className="eyebrow">Market-wide</div><div className="section-title" style={{ fontSize: "1.1rem" }}>Fear &amp; Greed</div></div></div>
          {data.fearGreed.available && data.fearGreed.score != null
            ? <FearGreedGauge score={data.fearGreed.score} rating={data.fearGreed.rating} />
            : <div className="empty"><div className="t">Unavailable</div></div>}
          <p className="muted small">CNN Business gauge — a market-wide read, not stock-specific. Used contrarian in the scorecard.</p>
        </div>
        <RetailBuzz data={data} />
        <CongressTrades data={data} />
      </section>

      {/* technicals */}
      <section className="card no-print">
        <div className="section-head"><div><div className="eyebrow">Technicals</div><div className="section-title">Price · 50/200-day · RSI</div></div></div>
        {tech.hasData ? (<><PriceChart series={data.priceSeries} /><div style={{ height: 10 }} /><RsiChart series={data.priceSeries} /></>)
          : <div className="empty"><div className="t">Not enough price history</div></div>}
      </section>

      {/* hist valuation + news */}
      <section className="grid grid-2 no-print">
        {showHist && (
          <div className="card">
            <div className="section-head"><div><div className="eyebrow">History</div><div className="section-title" style={{ fontSize: "1.1rem" }}>Valuation trend</div></div></div>
            <HistValuation hist={data.histMultiples} />
          </div>
        )}
        <NewsFeed data={data} />
      </section>

      {/* per-source notes */}
      {data.meta.notes.length > 0 && (
        <details className="card no-print"><summary className="muted">Data notes &amp; graceful fallbacks ({data.meta.notes.length})</summary>
          <ul className="muted small" style={{ marginTop: 8 }}>{data.meta.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </details>
      )}

      <MethodDetail valuation={val} selected={selected} currency={data.meta.currency} onClose={() => setSelected(null)} />
    </div>
  );
}
