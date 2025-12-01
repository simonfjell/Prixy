// Generic e-commerce scraper for standard retail sites (Elgiganten, Power, XXL, etc.)

export type EcommerceResult = {
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
  error?: string;
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

export function ecommerceScraper(html: string, url: string): EcommerceResult {
  // ===== 1. TITLE =====
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

  // ===== 2. PRICE =====
  let priceRaw: string | null = null;
  let priceValue: number | null = null;
  let priceContext: string | null = null;
  let priceConfidence: number | null = null;

  // Try to extract from JSON-LD or embedded JSON first (best for SPAs)
  try {
    const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      const parsed = JSON.parse(jsonLdMatch[1]);
      const objs = Array.isArray(parsed) ? parsed : [parsed];
      for (const obj of objs) {
        // Check offers array
        if (Array.isArray(obj?.offers) && obj.offers.length > 0) {
          const price = obj.offers[0]?.price ?? null;
          if (price != null) {
            const num = Number(String(price).replace(/[^0-9]/g, ""));
            if (!Number.isNaN(num) && num > 0) {
              priceValue = num;
              priceRaw = `${num} kr`;
              priceContext = "(från JSON-LD offers[])";
              priceConfidence = 0.9;
              break;
            }
          }
        }
        // Single offer object
        const price = obj?.offers?.price ?? obj?.price ?? null;
        if (price != null) {
          const num = Number(String(price).replace(/[^0-9]/g, ""));
          if (!Number.isNaN(num) && num > 0) {
            priceValue = num;
            priceRaw = `${num} kr`;
            priceContext = "(från JSON-LD)";
            priceConfidence = 0.9;
            break;
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }

  // Try embedded data in script tags (e.g., window.__INITIAL_STATE__)
  if (!priceValue) {
    // Look for "price": 12345 in script tags
    const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    for (const scriptMatch of scriptMatches) {
      const scriptContent = scriptMatch[1];
      
      // Pattern: "price": 12345 or "price":12345
      const pricePatterns = [
        /"price"\s*:\s*(\d{3,})/g,
        /'price'\s*:\s*(\d{3,})/g,
      ];
      
      for (const pattern of pricePatterns) {
        const matches = [...scriptContent.matchAll(pattern)];
        for (const match of matches) {
          const num = Number(match[1]);
          if (!Number.isNaN(num) && num > 500) { // sanity check
            priceValue = num;
            priceRaw = `${num} kr`;
            priceContext = "(från inbäddad JSON)";
            priceConfidence = 0.85;
            break;
          }
        }
        if (priceValue) break;
      }
      if (priceValue) break;
    }
  }

  // Try multiple meta tag patterns
  if (!priceValue) {
    const metaPricePatterns = [
      /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      /<meta[^>]+name=["']price["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    ];

    for (const pattern of metaPricePatterns) {
      const match = html.match(pattern);
      if (match) {
        const digits = match[1].replace(/[^0-9]/g, "");
        const num = Number(digits);
        if (!Number.isNaN(num) && num > 0) {
          priceValue = num;
          priceRaw = `${num} kr`;
          priceContext = "(från meta-tag)";
          priceConfidence = 0.85;
          break;
        }
      }
    }
  }

  // Final fallback: search HTML for price pattern
  if (!priceValue) {
    const headEnd = html.indexOf("</head>");
    const bodyHtml = headEnd !== -1 ? html.slice(headEnd) : html;
    const topChunk = bodyHtml.slice(0, 10000);

    const priceRegex = /([0-9\s]{1,10})\s*kr\b/i;
    const match = topChunk.match(priceRegex);

    if (match) {
      const digits = match[1].replace(/\s/g, "");
      const num = Number(digits);
      if (!Number.isNaN(num) && num > 0) {
        priceValue = num;
        priceRaw = `${num} kr`;
        const idx = match.index ?? -1;
        if (idx >= 0) {
          const start = Math.max(0, idx - 100);
          const end = Math.min(topChunk.length, idx + 100);
          priceContext = decodeEntities(topChunk.slice(start, end)).slice(0, 200);
        }
        priceConfidence = 0.6;
      }
    }
  }

  // ===== 3. DESCRIPTION (look for common selectors) =====
  let description: string | null = null;

  // Try to find description in common e-commerce patterns
  const descPatterns = [
    /<div[^>]+(?:class|id)=["'](?:description|desc|product-description)["'][^>]*>([\s\S]{0,3000}?)<\/div>/i,
    /<section[^>]+(?:class|id)=["'](?:description|desc|product-description)["'][^>]*>([\s\S]{0,3000}?)<\/section>/i,
    /<p[^>]*class=["']description["'][^>]*>([\s\S]{0,800}?)<\/p>/i,
  ];

  for (const pattern of descPatterns) {
    const match = html.match(pattern);
    if (match) {
      const raw = stripHtml(match[1]);
      const cleaned = decodeEntities(raw).trim();
      if (cleaned.length > 20) {
        description = cleaned.slice(0, 1000);
        break;
      }
    }
  }

  // Fallback: take first meaningful text after body tag
  if (!description) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]{0,5000}?)<\/body>/i);
    if (bodyMatch) {
      const bodyText = stripHtml(bodyMatch[1]);
      const cleaned = decodeEntities(bodyText).trim();
      description = cleaned.slice(0, 500);
    }
  }

  // ===== 4. DESCRIPTION_SHORT =====
  let description_short: string | null = null;
  if (description) {
    const sentences = description
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    const keywords = [
      "skick",
      "condition",
      "ny",
      "nytt",
      "defekt",
      "damaged",
      "features",
      "specifikation",
    ];

    const relevant = sentences.filter(sent => {
      const lower = sent.toLowerCase();
      return keywords.some(kw => lower.includes(kw));
    });

    let shortDesc = relevant.slice(0, 2).join(". ");
    if (shortDesc.length === 0) {
      shortDesc = sentences.slice(0, 1).join(". ");
    }
    description_short = shortDesc.trim() ? shortDesc.trim() : null;
  }

  // Extract first image
  let imageUrl: string | null = null;
  
  // Try JSON-LD first
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const jsonData = JSON.parse(jsonLdMatch[1]);
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
      // Ignore
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
    comparable_median: null, // e-commerce sites usually don't have multiple prices on same page
  };
}
