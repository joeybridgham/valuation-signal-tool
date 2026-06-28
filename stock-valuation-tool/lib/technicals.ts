// Technical indicators from the daily price series (oldest -> newest).
import type { PricePoint } from "./types";

export function smaSeries(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

// Wilder's RSI.
export function rsiSeries(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period; avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface TechSnapshot {
  price: number;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  week52High: number | null;
  week52Low: number | null;
  week52Pos: number | null;     // 0 (at low) .. 1 (at high)
  aboveSma50: boolean | null;
  aboveSma200: boolean | null;
  hasData: boolean;
}

export function technicalSnapshot(series: PricePoint[]): TechSnapshot {
  const closes = series.map((p) => p.close).filter((c) => isFinite(c));
  const price = closes.length ? closes[closes.length - 1] : NaN;
  if (closes.length < 15) {
    return {
      price, sma50: null, sma200: null, rsi14: null, week52High: null, week52Low: null,
      week52Pos: null, aboveSma50: null, aboveSma200: null, hasData: false,
    };
  }
  const sma50arr = smaSeries(closes, 50);
  const sma200arr = smaSeries(closes, 200);
  const rsiArr = rsiSeries(closes, 14);
  const sma50 = sma50arr[sma50arr.length - 1];
  const sma200 = sma200arr[sma200arr.length - 1];
  const rsi14 = rsiArr[rsiArr.length - 1];
  const window = closes.slice(-252);
  const week52High = Math.max(...window);
  const week52Low = Math.min(...window);
  const week52Pos = week52High > week52Low ? (price - week52Low) / (week52High - week52Low) : 0.5;
  return {
    price, sma50, sma200, rsi14, week52High, week52Low, week52Pos,
    aboveSma50: sma50 != null ? price > sma50 : null,
    aboveSma200: sma200 != null ? price > sma200 : null,
    hasData: true,
  };
}
