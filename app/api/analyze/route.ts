// Universal previous price extractor (selectors + regex)
function extractPreviousPrice(html: string): number | null {
  // Common selectors (for future DOM parsing)
  // Fallback: regex in HTML
  const regex = /(?:ord\.?pris|tidigare|was|previous|före|förr|rek\.?pris|rekommenderat pris)[^\d]{0,30}(\d[\d\s,.]+)/i;
  const match = html.match(regex);
  if (match && match[1]) {
    // Clean up price string
    const cleaned = match[1].replace(/[^\d]/g, '');
    const num = parseInt(cleaned, 10);
    if (!isNaN(num) && num > 0) return num;
  }
  return null;
}
// Enkel in-memory cache (för demo/utveckling, nollställs vid omstart)
const productCache = new Map<string, any>();

function makeCacheKey(data: { title?: string|null, priceValue?: number|null, brand?: string|null }) {
  // Bygg en enkel hash-nyckel av titel, pris och ev. brand
  return [
    (data.title || '').toLowerCase().replace(/\s+/g, ''),
    data.priceValue || '',
    (data.brand || '').toLowerCase().replace(/\s+/g, '')
  ].join('|');
}
import { NextResponse } from "next/server";
import { traderaScraper } from "../../../lib/scrapers/tradera";
import { xxlScraper } from "../../../lib/scrapers/xxl";
import { elgigantenScraper } from "../../../lib/scrapers/elgiganten";
import { blocketScraper } from "../../../lib/scrapers/blocket";
import { hedinScraper } from "../../../lib/scrapers/hedin";
import { powerScraper } from "../../../lib/scrapers/power";
import { sellpyScraper } from "../../../lib/scrapers/sellpy";
import { ProductAnalyzer } from "../../../lib/ai/productAnalyzer";
import { vintedScraper } from "../../../lib/scrapers/vinted";
import { webhallenScraperV2 } from "../../../lib/scrapers/webhallen_v2";
// import { inetTestScraper } from "../../../lib/scrapers/inet_test";

// Dekoda HTML entities som &#229; -> å
function decodeEntities(str: string | null | undefined) {
  if (!str) return str ?? "";
  return str.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

// Ta bort taggar, script osv -> ren text
function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Helper function to add AI analysis to scraper results
async function addAIAnalysis(scrapedData: any, url: string) {
  // Only analyze if we have an API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ...scrapedData, aiAnalysis: null };
  }

  try {
    // --- Fake-rea-detektion och previousPrice-extraktion ---
    // Hoppa fake-rea-detektion på begagnat-sajter
    let previousPrice: number | null = null;
    const isUsedSite = ["tradera.com", "blocket.se", "sellpy.se", "vinted.se"].some(domain => url.includes(domain));
    if (!isUsedSite) {
      if (scrapedData.previousPrice && typeof scrapedData.previousPrice === 'number') {
        previousPrice = scrapedData.previousPrice;
      } else if (scrapedData.rawHtml && typeof scrapedData.rawHtml === 'string') {
        previousPrice = extractPreviousPrice(scrapedData.rawHtml);
      } else if (scrapedData.description && typeof scrapedData.description === 'string') {
        previousPrice = extractPreviousPrice(scrapedData.description);
      }
    }

    const analyzer = new ProductAnalyzer(apiKey);
    const analysis = await analyzer.analyzeProduct({
      title: scrapedData.pageTitle || 'Okänd produkt',
      price: scrapedData.priceRaw || '0',
      description: scrapedData.description,
      condition: scrapedData.condition,
      brand: scrapedData.brand,
      originalPrice: previousPrice ? `${previousPrice} kr` : (scrapedData.originalPrice || undefined)
    });


    // --- Fejkad rea: NY logik enligt expertregler ---
    let fakeSaleFlag = false;
    let fakeSaleWarning = '';
    // Hämta AI:ns rimliga intervall (t.ex. "18000-20000kr")
    let fairMin = null, fairMax = null;
    let isNewUnreleasedProduct = false;
    
    if (analysis.estimatedFairPrice && typeof analysis.estimatedFairPrice === 'string') {
      // Kolla om AI:n säger att produkten är för ny/ej lanserad
      const lowerReasoning = (analysis.reasoning || '').toLowerCase();
      isNewUnreleasedProduct = lowerReasoning.includes('ej lanserad') || 
                              lowerReasoning.includes('inte lanserad') || 
                              lowerReasoning.includes('ny modell') && lowerReasoning.includes('osäker') ||
                              lowerReasoning.includes('för ny') ||
                              analysis.verdict === 'oklart' && lowerReasoning.includes('utan definitiv marknad');
      
      const fairMatch = analysis.estimatedFairPrice.match(/(\d{3,6})\s*[-–]\s*(\d{3,6})/);
      if (fairMatch) {
        fairMin = parseInt(fairMatch[1], 10);
        fairMax = parseInt(fairMatch[2], 10);
      } else {
        const singleMatch = analysis.estimatedFairPrice.match(/(\d{3,6})/);
        if (singleMatch) fairMin = parseInt(singleMatch[1], 10);
      }
      
      // För nya produkter: försök hitta referens från föregående generation
      if (isNewUnreleasedProduct && (!fairMin || !fairMax)) {
        const title = scrapedData.pageTitle || '';
        let referencePrice = null;
        
        // RTX 50-serien → RTX 40-serien
        if (title.match(/RTX\s*50\d0/i)) {
          const modelMatch = title.match(/RTX\s*50(\d)0/i);
          if (modelMatch) {
            const tier = modelMatch[1];
            // RTX 5090 → RTX 4090 referens (~22000-26000)
            // RTX 5080 → RTX 4080 referens (~12000-16000) 
            if (tier === '9') referencePrice = 24000;
            else if (tier === '8') referencePrice = 14000;
            else if (tier === '7') referencePrice = 10000;
            else if (tier === '6') referencePrice = 7000;
          }
        }
        
        if (referencePrice) {
          fairMin = Math.round(referencePrice * 0.85);  // -15%
          fairMax = Math.round(referencePrice * 1.25);  // +25%
          console.log(`New product reference: ${fairMin}-${fairMax} kr based on previous gen ${referencePrice} kr`);
        }
      }
    }

    // Om nupriset är under marknadsvärde, sätt verdict till 'kap' oavsett AI:ns svar
    if (
      fairMin !== null && typeof fairMin === 'number' &&
      scrapedData.priceValue && typeof scrapedData.priceValue === 'number' &&
      scrapedData.priceValue < fairMin
    ) {
      if (analysis.verdict !== 'kap') {
        analysis.verdict = 'kap';
        analysis.reasoning = (analysis.reasoning ? analysis.reasoning + ' ' : '') + 'Nuvarande pris är under marknadsvärde – detta är ett kap, även om rean är fejkad eller tidigare pris är vilseledande.';
      }
    }
    
    // Om nupriset är inom marknadsspannet, sätt verdict till 'rimligt' oavsett AI:ns svar
    if (
      fairMin !== null && typeof fairMin === 'number' &&
      fairMax !== null && typeof fairMax === 'number' &&
      scrapedData.priceValue && typeof scrapedData.priceValue === 'number' &&
      scrapedData.priceValue >= fairMin && scrapedData.priceValue <= fairMax
    ) {
      if (analysis.verdict === 'kap') {
        analysis.verdict = 'rimligt';
        analysis.reasoning = (analysis.reasoning ? analysis.reasoning + ' ' : '') + 'Priset ligger inom det rimliga marknadsspannet.';
      }
    }
    // Årsmodell 2023–2025?
    const yearMatch = (scrapedData.pageTitle || scrapedData.description || '').match(/20(2[3-5])/);
    const isNewModel = !!yearMatch;

    // NY: Flagga fake-rea om tidigare pris är >20% över marknadsvärde, oavsett årsmodell och återförsäljare
    if (
      fairMin !== null && typeof fairMin === 'number' &&
      fairMax !== null && typeof fairMax === 'number' &&
      previousPrice && typeof previousPrice === 'number' &&
      scrapedData.priceValue && typeof scrapedData.priceValue === 'number'
    ) {
      const prevMuchHigher = previousPrice > fairMax * 1.20;
      if (prevMuchHigher) {
        fakeSaleFlag = true;
        if (scrapedData.priceValue < fairMin) {
          fakeSaleWarning = `⚠️ Möjlig bluff-rea: "Tidigare pris" (${previousPrice} kr) är över 20% högre än rimligt marknadsvärde (${fairMin}-${fairMax} kr). Detta kan vara ett påhittat eller vilseledande jämförelsepris. Men: nuvarande pris är faktiskt riktigt bra – du blir inte lurad på affären, bara på reans storlek!`;
        } else if (scrapedData.priceValue <= fairMax * 1.05) {
          fakeSaleWarning = `⚠️ Möjlig bluff-rea: "Tidigare pris" (${previousPrice} kr) är över 20% högre än rimligt marknadsvärde (${fairMin}-${fairMax} kr). Detta kan vara ett påhittat eller vilseledande jämförelsepris. Nuvarande pris är rimligt, men rean är troligen överdriven.`;
        } else {
          fakeSaleWarning = `⚠️ Möjlig bluff-rea: "Tidigare pris" (${previousPrice} kr) är över 20% högre än rimligt marknadsvärde (${fairMin}-${fairMax} kr). Detta kan vara ett påhittat eller vilseledande jämförelsepris.`;
        }
      }
    }

    // Behåll även den gamla (striktare) regeln för nya modeller
    if (
      fairMin !== null && typeof fairMin === 'number' &&
      fairMax !== null && typeof fairMax === 'number' &&
      scrapedData.priceValue && typeof scrapedData.priceValue === 'number' &&
      previousPrice && typeof previousPrice === 'number'
    ) {
      const priceInRange = scrapedData.priceValue >= fairMin * 0.95 && scrapedData.priceValue <= fairMax * 1.05;
      const prevMuchHigher = previousPrice > fairMax * 1.25;
      if (priceInRange && prevMuchHigher && isNewModel) {
        fakeSaleFlag = true;
        if (scrapedData.priceValue < fairMin) {
          fakeSaleWarning = `⚠️ Fejkad rea: Tidigare pris (${previousPrice} kr) är minst 25% högre än rimligt marknadspris (${fairMin}-${fairMax} kr) för en ny modell (${yearMatch ? yearMatch[0] : ''}). Detta är troligen ett rekommenderat pris (RRP) som butiken aldrig sålt för – men: nuvarande pris är faktiskt riktigt bra – du blir inte lurad på affären, bara på reans storlek!`;
        } else {
          fakeSaleWarning = `⚠️ Fejkad rea: Tidigare pris (${previousPrice} kr) är minst 25% högre än rimligt marknadspris (${fairMin}-${fairMax} kr) för en ny modell (${yearMatch ? yearMatch[0] : ''}). Detta är troligen ett rekommenderat pris (RRP) som butiken aldrig sålt för – nuvarande pris är det riktiga marknadspriset.`;
        }
      }
    }

    return { ...scrapedData, aiAnalysis: analysis, fakeSaleFlag, fakeSaleWarning, previousPrice, isNewUnreleasedProduct };
  } catch (error) {
    console.error('AI Analysis error:', error);
    return { ...scrapedData, aiAnalysis: null };
  }
}

export async function POST(req: Request) {

  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Ingen giltig URL mottagen." }, { status: 400 });
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Kunde inte hämta sidan (${res.status}).` }, { status: 500 });
    }

    const html = await res.text();


    // Route to site-specific scrapers
    const siteHandlers = [
      {
        match: (url: string) => url.includes("tradera.com"),
        scrape: (html: string, url: string) => traderaScraper(html, url)
      },
      {
        match: (url: string) => url.includes("xxl.se"),
        scrape: (html: string, url: string) => xxlScraper(html, url)
      },
      {
        match: (url: string) => url.includes("elgiganten.se"),
        scrape: (html: string, url: string) => elgigantenScraper(html, url)
      },
      {
        match: (url: string) => url.includes("blocket.se"),
        scrape: (html: string, url: string) => blocketScraper(html, url)
      },
      {
        match: (url: string) => url.includes("hedinautomotive.se"),
        scrape: (html: string, url: string) => hedinScraper(html, url)
      },
      {
        match: (url: string) => url.includes("power.se"),
        scrape: async (_html: string, url: string) => await powerScraper(url)
      },
      {
        match: (url: string) => url.includes("sellpy.se"),
        scrape: async (_html: string, url: string) => await sellpyScraper(url)
      },
      {
        match: (url: string) => url.includes("vinted.se"),
        scrape: async (html: string, url: string) => await vintedScraper(html, url)
      },
      {
        match: (url: string) => url.includes("webhallen.com"),
        scrape: async (_html: string, url: string) => await webhallenScraperV2(url)
      },
      // {
      //   match: (url: string) => url.includes("inet.se"),
      //   scrape: async (_html: string, url: string) => await inetTestScraper(url)
      // },
    ];

    for (const handler of siteHandlers) {
      if (handler.match(url)) {
        const result = await handler.scrape(html, url);
        // Bygg cache-nyckel på titel + prisvärde (eller brand)
        const cacheKey = makeCacheKey({
          title: result.pageTitle || (result as any).ogTitle || '',
          priceValue: result.priceValue,
          brand: (result as any).brand || ''
        });
        
        // CACHE DISABLED FOR TESTING
        // if (productCache.has(cacheKey)) {
        //   return NextResponse.json(productCache.get(cacheKey));
        // }
        
        const safeResult = { ...result } as any;
        if (safeResult.altCandidates) delete safeResult.altCandidates;
        const analyzedResult = await addAIAnalysis(safeResult, url);
        
        // CACHE DISABLED FOR TESTING
        // productCache.set(cacheKey, analyzedResult);
        
        return NextResponse.json(analyzedResult);
      }
    }

    // Generic fallback: improved for e-commerce sites
    const headEnd = html.indexOf("</head>");
    const bodyHtml = headEnd !== -1 ? html.slice(headEnd) : html;
    const topChunk = bodyHtml.slice(0, 12000);

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    const pageTitle = titleMatch ? decodeEntities(titleMatch[1].trim()) : null;
    const ogTitle = ogMatch ? decodeEntities(ogMatch[1].trim()) : null;

    // Extract price from structured data (meta tags, JSON-LD)
    let priceRaw: string | null = null;
    let priceValue: number | null = null;
    let priceContext: string | null = null;
    let priceConfidence: number | null = null;

    // Try JSON-LD first
    try {
      const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
      if (jsonLdMatch) {
        const parsed = JSON.parse(jsonLdMatch[1]);
        const objs = Array.isArray(parsed) ? parsed : [parsed];
        for (const obj of objs) {
          const price = obj?.offers?.price ?? obj?.price ?? null;
          if (price != null) {
            const digits = String(price).replace(/[^0-9]/g, "");
            const num = Number(digits);
            if (!Number.isNaN(num) && num > 0) {
              priceValue = num;
              priceRaw = `${num} kr`;
              priceContext = "(från JSON-LD)";
              priceConfidence = 0.75;
              break;
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }

    // Try meta tags (og:price, product:price, itemprop)
    if (!priceValue) {
      const metaPriceMatch = html.match(/<meta[^>]+(?:property|name|itemprop)=["'](?:og:price:amount|product:price:amount|price)["'][^>]+content=["']([^"']+)["'][^>]*>/i);
      if (metaPriceMatch) {
        const digits = metaPriceMatch[1].replace(/[^0-9]/g, "");
        const num = Number(digits);
        if (!Number.isNaN(num) && num > 0) {
          priceValue = num;
          priceRaw = `${num} kr`;
          priceContext = "(från meta)";
          priceConfidence = 0.7;
        }
      }
    }

    // Fallback to regex in body if no structured price
    if (!priceValue) {
      const pm = topChunk.match(/([0-9][0-9\s]{0,10})\s*kr\b/i);
      if (pm) {
        priceRaw = decodeEntities(pm[0].trim());
        const digits = pm[1].replace(/\s/g, "");
        const num = Number(digits);
        if (!Number.isNaN(num)) {
          priceValue = num;
          priceConfidence = 0.4;
        }
        const idx = pm.index ?? -1;
        if (idx >= 0) {
          const start = Math.max(0, idx - 80);
          const end = Math.min(topChunk.length, idx + 80);
          priceContext = decodeEntities(topChunk.slice(start, end));
        }
      }
    }

    // Extract description
    let description: string | null = null;
    const descMarkers = ["Beskrivning", "Produktbeskrivning", "Product description", "Om produkten", "Produktdetaljer"];
    for (const marker of descMarkers) {
      const descIdx = topChunk.indexOf(marker);
      if (descIdx !== -1) {
        // Take a smaller slice to avoid extra content (max 1500 chars after marker)
        const descSlice = topChunk.slice(descIdx, descIdx + 1500);
        let cleaned = stripHtml(descSlice).replace(new RegExp(`^${marker}\\s*`, "i"), "").trim();
        
        // Stop at common noise markers early
        const stopMarkers = ["Leverans", "Frakt", "Lagerstatus", "Specifikation", "Egenskaper", "Recensioner", "Betyg", "Köp", "Lägg till", "Handla", "Se hela", "Visa alla", "Storlek", "Färg", "Välj"];
        for (const stop of stopMarkers) {
          const stopIdx = cleaned.toLowerCase().indexOf(stop.toLowerCase());
          if (stopIdx > 30) { // only cut if there's at least 30 chars of real description
            cleaned = cleaned.slice(0, stopIdx).trim();
            break;
          }
        }
        
        // Take only first 2-3 sentences if description is very long
        if (cleaned.length > 400) {
          const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 0);
          cleaned = sentences.slice(0, 3).join(". ").trim();
          if (cleaned && !cleaned.endsWith(".")) cleaned += ".";
        }
        
        description = cleaned;
        break;
      }
    }
    if (!description || description.length < 20) {
      // Fallback: take clean text from body, limit to first 2-3 sentences, max 400 chars
      const fallbackText = stripHtml(topChunk).slice(0, 800).trim();
      const sentences = fallbackText.split(/[.!?]+/).filter(s => s.trim().length > 10);
      description = sentences.slice(0, 3).join(". ").trim();
      if (description && !description.endsWith(".")) description += ".";
    }
    // Final safety: cap description at 500 chars
    if (description && description.length > 500) {
      description = description.slice(0, 500).trim() + "...";
    }

    // Compute description_short (heuristic 2-3 sentence summary)
    let description_short: string | null = null;
    if (description) {
      const sentences = description.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
      const keywords = ["skick", "defekt", "service", "repor", "skadat", "sliten", "ny", "nyskick", "mint", "oöppnad", "originalförpackning", "problem", "garanti", "kvalitet"];
      const relevant = sentences.filter(sent => {
        const lower = sent.toLowerCase();
        return keywords.some(kw => lower.includes(kw));
      });
      let shortDesc = relevant.slice(0, 3).join(". ");
      if (shortDesc.length === 0) {
        shortDesc = sentences.slice(0, 2).join(". ");
      }
      description_short = shortDesc.trim() ? shortDesc.trim() : null;
    }

    // No comparable_median for generic sites (we don't have multiple listings to compare)
    const comparable_median: number | null = null;

    return NextResponse.json({
      sourceUrl: url,
      pageTitle,
      ogTitle,
      priceRaw,
      priceValue,
      priceConfidence,
      priceContext,
      description,
      description_short,
      comparable_median,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Analyze error:", errorMsg, err);
    return NextResponse.json({ error: `Internt fel i analysen: ${errorMsg}` }, { status: 500 });
  }
}

