"use client";
import type { Valuation } from "@/lib/valuation";
import type { Assumptions } from "@/lib/types";
import { fmtPct } from "@/lib/format";

export default function ReverseDcf({ valuation, a }: { valuation: Valuation; a: Assumptions }) {
  const g = valuation.reverseImpliedGrowth;
  return (
    <div className="card reverse">
      <div className="eyebrow">Reverse DCF</div>
      {g == null ? (
        <>
          <div className="h2" style={{ margin: "6px 0" }}>Not applicable</div>
          <p className="muted small">A reverse DCF needs positive free cash flow to solve for an implied growth rate. This name does not currently have it.</p>
        </>
      ) : (
        <>
          <p className="lead" style={{ margin: "6px 0 2px" }}>The market is pricing in roughly</p>
          <div className="reverse-num mono">{fmtPct(g, 1)}</div>
          <p className="lead" style={{ marginTop: 2 }}>annual FCF growth for {a.horizon} years.</p>
          <p className="muted small" style={{ marginTop: 8 }}>
            Solved so the DCF intrinsic value equals the current price, holding WACC at {fmtPct(a.wacc)} and terminal growth at {fmtPct(a.terminalGrowth)}.
            Your stage-1 assumption is {fmtPct(a.stage1Growth)} — {a.stage1Growth >= g ? "above" : "below"} what the price implies.
          </p>
        </>
      )}
    </div>
  );
}
