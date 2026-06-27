"use client";
import type { PricePoint, HistMultiplePoint } from "@/lib/types";
import { smaSeries, rsiSeries } from "@/lib/technicals";
import { fmtUSD, fmtX, fmtDateShort } from "@/lib/format";

function linePath(pts: ([number, number] | null)[]): string {
  let d = "", pen = false;
  for (const p of pts) {
    if (!p) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)} `;
    pen = true;
  }
  return d.trim();
}

// ---------------- Price chart with SMA50 / SMA200 + 52-week range ----------------
export function PriceChart({ series }: { series: PricePoint[] }) {
  const W = 760, H = 240, PT = 14, PB = 24, PL = 46, PR = 10;
  const closes = series.map((p) => p.close);
  const sma50 = smaSeries(closes, 50);
  const sma200 = smaSeries(closes, 200);
  const N = Math.min(closes.length, 252);
  const start = closes.length - N;
  const view = series.slice(start);
  const c = closes.slice(start), s50 = sma50.slice(start), s200 = sma200.slice(start);
  if (view.length < 5) return <div className="empty"><div className="t">Not enough price history</div></div>;

  const w52 = closes.slice(-252);
  const hi52 = Math.max(...w52), lo52 = Math.min(...w52);
  const ys = c.concat(s50.filter((x): x is number => x != null), s200.filter((x): x is number => x != null), [hi52, lo52]);
  const yMin = Math.min(...ys), yMax = Math.max(...ys), yPad = (yMax - yMin) * 0.06 || 1;
  const lo = yMin - yPad, hi = yMax + yPad, span = hi - lo || 1;
  const x = (i: number) => PL + (i / (view.length - 1)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - (v - lo) / span) * (H - PT - PB);

  const pricePts = c.map((v, i) => [x(i), y(v)] as [number, number]);
  const s50pts = s50.map((v, i) => (v == null ? null : [x(i), y(v)] as [number, number]));
  const s200pts = s200.map((v, i) => (v == null ? null : [x(i), y(v)] as [number, number]));
  const last = c[c.length - 1];
  const ticks = [hi, lo + span / 2, lo].map((v) => ({ v, y: y(v) }));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Price with 50- and 200-day moving averages">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PL} y1={t.y} x2={W - PR} y2={t.y} style={{ stroke: "var(--line-2)" }} strokeWidth={1} />
            <text x={PL - 6} y={t.y + 3} textAnchor="end" style={{ fill: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>{fmtUSD(t.v)}</text>
          </g>
        ))}
        <line x1={PL} y1={y(hi52)} x2={W - PR} y2={y(hi52)} style={{ stroke: "var(--pos)" }} strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />
        <line x1={PL} y1={y(lo52)} x2={W - PR} y2={y(lo52)} style={{ stroke: "var(--neg)" }} strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />
        <text x={W - PR} y={y(hi52) - 3} textAnchor="end" style={{ fill: "var(--pos)", fontFamily: "var(--font-mono)", fontSize: 9 }}>52w high</text>
        <text x={W - PR} y={y(lo52) + 10} textAnchor="end" style={{ fill: "var(--neg)", fontFamily: "var(--font-mono)", fontSize: 9 }}>52w low</text>
        <path d={linePath(s200pts)} fill="none" style={{ stroke: "var(--gold)" }} strokeWidth={1.4} opacity={0.85} />
        <path d={linePath(s50pts)} fill="none" style={{ stroke: "var(--accent-2)" }} strokeWidth={1.4} strokeDasharray="4 3" opacity={0.9} />
        <path d={linePath(pricePts)} fill="none" style={{ stroke: "var(--ink)" }} strokeWidth={1.8} />
        <circle cx={x(c.length - 1)} cy={y(last)} r={3} style={{ fill: "var(--accent)" }} />
      </svg>
      <div className="legend" style={{ marginTop: 4 }}>
        <span><span className="sw" style={{ background: "var(--ink)" }} />Price</span>
        <span><span className="sw" style={{ background: "var(--accent-2)" }} />50-day SMA</span>
        <span><span className="sw" style={{ background: "var(--gold)" }} />200-day SMA</span>
        <span className="muted">{fmtDateShort(view[0].date)} – {fmtDateShort(view[view.length - 1].date)}</span>
      </div>
    </div>
  );
}

// ---------------- RSI(14) ----------------
export function RsiChart({ series }: { series: PricePoint[] }) {
  const W = 760, H = 120, PT = 10, PB = 16, PL = 46, PR = 10;
  const closes = series.map((p) => p.close);
  const rsi = rsiSeries(closes, 14);
  const N = Math.min(closes.length, 252), start = closes.length - N;
  const r = rsi.slice(start);
  const valid = r.filter((x): x is number => x != null);
  if (valid.length < 5) return <div className="empty"><div className="t">RSI needs more history</div></div>;
  const x = (i: number) => PL + (i / (r.length - 1)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - v / 100) * (H - PT - PB);
  const pts = r.map((v, i) => (v == null ? null : [x(i), y(v)] as [number, number]));
  const cur = valid[valid.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="14-day RSI">
        <rect x={PL} y={y(70)} width={W - PL - PR} height={y(0) - y(70)} style={{ fill: "var(--neg-wash)" }} opacity={0.5} />
        <rect x={PL} y={y(100)} width={W - PL - PR} height={y(30) - y(100)} style={{ fill: "var(--pos-wash)" }} opacity={0.4} />
        {[30, 50, 70].map((g) => (
          <g key={g}>
            <line x1={PL} y1={y(g)} x2={W - PR} y2={y(g)} style={{ stroke: "var(--line)" }} strokeDasharray={g === 50 ? "1 3" : "3 3"} strokeWidth={1} />
            <text x={PL - 6} y={y(g) + 3} textAnchor="end" style={{ fill: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 9 }}>{g}</text>
          </g>
        ))}
        <path d={linePath(pts)} fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={1.6} />
        <circle cx={x(r.length - 1)} cy={y(cur)} r={3} style={{ fill: "var(--accent)" }} />
      </svg>
      <p className="muted small" style={{ marginTop: 2 }}>RSI(14) now <span className="mono">{cur.toFixed(0)}</span> — oversold &lt;30, overbought &gt;70.</p>
    </div>
  );
}

// ---------------- Historical valuation band (trailing P/E) ----------------
export function HistValuation({ hist }: { hist: HistMultiplePoint[] }) {
  const data = hist.filter((h) => h.pe != null && (h.pe as number) > 0) as { date: string; pe: number }[];
  if (data.length < 3) return null; // caller hides the section
  const W = 760, H = 200, PT = 14, PB = 26, PL = 40, PR = 10;
  const vals = data.map((d) => d.pe);
  const lo = Math.min(...vals) * 0.9, hi = Math.max(...vals) * 1.05, span = hi - lo || 1;
  const cur = vals[vals.length - 1];
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const x = (i: number) => PL + (i / (data.length - 1)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - (v - lo) / span) * (H - PT - PB);
  const pts = data.map((d, i) => [x(i), y(d.pe)] as [number, number]);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Historical trailing P/E">
        <line x1={PL} y1={y(avg)} x2={W - PR} y2={y(avg)} style={{ stroke: "var(--gold)" }} strokeDasharray="4 3" strokeWidth={1} />
        <text x={W - PR} y={y(avg) - 3} textAnchor="end" style={{ fill: "var(--gold)", fontFamily: "var(--font-mono)", fontSize: 9 }}>avg {fmtX(avg)}</text>
        <path d={linePath(pts)} fill="none" style={{ stroke: "var(--accent-2)" }} strokeWidth={1.8} />
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(d.pe)} r={2.5} style={{ fill: i === data.length - 1 ? "var(--accent)" : "var(--accent-2)" }} />
            <text x={x(i)} y={H - 8} textAnchor="middle" style={{ fill: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 9 }}>{d.date.slice(0, 4)}</text>
          </g>
        ))}
      </svg>
      <p className="muted small">Trailing P/E by year · current <span className="mono">{fmtX(cur)}</span> vs history avg <span className="mono">{fmtX(avg)}</span> — {cur > avg ? "richer" : "cheaper"} than its own past.</p>
    </div>
  );
}

// ---------------- Fear & Greed gauge ----------------
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
}
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 < a0 ? 1 : 0;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
export function FearGreedGauge({ score, rating }: { score: number; rating: string | null }) {
  const W = 260, H = 150, cx = 130, cy = 130, r = 100;
  const ang = 180 - (score / 100) * 180;
  const [nx, ny] = polar(cx, cy, r - 14, ang);
  const zones: [number, number, string][] = [
    [0, 25, "var(--neg)"], [25, 45, "var(--warn)"], [45, 55, "var(--muted)"],
    [55, 75, "var(--gold)"], [75, 100, "var(--pos)"],
  ];
  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 260, height: "auto" }} role="img" aria-label={`Fear and Greed ${score}`}>
        {zones.map(([a, b, col], i) => (
          <path key={i} d={arc(cx, cy, r, 180 - (a / 100) * 180, 180 - (b / 100) * 180)} fill="none" style={{ stroke: col }} strokeWidth={12} strokeLinecap="butt" opacity={0.85} />
        ))}
        <line x1={cx} y1={cy} x2={nx} y2={ny} style={{ stroke: "var(--ink)" }} strokeWidth={2.4} />
        <circle cx={cx} cy={cy} r={5} style={{ fill: "var(--ink)" }} />
        <text x={cx} y={cy - 28} textAnchor="middle" style={{ fill: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 30, fontWeight: 600 }}>{score}</text>
        <text x={cx} y={cy - 10} textAnchor="middle" style={{ fill: "var(--muted)", fontFamily: "var(--font-body)", fontSize: 12 }}>{rating ?? ""}</text>
      </svg>
    </div>
  );
}
