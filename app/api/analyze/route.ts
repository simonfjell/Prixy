export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { traderaScraper } from "../../../lib/scrapers/tradera";
import { xxlScraper } from "../../../lib/scrapers/xxl";
import { elgigantenScraper } from "../../../lib/scrapers/elgiganten";
import { blocketScraper } from "../../../lib/scrapers/blocket";
import { hedinScraper } from "../../../lib/scrapers/hedin";
import { powerScraper } from "../../../lib/scrapers/power";
import { sellpyScraper } from "../../../lib/scrapers/sellpy";
import { vintedScraper } from "../../../lib/scrapers/vinted";
import { webhallenScraperV2 } from "../../../lib/scrapers/webhallen_v2";
import { universalScraperV4_2 } from "../../../lib/scrapers/universalScraperV4_2";
import { netonnetScraper } from "../../../lib/scrapers/netonnet";
import { ProductAnalyzer } from "../../../lib/ai/productAnalyzer";

// ------------------------------------------------------------
// HELPER: previous price
// ------------------------------------------------------------
function extractPreviousPrice(html: string): number | null {
  const regex = /(?:ord\.?pris|tidigare|was|previous|före|rek\.?pris)[^\d]{0,30}(\d[\d\s,.]+)/i;
  const m = html.match(regex);
  if (!m) return null;
  const num = parseInt(m[1].replace(/[^\d]/g, ""), 10);
  return isNaN(num) ? null : num;
}

// ------------------------------------------------------------
// AI ANALYSIS
// ------------------------------------------------------------
async function addAIAnalysis(scrapedData: any, url: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ...scrapedData, aiAnalysis: null };

  try {
    const secondhandSites = ["tradera.com", "blocket.se", "sellpy.se", "vinted.se"];
    const isUsed = secondhandSites.some((d) => url.includes(d));

    let previousPrice = scrapedData.previousPrice ?? null;
    if (!isUsed && !previousPrice && scrapedData.description) {
      previousPrice = extractPreviousPrice(scrapedData.description);
    }

    const analyzer = new ProductAnalyzer(apiKey);

    const analysis = await analyzer.analyzeProduct({
      title: scrapedData.pageTitle || "Okänd produkt",
      price:
        scrapedData.priceRaw ??
        (typeof scrapedData.priceValue === "number" ? `${scrapedData.priceValue}` : "0"),
      description: scrapedData.description ?? "",
      condition: scrapedData.condition,
      brand: scrapedData.brand,
      originalPrice: previousPrice ? `${previousPrice} kr` : undefined,
    });

    return { ...scrapedData, aiAnalysis: analysis };
  } catch (err) {
    console.error("AI ERROR:", err);
    return { ...scrapedData, aiAnalysis: null };
  }
}

// ------------------------------------------------------------
// POST ROUTE (THE ONLY REQUIRED EXPORT)
// ------------------------------------------------------------
export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    // Fetch page HTML
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html",
      },
    });

    if (res.status === 403) {
      return NextResponse.json({
        error: "blocked",
        message: "Butiken blockar automatiserad hämtning (403).",
      });
    }

    const html = await res.text();

    // SCRAPER ROUTER
    const handlers = [
      { match: (u: string) => /netonnet\.se/.test(u), scrape: netonnetScraper },
      { match: (u: string) => /tradera\.com/.test(u), scrape: traderaScraper },
      { match: (u: string) => /xxl\.se/.test(u), scrape: xxlScraper },
      { match: (u: string) => /elgiganten\.se/.test(u), scrape: elgigantenScraper },
      { match: (u: string) => /blocket\.se/.test(u), scrape: blocketScraper },
      { match: (u: string) => /hedinautomotive\.se/.test(u), scrape: hedinScraper },
      { match: (u: string) => /power\.se/.test(u), scrape: powerScraper },
      { match: (u: string) => /sellpy\.se/.test(u), scrape: sellpyScraper },
      { match: (u: string) => /vinted\.se/.test(u), scrape: vintedScraper },
      { match: (u: string) => /webhallen\.com/.test(u), scrape: webhallenScraperV2 },
      { match: () => true, scrape: (html: string, url: string) => universalScraperV4_2(html, url) },
    ];

    let scraped = null;
    for (const h of handlers) {
      if (h.match(url)) {
        scraped = await h.scrape(html, url);
        break;
      }
    }

    if (!scraped) {
      scraped = {
        sourceUrl: url,
        pageTitle: "Kunde inte hämta produkt",
        priceValue: null,
        description: "",
        imageUrl: null,
        previousPrice: null,
        error: "Scraper error",
      };
    }

    const analyzed = await addAIAnalysis(scraped, url);

    return NextResponse.json(analyzed);
  } catch (err) {
    return NextResponse.json(
      { error: "Internt fel: " + (err as Error).message },
      { status: 500 }
    );
  }
}
