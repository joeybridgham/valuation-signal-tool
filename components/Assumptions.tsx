"use client";
import type { Assumptions } from "@/lib/types";
import { fmtPct } from "@/lib/format";
import Slider from "./Slider";

export default function AssumptionControls({
  a, defaults, onChange, costEquity, waccFallback,
}: {
  a: Assumptions; defaults: Assumptions; onChange: (a: Assumptions) => void;
  costEquity: number; waccFallback: boolean;
}) {
  const set = (patch: Partial<Assumptions>) => onChange({ ...a, ...patch });
  const dirty = JSON.stringify(a) !== JSON.stringify(defaults);
  return (
    <div className="card no-print">
      <div className="section-head" style={{ marginBottom: 6 }}>
        <div>
          <div className="eyebrow">Assumptions</div>
          <div className="section-title" style={{ fontSize: "1.1rem" }}>DCF inputs</div>
        </div>
        <button className="btn btn-sm" disabled={!dirty} onClick={() => onChange(defaults)}>Reset</button>
      </div>
      <Slider label="Stage-1 growth" value={a.stage1Growth} min={0} max={0.30} step={0.005} display={fmtPct(a.stage1Growth)} onChange={(v) => set({ stage1Growth: v })} />
      <Slider label="Terminal growth" value={a.terminalGrowth} min={0} max={0.05} step={0.0025} display={fmtPct(a.terminalGrowth)} onChange={(v) => set({ terminalGrowth: v })} />
      <Slider label="Discount rate (WACC)" value={a.wacc} min={0.04} max={0.20} step={0.0025} display={fmtPct(a.wacc)} onChange={(v) => set({ wacc: v })} />
      <Slider label="Forecast horizon" value={a.horizon} min={3} max={10} step={1} display={`${a.horizon} yrs`} onChange={(v) => set({ horizon: Math.round(v) })} />
      <p className="muted small" style={{ marginTop: 8 }}>
        Cost of equity (CAPM): <span className="mono">{fmtPct(costEquity)}</span>{waccFallback && " · WACC fell back to a flat 9% (unstable capital structure)."}
        {" "}Changes recompute the DCF, blended value, margin of safety and reverse-DCF — all in your browser, no new requests.
      </p>
    </div>
  );
}
