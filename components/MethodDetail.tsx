"use client";
import { useEffect } from "react";
import type { Valuation } from "@/lib/valuation";
import { fmtUSD, fmtPct, fmtDate } from "@/lib/format";

function edgarUrl(symbol: string) {
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${encodeURIComponent(symbol)}&type=10-K&dateb=&owner=include&count=40`;
}

export default function MethodDetail({
  valuation, selected, symbol, onClose,
}: { valuation: Valuation; selected: string | null; symbol: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  if (!selected) return null;

  if (selected === "blended") {
    const used = valuation.methods.filter((m) => valuation.blendMethodKeys.includes(m.key as any));
    return (
      <Scrim onClose={onClose}>
        <Head title="Blended fair value" sub="Equal-weight of intrinsic midpoints" onClose={onClose} />
        <p className="muted small" style={{ marginBottom: 12 }}>
          The blend equally weights the midpoints of the available intrinsic methods (DCF, comps, DDM). The analyst range is excluded — it is a market anchor, not an intrinsic estimate.
        </p>
        <div className="steps">
          {used.map((m) => (<div className="step" key={m.key}><span>{m.label} midpoint</span><span className="step-val">{fmtUSD(m.mid)}</span></div>))}
          <div className="step total"><span>Blended fair value</span><span className="step-val">{fmtUSD(valuation.blendedFairValue)}</span></div>
          <div className="step"><span>Current price</span><span className="step-val">{fmtUSD(valuation.price)}</span></div>
          <div className="step total"><span>Margin of safety</span><span className="step-val">{fmtPct(valuation.marginOfSafety, 1, true)}</span></div>
        </div>
      </Scrim>
    );
  }

  const m = valuation.methods.find((x) => x.key === selected);
  if (!m) return null;

  return (
    <Scrim onClose={onClose}>
      <Head title={m.label} sub={m.sublabel} onClose={onClose} />
      {m.stale && (
        <div className="stale-banner">
          ⚠ This model relies on an annual filing about {m.staleAgeMonths} months old (period ending {fmtDate(m.asOfDate)}). A newer 10-K may not yet be reflected — treat the output with extra caution.
        </div>
      )}
      <div className="formula">{m.formula}</div>
      {!m.available && <p className="muted" style={{ margin: "12px 0" }}>{m.unavailableReason}</p>}
      {m.available && (
        <div className="steps">
          {m.steps.map((s, i) => (
            <div className={`step ${s.label.toLowerCase().includes("intrinsic value") || s.label.toLowerCase().includes("value =") ? "total" : ""}`} key={i}>
              <span>{s.label}{s.hint && <em className="hint"> — {s.hint}</em>}</span>
              <span className="step-val">{s.value}</span>
            </div>
          ))}
        </div>
      )}
      {m.note && <p className="muted small" style={{ marginTop: 10 }}>{m.note}</p>}
      <div className="sources">
        <div className="sources-h">Sources</div>
        {m.sources.map((s, i) => (
          <div className="source-link" key={i}>
            <span className="badge badge-ink">{s.form}</span>
            <span>{s.label}</span>
            <span className="muted small">{s.filingDate ? `filed ${fmtDate(s.filingDate)}` : fmtDate(s.fiscalDate)}</span>
            <a href={s.url || edgarUrl(symbol)} target="_blank" rel="noreferrer">{s.url ? "view filing ↗" : "find on SEC EDGAR ↗"}</a>
          </div>
        ))}
        <div className="source-link">
          <span className="badge badge-ink">EDGAR</span>
          <span>All SEC filings for {symbol}</span>
          <a href={edgarUrl(symbol)} target="_blank" rel="noreferrer">open ↗</a>
        </div>
      </div>
    </Scrim>
  );
}

function Scrim({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="scrim no-print" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">{children}</div>
    </div>
  );
}
function Head({ title, sub, onClose }: { title: string; sub: string; onClose: () => void }) {
  return (
    <div className="drawer-head">
      <div>
        <div className="eyebrow">Calculation & sources</div>
        <h3 className="h3" style={{ marginTop: 2 }}>{title}</h3>
        <div className="muted small">{sub}</div>
      </div>
      <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close">✕</button>
    </div>
  );
}
