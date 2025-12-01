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

export function elgigantenScraper(html: string, url: string): ScrapeResult {
      // Elgiganten säljer alltid nya produkter
      const condition = 'ny';
    // --- Sök efter "Tidigare pris" och kampanjinfo ---
    let previousPrice: number | null = null;
    let campaignInfo: string | null = null;
    // Exempel: "Tidigare pris 29990:-" eller "Tidigare pris 29 990 kr"
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

  // For outlet pages: check for hidden Videoly div with product price
  const videolyPriceMatch = html.match(/<div[^>]+id=["']videoly-product-price["'][^>]*>(\d+)<\/div>/i);
  if (videolyPriceMatch) {
    const num = Number(videolyPriceMatch[1]);
    if (!Number.isNaN(num) && num > 0) {
      priceValue = num;
      priceRaw = `${num} kr`;
      priceContext = "(från Videoly data - outlet)";
      priceConfidence = 0.9;
    }
  }

  // Try JSON-LD if no price found yet
  if (!priceValue) {
    try {
      const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
      if (jsonLdMatch) {
        const parsed = JSON.parse(jsonLdMatch[1]);
        const objs = Array.isArray(parsed) ? parsed : [parsed];
        for (const obj of objs) {
          // Check offers array first (outlet pages have this)
          if (Array.isArray(obj?.offers) && obj.offers.length > 0) {
            const price = obj.offers[0]?.price ?? null;
            if (price != null) {
              const digits = String(price).replace(/[^0-9]/g, "");
              const num = Number(digits);
              if (!Number.isNaN(num) && num > 0) {
                priceValue = num;
                priceRaw = `${num} kr`;
                priceContext = "(från JSON-LD offers)";
                priceConfidence = 0.85;
                break;
              }
            }
          }
          // Fallback to single offer object
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


  // Extract description: look for "Kort om produkten" or similar section
  let description: string | null = null;
  let description_short: string | null = null;
  let imageUrl: string | null = null;
  const bodyStart = html.indexOf("<body");
  const bodyHtml = bodyStart !== -1 ? html.slice(bodyStart) : html;

  // Elgiganten often has "Kort om produkten" section
  const kortOmIdx = bodyHtml.indexOf("Kort om produkten");
  if (kortOmIdx !== -1) {
    const slice = bodyHtml.slice(kortOmIdx, kortOmIdx + 2000);
    const cleaned = stripHtml(slice).replace(/^Kort om produkten\s*/i, "").trim();
    // Stop at common end markers
    const stopMarkers = ["Teknisk specifikation", "Läs mer om produkten", "Specifikationer", "Leverans", "Hämta i butik"];
    let finalDesc = cleaned;
    for (const marker of stopMarkers) {
      const idx = finalDesc.indexOf(marker);
      if (idx > 30) {
        finalDesc = finalDesc.slice(0, idx).trim();
        break;
      }
    }
    description = finalDesc;
  }

  // Fallback: take text from first meaningful paragraphs
  if (!description || description.length < 20) {
    const chunk = bodyHtml.slice(0, 8000);
    const paragraphs = chunk.match(/<p[^>]*>([^<]+)<\/p>/gi);
    if (paragraphs && paragraphs.length > 0) {
      for (const p of paragraphs.slice(0, 5)) {
        const cleaned = decodeEntities(stripHtml(p)).trim();
        if (cleaned.length > 50 && !cleaned.toLowerCase().includes("cookie") && !cleaned.toLowerCase().includes("meny")) {
          description = cleaned;
          break;
        }
      }
    }
  }

  // Final fallback
  if (!description || description.length < 20) {
    const chunk = stripHtml(bodyHtml.slice(0, 6000));
    const sentences = chunk.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 30);
    description = sentences.slice(0, 2).join(". ").trim();
  }

  // Lägg till kampanjinfo i description om det finns
  if (campaignInfo) {
    description = description ? `${description}\n${campaignInfo}` : campaignInfo;
  }
  // Cap description
  if (description && description.length > 500) {
    description = description.slice(0, 500).trim() + "...";
  }

  // Compute description_short
  if (description) {
    const sentences = description.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
    const keywords = ["perfekt", "4K", "OLED", "HDR", "smart", "upplösning", "teknik", "kvalitet"];
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
    comparable_median: null,
    previousPrice,
    campaignInfo,
    condition,
  };
}
