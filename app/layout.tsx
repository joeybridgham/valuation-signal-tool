import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Valuation & Signal, Joey Bridgham",
  description:
    "An educational stock valuation & signal tool: multi-method football field, reverse-DCF, a transparent conditions scorecard, congressional trades, retail buzz, and a market Fear & Greed read. Not investment advice.",
  metadataBase: new URL("https://example.vercel.app"),
  openGraph: {
    title: "Valuation & Signal",
    description:
      "Multi-method valuation, reverse-DCF, and a transparent signal scorecard. Educational, not investment advice.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#F4EEE2",
  width: "device-width",
  initialScale: 1,
};

const FONTS =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>
        <header className="site-header no-print">
          <div className="container inner">
            <div className="brand">
              <Link href="/" className="mark">Valuation&nbsp;&amp;&nbsp;Signal</Link>
              <span className="tag">Educational</span>
            </div>
            <nav className="header-links">
              <Link href="/stock/META">Featured</Link>
              <a className="ext" href="https://joeybridgham.github.io" target="_blank" rel="noreferrer">
                joeybridgham.github.io
              </a>
            </nav>
          </div>
        </header>

        <main>
          <div className="container">{children}</div>
        </main>

        <footer className="site-footer">
          <div className="container inner">
            <p className="disclaimer">
              <strong>Educational tool. Not investment advice.</strong> Not a recommendation to buy or
              sell any security. Valuations are model outputs driven by user-set assumptions and may be
              wrong. Data may be delayed or inaccurate; equity data is end-of-day (FMP free tier).
            </p>
            <p className="attrib">
              Data:{" "}
              <a href="https://site.financialmodelingprep.com/developer/docs" target="_blank" rel="noreferrer">Financial Modeling Prep</a>{" · "}
              <a href="https://apewisdom.io" target="_blank" rel="noreferrer">ApeWisdom</a>{" · "}
              <a href="https://www.cnn.com/markets/fear-and-greed" target="_blank" rel="noreferrer">CNN Business Fear &amp; Greed Index</a>.
              Narratives are an AI synthesis of public data. Congressional disclosures lag up to ~45 days,
              cover trades above $1,000, are reported as amount ranges, and cover members of Congress only.
            </p>
            <p className="attrib">© {new Date().getFullYear()} Joey Bridgham · A portfolio project, built for learning.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
