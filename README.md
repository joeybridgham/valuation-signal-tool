# Valuation & Signal

An educational stock valuation and signal tool: a multi-method valuation **football field**, a **reverse-DCF**, adjustable assumptions, and a transparent **conditions scorecard** that folds in congressional trades, Reddit buzz, and the market-wide Fear & Greed reading — with an AI-generated bull/base/bear synthesis grounded in the computed numbers.

Built by Joey Bridgham as a portfolio piece. **Educational tool. Not investment advice.**

> Every valuation method is click-through: open any football-field row to see the exact calculation (recomputed live from the current assumptions) and the source filings it used. Any model that leans on an annual 10-K more than 12 months old is flagged right on the field.

---

## What it does

- **Football field** — DCF (two-stage FCFF), relative valuation (peer P/E · EV/EBITDA · P/S), dividend discount model (payers), and the analyst target range, each as a value bar, with a **blended fair value** and **margin of safety**.
- **Reverse DCF** — the annual FCF growth the current price implies, recomputed as you move the sliders.
- **Adjustable assumptions** — stage-1 growth, terminal growth, WACC, and horizon. Everything recomputes **client-side** with no extra API calls.
- **Conditions scorecard** — valuation, technicals, analyst upside, market timing (Fear & Greed, read contrarian), and retail buzz, combined into one label with **adjustable weights**. Every input is visible.
- **Bull / Base / Bear** — an AI synthesis (Anthropic) grounded only in the computed numbers.
- **Congressional trades** (House + Senate), **Reddit buzz** (ApeWisdom), **CNN Fear & Greed** gauge.
- **Technical charts** — price with 50/200-day SMAs, RSI(14), and the 52-week range — all hand-drawn SVG in the editorial palette.
- **Historical valuation trend**, **news feed**, a **localStorage watchlist**, and a one-page **PDF export** (print stylesheet).
- **Calculation & source transparency** — per-method breakdowns, SEC filing links, and a **staleness flag** for annual data older than a year.

## Stack

- **Next.js 14 (App Router)** + React 18 + TypeScript, one repo / one Vercel project (frontend and serverless API routes together — no CORS).
- No charting or UI library: charts are inline SVG, styling is a single editorial stylesheet (Fraunces / Inter Tight / JetBrains Mono).
- Deploys on the **Vercel Hobby (free) tier**.

### Architecture (built around the 10-second Hobby function limit)

- **Featured tickers are statically generated at build time** (`/stock/[symbol]`) and revalidated daily (ISR, `revalidate = 86400`). They load instantly and never hit the live path.
- **Live lookups use two separate API routes** so neither approaches 10s:
  - `GET /api/analyze` — fetches FMP + ApeWisdom + CNN in parallel, runs the valuation math, and returns **all the raw inputs** the browser needs (FCF, shares, net debt, EBITDA, EPS, revenue, peer multiples, beta, risk-free rate, dividend, price, and the full daily price series). With that payload the sliders, charts, reverse-DCF, watchlist, and PDF all run client-side.
  - `POST /api/narrative` — the Anthropic bull/base/bear call, made **lazily from the client after the numbers render**, with its own 10s budget and a tight prompt.
- **Caching** — `/api/analyze` sets `Cache-Control: s-maxage=43200`, and all upstream fetches use Next data-cache windows, protecting the FMP free-tier budget.
- **No remote image optimization** (`images.unoptimized = true`) to avoid Vercel bandwidth charges.

---

## Quick start (local)

```bash
npm install
cp .env.example .env.local      # then paste your two keys (see below)
npm run dev                     # http://localhost:3000
```

Without keys, the four featured tickers still render using clearly-labeled **sample data**; arbitrary live lookups return a "configure key" message.

Run the valuation math tests:

```bash
npm run test:math
```

## Environment variables

Set these in `.env.local` for local dev **and** in Vercel → Project → Settings → Environment Variables. They are read **server-side only**, never exposed to the browser, and must never be committed.

| Variable | Required | Where to get it |
| --- | --- | --- |
| `FMP_API_KEY` | yes (for live data) | https://site.financialmodelingprep.com/developer/docs — free tier, 250 calls/day |
| `ANTHROPIC_API_KEY` | yes (for narratives) | https://console.anthropic.com/ |
| `ANTHROPIC_MODEL` | optional | defaults to `claude-sonnet-4-6` |

The moment you build with these set (locally or on Vercel), the featured pages fetch **real** FMP data and generate **real** Claude narratives and bake them into the static pages — replacing the sample snapshots automatically.

---

## Deploy to Vercel

1. **Push to GitHub.** From the project root:
   ```bash
   git init && git add -A && git commit -m "Valuation & Signal tool"
   git branch -M main
   git remote add origin https://github.com/<you>/valuation-signal-tool.git
   git push -u origin main
   ```
2. **Import on Vercel.** vercel.com → *Add New… → Project* → import the repo. Framework preset is auto-detected as **Next.js**. Keep the free **Hobby** plan.
3. **Add the two environment variables** (`FMP_API_KEY`, `ANTHROPIC_API_KEY`) in the import screen (or Settings → Environment Variables), for Production + Preview + Development.
4. **Deploy.** The build statically generates the four featured pages with live data and narratives. You get a URL like `https://valuation-signal-tool.vercel.app`.
5. **Redeploy after changing env vars** so the featured pages regenerate.

### Link it from joeybridgham.github.io

The portfolio stays on GitHub Pages; this tool is a linked sub-app. Add a project card / button on the site that links to the Vercel URL, e.g.:

```html
<a class="feature" href="https://valuation-signal-tool.vercel.app" target="_blank" rel="noreferrer">
  Valuation &amp; Signal — live valuation tool →
</a>
```

It already matches the portfolio's type system (Fraunces / Inter Tight / JetBrains Mono) and warm editorial palette, so it reads as part of the site.

---

## FMP free-tier budget & endpoint notes

- **250 calls/day.** A fresh live lookup makes roughly 13–19 calls (core statements + up to 5 peer ratio calls + congressional + news + DCF + treasury). Daily caching means repeat lookups of the same ticker are effectively free, and the featured pages are build-time only.
- To spend less, lower the peer cap in `getFmpBundle(symbol, peerLimit)` (default 5) in `lib/fmp.ts`.
- **Endpoint paths live in one place:** the `FMP_PATHS` map at the top of `lib/fmp.ts`. They are verified against FMP's current **`stable`** namespace (June 2026). A few endpoints are **plan-gated** on some tiers — `senate-trades`, `house-trades`, `analyst-estimates`/`price-target-consensus`, and `treasury-rates`. If your key doesn't include them, the app **degrades gracefully** (empty congressional list, no analyst row, risk-free falls back to 4.3%). If FMP shifts a path, correct it once in `FMP_PATHS`.

## Valuation methodology (defaults)

- **DCF** — two-stage FCFF, 5-year explicit horizon. Base FCF = latest operating cash flow − capex. Stage-1 growth defaults to the trailing FCF CAGR (capped at 25%). Terminal growth 2.5%. WACC = CAPM cost of equity (risk-free + β·5%) blended with after-tax cost of debt by capital structure; falls back to a flat 9% if unstable. The bar's width comes from flexing growth ±3 pts and WACC ∓0.75 pt.
- **Comps** — peer-median P/E·EPS, EV/EBITDA·EBITDA, and P/S·revenue/share; range = the spread.
- **DDM** — Gordon growth for dividend payers, growth capped below the cost of equity.
- **Analyst** — consensus low/mean/high, shown as a separate market anchor (not blended).
- **Reverse DCF** — bisection solve for the stage-1 growth that sets DCF intrinsic value = price.
- **Blended fair value** — equal-weight of the available intrinsic midpoints (DCF, comps, DDM). **Margin of safety** = (blended − price) / price.

## Scorecard methodology

Default weights: Valuation 35% · Technicals 20% · Analyst upside 15% · Market timing 15% · Retail buzz 15%. Weights are user-adjustable and normalized to 100% across the factors that have data. Fear & Greed is read **contrarian** (extreme fear favorable, extreme greed cautionary). Composite ≥ 66 = Favorable, 45–65 = Mixed, < 45 = Stretched.

## Project structure

```
app/
  layout.tsx, globals.css        # editorial design system + persistent disclaimer
  page.tsx                       # home (search, featured, watchlist)
  ticker/[symbol]/page.tsx       # live lookup (client: fast numbers, then lazy narrative)
  stock/[symbol]/page.tsx        # featured static pages (SSG + ISR)
  api/analyze/route.ts           # fast numbers (<10s)
  api/narrative/route.ts         # lazy AI narrative (own 10s budget)
lib/
  valuation.ts                   # DCF, reverse-DCF, comps, DDM, blend, breakdowns, staleness
  scorecard.ts, technicals.ts    # conditions composite; SMA/RSI/52-week
  fmp.ts, apewisdom.ts, feargreed.ts, anthropic.ts   # data sources (server-only)
  analyze.ts                     # orchestrator + WACC/defaults + sample fallback
  sampleData.ts, featured.ts     # labeled sample snapshots; featured config
components/                      # football field, method-detail drawer, sliders, charts, panels…
test/valuation.test.ts          # numerical sanity tests
```

## Disclaimers & attribution

Educational tool. Not investment advice. Not a recommendation to buy or sell any security. Data may be delayed or inaccurate (equity data is end-of-day on the FMP free tier). Congressional disclosures lag up to ~45 days, cover trades above $1,000, are reported as amount ranges, and cover members of Congress only. Narratives are an AI synthesis of public data.

Data sources: **Financial Modeling Prep**, **ApeWisdom**, **CNN Business Fear & Greed Index**.

### Free narrative via Google Gemini (recommended)

The bull/base/bear narrative is provider-agnostic. Set **`GEMINI_API_KEY`** (Google AI Studio, free tier — no credit card: https://aistudio.google.com/) and it's used automatically; optionally `GEMINI_MODEL` (default `gemini-2.0-flash`). If instead you set `ANTHROPIC_API_KEY`, that's used. If neither is set, every other section still works and the narrative shows a clean "unavailable" note. The retail-buzz panel also draws a 24h mentions chart (now vs 24h ago) from ApeWisdom's free feed — a longer history would require recording daily snapshots (e.g. Vercel KV).

### Live mention history + Reddit posts (optional, free)

The retail-buzz panel can show a multi-day mention **trend** (1M / 3M / 6M) and **2 Reddit posts** per stock. Both are optional and free, and the app works without them (24h chart + a "view on Reddit" link).

1. **Storage** — in Vercel, add **Upstash Redis** (Storage / Marketplace → Upstash → free plan: 256 MB / 500K cmds-month). It auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
2. **Cron secret** — add an env var `CRON_SECRET` set to any random string. `vercel.json` already schedules `/api/cron/snapshot` once daily; Vercel sends the secret automatically.
3. **Reddit posts (optional)** — create a free "script" app at https://www.reddit.com/prefs/apps and add `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET`. The daily cron fetches and caches the top 2 posts per tracked ticker (so the live page never calls Reddit directly).

**Note:** the trend **accrues forward** — ApeWisdom's free feed only exposes "now" vs "24h ago", so history can't be backfilled. The chart starts the day the cron begins recording and fills in over weeks/months (a real 6-month trend after ~6 months). Featured pages show a clearly-labeled illustrative trend until real data accumulates.
