"use client";
import type { Scorecard } from "@/lib/scorecard";
import type { ScoreWeights } from "@/lib/types";
import { DEFAULT_WEIGHTS } from "@/lib/scorecard";

const LABELS: { key: keyof ScoreWeights; label: string }[] = [
  { key: "valuation", label: "Valuation" },
  { key: "technicals", label: "Technicals" },
  { key: "analyst", label: "Analyst upside" },
  { key: "timing", label: "Market timing" },
  { key: "buzz", label: "Retail buzz" },
];

export default function ScorecardPanel({
  score, weights, onWeights,
}: { score: Scorecard; weights: ScoreWeights; onWeights: (w: ScoreWeights) => void }) {
  const dirty = LABELS.some(({ key }) => Math.abs(weights[key] - DEFAULT_WEIGHTS[key]) > 1e-6);
  const labelClass = score.label === "Favorable" ? "delta-pos" : score.label === "Stretched" ? "delta-neg" : "";

  return (
    <div className="card pad-lg">
      <div className="section-head">
        <div>
          <div className="eyebrow">Conditions scorecard</div>
          <div className="section-title">A transparent composite</div>
        </div>
      </div>

      <div className="composite">
        <div className={`dial mono ${labelClass}`}>{score.composite != null ? score.composite.toFixed(0) : "n/a"}</div>
        <div>
          <div className={`h3 ${labelClass}`}>{score.label}</div>
          <div className="muted small">Weighted blend of the five factors below. Higher = more favorable for a value-oriented entry. Educational only, not a recommendation.</div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        {score.factors.map((f) => (
          <div className="factor" key={f.key}>
            <div className="factor-name">
              {f.label}
              <span className="w"> · {(f.weight * 100).toFixed(0)}%{f.score == null && " (n/a)"}</span>
              <div className="muted small">{f.valueText}</div>
            </div>
            <div className="factor-bar" title={f.detail}>
              {f.score != null && <div className={`factor-fill ${f.tone}`} style={{ width: `${f.score}%` }} />}
            </div>
            <div className="factor-score mono">{f.score != null ? f.score.toFixed(0) : "n/a"}</div>
          </div>
        ))}
      </div>

      <details className="weights no-print">
        <summary>Adjust factor weights</summary>
        <p className="muted small" style={{ margin: "6px 0 10px" }}>
          Weights are normalized to 100% across factors that have data. Surfacing this is the point: the scoring is a transparent, subjective model, not a black-box call.
        </p>
        {LABELS.map(({ key, label }) => (
          <div className="slider-row" key={key}>
            <span className="label">{label}</span>
            <span className="val">{(weights[key] * 100).toFixed(0)}%</span>
            <input className="range" type="range" min={0} max={0.5} step={0.01} value={weights[key]}
              onChange={(e) => onWeights({ ...weights, [key]: parseFloat(e.target.value) })} />
          </div>
        ))}
        <button className="btn btn-sm" disabled={!dirty} style={{ marginTop: 8 }} onClick={() => onWeights({ ...DEFAULT_WEIGHTS })}>Reset weights</button>
      </details>
    </div>
  );
}
