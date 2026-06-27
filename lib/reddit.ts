// Reddit client — server-only, optional. Application-only OAuth (client
// credentials) for read-only public search. Free for non-commercial use.
// If REDDIT_CLIENT_ID/SECRET are absent, hasRedditCreds() is false and callers
// fall back to a "view on Reddit" deep link.
import type { RedditLink } from "./types";

const UA = "web:valuation-signal-tool:1.0 (portfolio project)";
let tokenCache: { token: string; exp: number } | null = null;

export function hasRedditCreds(): boolean {
  return !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
}

async function getToken(): Promise<string | null> {
  if (!hasRedditCreds()) return null;
  if (tokenCache && tokenCache.exp > Date.now()) return tokenCache.token;
  const basic = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64");
  try {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded", "User-Agent": UA },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = await res.json();
    tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 900 };
    return tokenCache.token;
  } catch { return null; }
}

export async function topPosts(symbol: string, n = 2): Promise<RedditLink[]> {
  const token = await getToken();
  if (!token) return [];
  const subs = "wallstreetbets+stocks+investing+StockMarket+ValueInvesting";
  const url = `https://oauth.reddit.com/r/${subs}/search?q=${encodeURIComponent("$" + symbol)}&restrict_sr=true&sort=hot&t=month&limit=15&type=link`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "User-Agent": UA }, cache: "no-store" });
    if (!res.ok) return [];
    const j = await res.json();
    const children = j?.data?.children ?? [];
    const posts: RedditLink[] = children
      .map((c: any) => c.data).filter(Boolean).filter((d: any) => !d.over_18)
      .map((d: any) => ({
        title: String(d.title || "").slice(0, 160),
        url: `https://www.reddit.com${d.permalink}`,
        subreddit: `r/${d.subreddit}`,
        score: Number(d.score) || 0,
        created: new Date((d.created_utc || 0) * 1000).toISOString().slice(0, 10),
      }));
    posts.sort((a, b) => b.score - a.score);
    return posts.slice(0, n);
  } catch { return []; }
}
