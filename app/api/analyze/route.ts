// ------------------------------------------------------------
// NEXT.JS RUNTIME
// ------------------------------------------------------------
export const runtime = "nodejs";

// ------------------------------------------------------------
// IMPORTS
// ------------------------------------------------------------
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
import { netonnetScraper } from "../../../lib/scrapers/netonnet";
import { ProductAnalyzer } from "../../../lib/ai/productAnalyzer";

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

// Enkel “tidigare pris”-regex som backup
function extractPreviousPrice(html: string): number | null {
  const regex =
    /(?:ord\.?pris|tidigare|was|previous|före|förr|rek\.?pris|rekommenderat pris)[^\d]{0,30}(\d[\d\s,.]+)/i;

  const match = html.match(regex);
  if (!match || !match[1]) return null;

  const cleaned = match[1].replace(/[^\d]/g, "");
  const num = parseInt(cleaned, 10);
  return isNaN(num) || num <= 0 ? null : num;
}

function decodeEntities(str: string | null | undefined) {
  if (!str) return str ?? "";
  return str.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 10)),
  );
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ------------------------------------------------------------
// AI ANALYS (din befintliga logik)
// ------------------------------------------------------------
async function addAIAnalysis(scrapedData: any, url: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ Ingen ANTHROPIC_API_KEY – hoppar över AI-analys");
    return { ...scrapedData, aiAnalysis: null };
  }

  try {
    const isUsedSite = ["tradera.com", "blocket.se", "sellpy.se", "vinted.se"].some(
      (domain) => url.includes(domain),
    );

    let previousPrice: number | null =
      typeof scrapedData.previousPrice === "number"
        ? scrapedData.previousPrice
        : null;

    if (!isUsedSite && !previousPrice && typeof scrapedData.description === "string") {
      previousPrice = extractPreviousPrice(scrapedData.description);
    }

    const analyzer = new ProductAnalyzer(apiKey);

    const analysis = await analyzer.analyzeProduct({
      title: scrapedData.pageTitle || "Okänd produkt",
      price:
        scrapedData.priceRaw ||
        (typeof scrapedData.priceValue === "number"
          ? `${scrapedData.priceValue}`
          : "0"),
      description: scrapedData.description || "",
      condition: scrapedData.condition,
      brand: scrapedData.brand,
      originalPrice: previousPrice ? `${previousPrice} kr` : undefined,
    });

    return { ...scrapedData, aiAnalysis: analysis, previousPrice };
  } catch (err) {
    console.error("AI Analysis error:", err);
    return { ...scrapedData, aiAnalysis: null };
  }
}

// ------------------------------------------------------------
// MAIN API ROUTE
// ------------------------------------------------------------
export async function POST(req: Request) {
  console.log("🔥 ANALYZE CALLED (start)");

  try {
    console.log("🔥 STEP 1: Reading JSON...");
    const { url } = await req.json();
    console.log("🔥 STEP 1 OK:", { url });

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Ingen giltig URL mottagen." },
        { status: 400 },
      );
    }

    console.log("🔥 STEP 2: Fetching page HTML...");
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "sv-SE,sv;q=0.9",
        Referer: "https://www.google.com/",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
      },
    });

    if (!res.ok) {
      console.error("❌ Fetch failed with status:", res.status);
      // Universal svensk fallback för fetch-fel (t.ex. 403, 404)
      return NextResponse.json({
        sourceUrl: url,
        pageTitle: "Kunde inte hämta produkt",
        priceValue: null,
        priceRaw: "Ej tillgängligt",
        description: "Produkten kunde inte hämtas – sidan blockerar automatiserad hämtning eller är otillgänglig.",
        imageUrl: null,
        condition: "okänd",
        campaignInfo: null,
        previousPrice: null,
        error: `Kunde inte hämta sidan (HTTP ${res.status})`,
      }, { status: 200 });
    }

    const html = await res.text();
    console.log("🔥 STEP 2 OK: HTML length:", html.length);

    // --------------------------------------------------------
    // ROUTING TILL RÄTT SCRAPER
    // --------------------------------------------------------
    type SiteHandler = {
      match: (url: string) => boolean;
      scrape: (html: string, url: string) => Promise<any> | any;
    };

    const siteHandlers: SiteHandler[] = [
      {
        match: (u) => /netonnet\.se/.test(u),
        scrape: (html, url) => netonnetScraper(html, url),
      },
      { match: (u) => /tradera\.com/.test(u), scrape: traderaScraper },
      { match: (u) => /xxl\.se/.test(u), scrape: xxlScraper },
      { match: (u) => /elgiganten\.se/.test(u), scrape: elgigantenScraper },
      { match: (u) => /blocket\.se/.test(u), scrape: blocketScraper },
      { match: (u) => /hedinautomotive\.se/.test(u), scrape: hedinScraper },
      {
        match: (u) => /power\.se/.test(u),
        scrape: (_html, url) => powerScraper(url),
      },
      {
        match: (u) => /sellpy\.se/.test(u),
        scrape: (_html, url) => sellpyScraper(url),
      },
      {
        match: (u) => /vinted\.se/.test(u),
        scrape: (html, url) => vintedScraper(html, url),
      },
      {
        match: (u) => /webhallen\.com/.test(u),
        scrape: (_html, url) => webhallenScraperV2(url),
      },
    ];

    let scraped: any | null = null;

    for (const handler of siteHandlers) {
      if (handler.match(url)) {
        console.log("🔥 STEP 3: Using handler for URL:", url);
        scraped = await handler.scrape(html, url);
        break;
      }
    }


      // Universal fallback for scraper errors or no result
      if (!scraped || scraped.error || scraped.priceValue === undefined) {
        console.warn("⚠️ Scraper failed or blocked, returning universal fallback message.");
        scraped = {
          sourceUrl: url,
          pageTitle: "Kunde inte hämta produkt",
          priceValue: null,
          priceRaw: "Ej tillgängligt",
          description: "Produkten kunde inte hämtas – sidan blockerar automatiserad hämtning eller är otillgänglig.",
          imageUrl: null,
          condition: "okänd",
          campaignInfo: null,
          previousPrice: null,
          error: scraped?.error || null,
        };
      }

    console.log("🔥 STEP 4: Running AI analysis...");
    const analyzed = await addAIAnalysis(scraped, url);
    console.log("🔥 STEP 4 OK");

    return NextResponse.json(analyzed);
  } catch (err: any) {
    console.error("💥 ANALYZE FAILED (HARD DEBUG):", err);
    console.error("💥 STACK:", err?.stack);
    return NextResponse.json(
      {
        error: `Internt fel i analysen (HARD DEBUG): ${
          err?.message || String(err)
        }`,
      },
      { status: 500 },
    );
  }
}
