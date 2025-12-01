export type ScrapeResult = {
  sourceUrl: string;
  pageTitle?: string | null;
  ogTitle?: string | null;
  priceRaw?: string | null;
  priceValue?: number | null;
  priceContext?: string | null;
  priceConfidence?: number | null;
  description?: string | null;
  description_short?: string | null;
  comparable_median?: number | null;
  imageUrl?: string | null;
  previousPrice?: number | null;
  campaignInfo?: string | null;
  condition?: string;
  error?: string;
  altCandidates?: Array<{
    raw: string;
    value: number;
    context: string;
    score: number;
  }>;
};

function decodeEntities(str: string | null | undefined) {
  if (!str) return str ?? "";
  return str.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 10))
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

export function xxlScraper(html: string, url: string): ScrapeResult {
  let previousPrice: number | null = null;
  let campaignInfo: string | null = null;
  // XXL säljer alltid nya produkter
  const condition = 'ny';

  // Försök även hitta överstruket tidigare pris (<del>, <s>, <span class="strike">)
  // <del>1499:-</del> eller <s>1499:-</s> eller <span class="strike">1499:-</span>
  const delMatch = html.match(/<(del|s|span[^>]*class=["'][^"']*strike[^"']*["'])[^>]*>(\d{2,6})[^<]*<\/(del|s|span)>/i);
  if (!previousPrice && delMatch && delMatch[2]) {
    previousPrice = parseInt(delMatch[2].replace(/\D/g, ''), 10);
    const prevText = `Tidigare pris: ${delMatch[2]} kr (överstruket)`;
    campaignInfo = campaignInfo ? `${campaignInfo} | ${prevText}` : prevText;
  }
    // Exempel: "Tidigare pris 2999:-" eller "Tidigare pris 2 999 kr"
    const prevRegex = /Tidigare\s*pris[^\d]{0,10}(\d{2,6})[\s ]*([kK][rR]|:-)?/i;
    const prevMatch = html.match(prevRegex);
    if (prevMatch && prevMatch[1]) {
      previousPrice = parseInt(prevMatch[1].replace(/\D/g, ''), 10);
      campaignInfo = `Tidigare pris: ${prevMatch[1]} kr`;
    }

    // Sök även efter "SPARA"-kampanj
    const saveRegex = /SPARA\s*(\d{2,6})/i;
    const saveMatch = html.match(saveRegex);
    if (saveMatch && saveMatch[1]) {
      const saveText = `Kampanj: SPARA ${saveMatch[1]} kr`;
      campaignInfo = campaignInfo ? `${campaignInfo} | ${saveText}` : saveText;
    }
  // Extract title
  let pageTitle: string | null = null;
  let ogTitle: string | null = null;

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    pageTitle = decodeEntities(titleMatch[1].trim());
  }

  const ogMatch = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i
  );
  if (ogMatch) {
    ogTitle = decodeEntities(ogMatch[1].trim());
  }

  // Extract price from JSON-LD or meta tags
  let priceRaw: string | null = null;
  let priceValue: number | null = null;
  let priceContext: string | null = null;
  let priceConfidence: number | null = null;

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
            priceConfidence = 0.85;
            break;
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }

  if (!priceValue) {
    const metaPriceMatch = html.match(/<meta[^>]+(?:property|name|itemprop)=["'](?:og:price:amount|product:price:amount|price)["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    if (metaPriceMatch) {
      const digits = metaPriceMatch[1].replace(/[^0-9]/g, "");
      const num = Number(digits);
      if (!Number.isNaN(num) && num > 0) {
        priceValue = num;
        priceRaw = `${num} kr`;
        priceContext = "(från meta)";
        priceConfidence = 0.8;
      }
    }
  }

  // Extract description: look for product description in XXL's structure
  let description: string | null = null;
  
  // First try JSON-LD description (most reliable for XXL)
  try {
    const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      const parsed = JSON.parse(jsonLdMatch[1]);
      const objs = Array.isArray(parsed) ? parsed : [parsed];
      for (const obj of objs) {
        if (obj?.description && typeof obj.description === 'string' && obj.description.length > 50) {
          description = obj.description.replace(/\\n/g, "\n").trim();
          break;
        }
      }
    }
  } catch (e) {
    // ignore
  }
  
  const bodyStart = html.indexOf("<body");
  const bodyHtml = bodyStart !== -1 ? html.slice(bodyStart) : html;
  
  // Fallback: look for description markers in HTML
  if (!description || description.length < 20) {
    const descMarkers = [
      "Produktbeskrivning",
      "Produktinformation",
      "Om produkten"
    ];
    
    for (const marker of descMarkers) {
      const markerIdx = bodyHtml.indexOf(marker);
      if (markerIdx !== -1) {
        const slice = bodyHtml.slice(markerIdx, markerIdx + 2000);
        const cleaned = stripHtml(slice).replace(new RegExp(marker, "i"), "").trim();
        
        const stopWords = ["Specifikationer", "Detaljer", "Material", "Storlek", "Färg", "Leverans"];
        let finalText = cleaned;
        for (const stop of stopWords) {
          const idx = finalText.indexOf(stop);
          if (idx > 30) {
            finalText = finalText.slice(0, idx).trim();
            break;
          }
        }
        
        if (finalText.length > 50 && 
            !finalText.includes("css-") && 
            !finalText.includes("display:") &&
            !finalText.includes("webkit")) {
          description = finalText;
          break;
        }
      }
    }
  }

  // Lägg till kampanjinfo i description om det finns
  if (campaignInfo) {
    description = description ? `${description}\n${campaignInfo}` : campaignInfo;
  }
  // Cap description at reasonable length
  if (description && description.length > 800) {
    const sentences = description.split(/[.!?]+/).filter(s => s.trim().length > 0);
    description = sentences.slice(0, 5).join(". ").trim() + ".";
  }
  if (description && description.length > 800) {
    description = description.slice(0, 800).trim() + "...";
  }

  // Compute description_short
  let description_short: string | null = null;
  if (description) {
    const sentences = description.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
    const keywords = ["skick", "material", "design", "funktion", "kvalitet", "komfort"];
    const relevant = sentences.filter(sent => {
      const lower = sent.toLowerCase();
      return keywords.some(kw => lower.includes(kw));
    });
    let shortDesc = relevant.slice(0, 2).join(". ");
    if (shortDesc.length === 0) {
      shortDesc = sentences.slice(0, 2).join(". ");
    }
    description_short = shortDesc.trim() ? shortDesc.trim() : null;
  }

  // Extract first image
  let imageUrl: string | null = null;
  
  // Try JSON-LD first (XXL stores images here)
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const jsonData = JSON.parse(jsonLdMatch[1]);
      // Handle array of JSON-LD objects
      const items = Array.isArray(jsonData) ? jsonData : [jsonData];
      
      for (const item of items) {
        if (item.image) {
          if (Array.isArray(item.image) && item.image.length > 0) {
            imageUrl = item.image[0];
            break;
          } else if (typeof item.image === 'string') {
            imageUrl = item.image;
            break;
          }
        }
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
  }
  
  // Fallback to og:image
  if (!imageUrl) {
    const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    if (ogImageMatch) {
      imageUrl = ogImageMatch[1];
    }
  }

  return {
    sourceUrl: url,
    pageTitle,
    ogTitle,
    priceRaw,
    priceValue,
    priceContext,
    priceConfidence,
    description,
    description_short,
    imageUrl,
    comparable_median: null, // No comparable prices for single product pages
    previousPrice,
    campaignInfo,
    condition,
  };
}
