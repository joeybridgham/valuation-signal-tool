"use client";
import type { Valuation, MethodResult } from "@/lib/valuation";
import { fmtUSD } from "@/lib/format";

interface Row {
  key: string;
  label: string;
  sublabel: string;
  low: number;
  high: number;
  mid: number | null;
  kind: "intrinsic" | "analyst" | "blend";
  stale: boolean;
  staleMonths: number | null;
}

export default function FootballField({
  valuation, onSelect,
}: { valuation: Valuation; onSelect: (key: string) => void }) {
  const rows: Row[] = [];
  for (const m of valuation.methods) {
    if (!m.available || m.low == null || m.high == null) continue;
    rows.push({
      key: m.key, label: m.label, sublabel: m.sublabel,
      low: Math.min(m.low, m.high), high: Math.max(m.low, m.high), mid: m.mid,
      kind: m.key === "analyst" ? "analyst" : "intrinsic",
      stale: m.stale, staleMonths: m.staleAgeMonths,
    });
  }
  if (valuation.blendedFairValue != null) {
    const b = valuation.blendedFairValue;
    rows.push({ key: "blended", label: "Blended fair value", sublabel: "Equal-weight intrinsic", low: b, high: b, mid: b, kind: "blend", stale: false, staleMonths: null });
  }

  const price = valuation.price;
  const vals = rows.flatMap((r) => [r.low, r.high]).concat([price]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || hi * 0.1 || 1;
  lo = Math.max(0, lo - pad); hi = hi + pad;
  const span = hi - lo || 1;
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / span) * 100))}%`;

  if (!rows.length) {
    return <div className="empty"><div className="ic">⊘</div><div className="t">No valuation methods available</div><p className="muted small">Intrinsic models need positive cash flow / usable peers. See the per-method notes below.</p></div>;
  }

  return (
    <div>
      <div className="ff">
        {rows.map((r) => {
          const w = Math.max(1.5, ((r.high - r.low) / span) * 100);
          return (
            <div className="ff-row" key={r.key} role="button" tabIndex={0}
              onClick={() => onSelect(r.key)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(r.key); }}
              title="Click for the calculation and sources">
              <div className="ff-label">
                {r.label}
                <span className="sub">
                  {r.sublabel}
                  {r.stale && <span className="ff-stale" title={`Underlying annual filing ~${r.staleMonths} months old`}>⚠ {r.staleMonths}mo</span>}
                </span>
              </div>
              <div className="ff-track">
                <div className={`ff-bar ${r.kind === "analyst" ? "analyst" : r.kind === "blend" ? "blend" : ""}`}
                  style={{ left: pct(r.low), width: `${w}%` }} />
                {r.mid != null && r.kind !== "blend" && <div className={`ff-mid ${r.kind === "analyst" ? "analyst" : ""}`} style={{ left: pct(r.mid) }} />}
                {r.kind === "blend" && <div className="ff-blendmark" style={{ left: pct(r.mid!) }} />}
                <div className="ff-price-line" style={{ left: pct(price) }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="ff-axis" style={{ display: "grid", gridTemplateColumns: "132px 1fr", gap: 14, marginTop: 6 }}>
        <div />
        <div style={{ position: "relative", height: 18 }}>
          <span className="mono" style={{ position: "absolute", left: 0, fontSize: ".7rem", color: "var(--muted)" }}>{fmtUSD(lo)}</span>
          <span className="mono ff-priceflag" style={{ position: "absolute", left: pct(price), transform: "translateX(-50%)", fontSize: ".7rem" }}>
            Price {fmtUSD(price)}
          </span>
          <span className="mono" style={{ position: "absolute", right: 0, fontSize: ".7rem", color: "var(--muted)" }}>{fmtUSD(hi)}</span>
        </div>
      </div>

      <div className="legend" style={{ marginTop: 14 }}>
        <span><span className="sw" style={{ background: "var(--accent-wash)", border: "1px solid var(--accent)" }} />Intrinsic (DCF · comps · DDM)</span>
        <span><span className="sw" style={{ background: "var(--warn-wash)", border: "1px solid var(--gold)" }} />Analyst anchor</span>
        <span><span className="sw" style={{ background: "var(--pos-wash)", border: "1px solid var(--pos)" }} />Blended</span>
        <span><span className="sw" style={{ width: 2, background: "var(--ink)" }} />Current price</span>
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>Click any row for its full calculation and the filings it used.</p>
    </div>
  );
}
