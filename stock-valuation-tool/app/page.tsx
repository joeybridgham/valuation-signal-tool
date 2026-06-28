import Link from "next/link";
import TickerSearch from "@/components/TickerSearch";
import Watchlist from "@/components/Watchlist";
import { FEATURED } from "@/lib/featured";

export default function Home() {
  return (
    <div className="stack" style={{ gap: 32 }}>
      <section className="hero">
        <div className="eyebrow">Educational valuation &amp; signal tool</div>
        <h1 className="h1" style={{ marginTop: 10 }}>Value any stock, transparently.</h1>
        <p className="lead" style={{ maxWidth: "62ch", marginTop: 12 }}>
          A multi-method valuation football field, a reverse-DCF, and a signal scorecard, every input visible and
          adjustable. Click any method to see the exact calculation and the filings behind it. Not investment advice.
        </p>
        <div style={{ marginTop: 20 }}><TickerSearch autoFocus /></div>
        <p className="muted small" style={{ marginTop: 8 }}>Try a featured deep-dive below, or look up any ticker (e.g. AAPL).</p>
      </section>

      <section>
        <div className="section-head"><div><div className="eyebrow">Featured</div><div className="section-title">Pre-generated deep dives</div></div></div>
        <div className="feature-grid">
          {FEATURED.map((f) => (
            <Link key={f.symbol} className="feature" href={`/stock/${f.symbol}`}>
              <div className="row spread"><span className="sym">{f.symbol}</span><span className="muted small">{f.dividendPayer ? "Dividend payer" : "No dividend"}</span></div>
              <div className="nm">{f.name}</div>
              <div className="bl">{f.blurb}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="eyebrow">Watchlist</div>
        <div style={{ marginTop: 10 }}><Watchlist /></div>
      </section>

      <section>
        <div className="section-head"><div><div className="eyebrow">How it reads</div><div className="section-title">What you'll see</div></div></div>
        <div className="how">
          <div className="card"><div className="n">01</div><h3 className="h3" style={{ marginTop: 4 }}>Football field</h3><p className="muted small">DCF, comps, DDM and the analyst range as value bars, plus a blended fair value and margin of safety. Click any row for the full math and its source filings, with a staleness flag when a 10-K is over a year old.</p></div>
          <div className="card"><div className="n">02</div><h3 className="h3" style={{ marginTop: 4 }}>Reverse DCF &amp; sliders</h3><p className="muted small">See the growth the current price implies, then flex stage-1 growth, WACC, terminal rate and horizon, everything recomputes instantly, client-side.</p></div>
          <div className="card"><div className="n">03</div><h3 className="h3" style={{ marginTop: 4 }}>Conditions scorecard</h3><p className="muted small">Valuation, technicals, analyst upside, market Fear &amp; Greed and retail buzz, combined into one read with adjustable weights. Every input is shown, it's a transparent model, not a black box.</p></div>
        </div>
      </section>
    </div>
  );
}
