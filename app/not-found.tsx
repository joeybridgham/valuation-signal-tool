import Link from "next/link";
import { FEATURED } from "@/lib/featured";

export default function NotFound() {
  return (
    <div className="card pad-lg" style={{ marginTop: 24 }}>
      <div className="eyebrow">404</div>
      <h2 className="h2" style={{ margin: "6px 0" }}>Page not found</h2>
      <p className="muted">That ticker isn't a featured page. Look up any symbol from the home page, or jump to a featured deep-dive:</p>
      <div className="chips" style={{ marginTop: 14 }}>
        {FEATURED.map((f) => <Link key={f.symbol} className="chip" href={`/stock/${f.symbol}`}>{f.symbol}</Link>)}
        <Link className="chip add" href="/">← Home</Link>
      </div>
    </div>
  );
}
