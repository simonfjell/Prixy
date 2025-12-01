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
  error?: string;
  altCandidates?: Array<{
    raw: string;
    value: number;
    context: string;
    score: number;
  }>;
};

// Dekoda HTML entities som &#229; -> å (räcker för Tradera)
function decodeEntities(str: string | null | undefined) {
  if (!str) return str ?? "";
  return str.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 10))
  );
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

export function traderaScraper(html: string, url: string) {
  // ===== 0. Jobba bara på BODY (skippa <head> som innehåller "Utropspris 100 kr") =====
  let bodyHtml = html;
  const headEnd = html.indexOf("</head>");
  if (headEnd !== -1) {
    bodyHtml = html.slice(headEnd);
  }

  // Klipp bort "andra annonser" längre ner
  let mainHtml = bodyHtml;
  const cutMarkers = [
    "Mer från samma kategori",
    "Köp mer och spara på frakten",
    "Liknande annonser",
  ];
  for (const marker of cutMarkers) {
    const idx = mainHtml.indexOf(marker);
    if (idx !== -1) {
      mainHtml = mainHtml.slice(0, idx);
      break;
    }
  }

  // ===== 1. TITEL / OG:TITLE (från hela HTML:en) =====
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

  // ===== 2. PRIS =====
  let priceRaw: string | null = null;
  let priceValue: number | null = null;
  let priceContext: string | null = null;

  let priceMatch: RegExpMatchArray | null = null;

  // Försök hitta strukturerad data (JSON-LD) eller meta tags med pris först
  try {
    const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      const jsonText = jsonLdMatch[1];
      try {
        const parsed = JSON.parse(jsonText);
        // JSON-LD kan vara ett objekt eller array
        const objs = Array.isArray(parsed) ? parsed : [parsed];
        for (const obj of objs) {
          const offers = obj?.offers ?? obj?.marketplace_offer ?? null;
          if (offers) {
            const price = offers?.price ?? offers?.priceSpecification?.price ?? null;
            if (price != null) {
              const digits = String(price).replace(/[^0-9]/g, "");
              const num = Number(digits);
              if (!Number.isNaN(num)) {
                priceValue = num;
                priceRaw = `${num} kr`;
                priceContext = "(från JSON-LD)";
                break;
              }
            }
          }
        }
      } catch (e) {
        // ignore JSON parse errors
      }
    }

    // meta itemprop or product:price:amount
    if (!priceValue) {
      const metaPriceMatch = html.match(/<meta[^>]+(?:itemprop|property|name)=["'](?:price|product:price:amount)["'][^>]+content=["']([^"']+)["'][^>]*>/i);
      if (metaPriceMatch) {
        const digits = metaPriceMatch[1].replace(/[^0-9]/g, "");
        const num = Number(digits);
        if (!Number.isNaN(num)) {
          priceValue = num;
          priceRaw = `${num} kr`;
          priceContext = "(från meta)";
        }
      }
    }
  } catch (e) {
    // ignore
  }

  // Om vi fortfarande inte hittat pris i strukturerad data -> använd Tradera-specifika regex
  // Collect all price-like occurrences and pick best by context
  function findBestPriceCandidate(htmlFragment: string) {
    const re = /([0-9][0-9\s]{0,10})\s*kr\b/gi;
    const candidates: Array<{
      raw: string;
      value: number;
      index: number;
      context: string;
      score: number;
    }> = [];

    let m: RegExpExecArray | null;
      while ((m = re.exec(htmlFragment)) !== null) {
      const raw = m[0];
      const digits = m[1].replace(/\s/g, "");
      const val = Number(digits);
      if (Number.isNaN(val)) continue;
      const idx = m.index;
        // expand context window to capture nearby labels like "Ledande bud" or price component wrappers
        const start = Math.max(0, idx - 400);
        const end = Math.min(htmlFragment.length, idx + 400);
        const rawContext = decodeEntities(htmlFragment.slice(start, end));
        const context = stripHtml(rawContext);

      // scoring based on keywords near the price
      const ctxLower = context.toLowerCase();
        let score = 0;
        if (ctxLower.includes("ledande bud")) score += 200;
        if (ctxLower.includes("utropspris") || ctxLower.includes("utgångspris")) score += 150;
        if (ctxLower.includes("startbud") || ctxLower.includes("startpris")) score += 120;
        if (ctxLower.includes("bud")) score += 30;

        // prefer contexts that look like the main price component
        if (ctxLower.includes('data-sentry-component="pricelabel"') || ctxLower.includes('data-sentry-component="pricelabel"')) score += 50;
        if (ctxLower.includes('id="price"') || ctxLower.includes('price-label') || ctxLower.includes('pricelabel')) score += 50;
        if (ctxLower.includes('data-testid="bids-label"') || ctxLower.includes('bids-label') || ctxLower.includes('animateonvaluechange')) score += 40;
        if (ctxLower.includes('buyer-protection') || ctxLower.includes('köparskydd') || ctxLower.includes('köparskyddet')) score += 20;

        // Boost if the candidate is located in elements that look like the main bid/price panel
        if (ctxLower.includes('bid-details-button') || ctxLower.includes('bid-details') || ctxLower.includes('visa bud') || ctxLower.includes('lägg bud') || ctxLower.includes('läggbud')) score += 180;

        // Penalize candidates that clearly belong to carousels / other-item cards (other ads)
        if (ctxLower.includes('cardpricesection') || ctxLower.includes('common-item-card') || ctxLower.includes('carousel') || ctxLower.includes('carousel_content') || ctxLower.includes('carousel_contentitem') || ctxLower.includes('carousel_content_item')) {
          score -= 500;
        }
      // prefer larger numbers slightly
      score += Math.log10(Math.max(1, val));

      candidates.push({ raw, value: val, index: idx, context, score });
    }

    if (candidates.length === 0) return { candidates: [], best: null };

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.value - a.value;
    });

    return { candidates, best: candidates[0] };
  }

  // First try to find best candidate in the mainHtml chunk
  const found = findBestPriceCandidate(mainHtml);
  const candidatesList = found?.candidates ?? [];
  let selected = found?.best ?? null;
  // If any candidate appears inside the main bid/price panel, prefer it explicitly
  const mainMarkers = [
    "bid-details-button",
    "visa bud",
    "lägg bud",
    "läggbud",
    "id=\"price\"",
    "amount mb-0",
    "bid-details",
    "buyer-protection",
  ];
  const prioritized = candidatesList.find((c) => {
    const ctx = (c.context || "").toLowerCase();
    return mainMarkers.some((m) => ctx.includes(m));
  });
  if (prioritized) selected = prioritized;
  // expose candidates for debugging
  let altCandidates: Array<{ raw: string; value: number; context: string; score: number }> = candidatesList.map(c => ({ raw: c.raw, value: c.value, context: c.context, score: c.score }));

  if (selected) {
    // Prefer a clear HTML candidate in many cases — JSON-LD can sometimes contain unrelated data.
    priceRaw = priceRaw ?? selected.raw;

    const ctxLower = selected.context.toLowerCase();
    const hasStrongKeyword = ctxLower.includes("ledande bud") || ctxLower.includes("utropspris") || ctxLower.includes("utgångspris");

    // Override JSON-LD/meta price if the HTML candidate has good context or a decent score.
    if (!priceValue || selected.score >= 50 || hasStrongKeyword) {
      priceValue = selected.value;
      // Ensure priceRaw reflects the chosen HTML candidate
      priceRaw = selected.raw;
      priceContext = priceContext ?? `(från HTML-kandidat)`;
    }

    // Aggressive fallback: if structured-data price exists but the selected HTML candidate is much larger,
    // prefer the HTML candidate (fixes cases where JSON-LD contains e.g. 100 kr while visible bid is 9k).
    if (priceValue && priceValue !== null && typeof priceValue === 'number') {
      // If JSON-LD was smaller and selected candidate is at least 3x larger, override.
      if (selected.value > priceValue * 3) {
        priceRaw = selected.raw;
        priceValue = selected.value;
        priceContext = `(override från HTML-kandidat, tidigare strukturerat pris var ${priceRaw})`;
      }
    }

    priceContext = priceContext ?? selected.context;
  }

  // ===== 3. BESKRIVNING (Tradera) =====
  let description: string | null = null;

  const descStart = mainHtml.indexOf("Beskrivning");
  if (descStart !== -1) {
    let descSlice = mainHtml.slice(descStart);

    const endMarkers = ["Objektnr", "Publicerad", "Köp mer och spara"];
    let endIndex = descSlice.length;
    for (const marker of endMarkers) {
      const idx = descSlice.indexOf(marker);
      if (idx !== -1 && idx < endIndex) {
        endIndex = idx;
      }
    }
    descSlice = descSlice.slice(0, endIndex);

    const cleaned = stripHtml(descSlice);
    let decoded = decodeEntities(cleaned);
    decoded = decoded.replace(/^Beskrivning\s*/i, "").trim();
    description = decoded || null;
  }

  // Compute a simple confidence metric (0..1) from the selected candidate's score.
  // If we have a selected candidate, normalize its score; otherwise give a modest confidence when only structured data exists.
  let priceConfidence: number | null = null;
  try {
    if (selected && typeof selected.score === "number") {
      const raw = Math.max(0, selected.score);
      const conf = Math.min(1, raw / 300);
      priceConfidence = Math.round(conf * 100) / 100;
    } else if (priceValue && !selected) {
      priceConfidence = 0.35; // moderate confidence from structured data
    }
  } catch (e) {
    priceConfidence = null;
  }

  // ===== 4. DESCRIPTION_SHORT: Heuristic 2-3 sentence summary with keywords =====
  let description_short: string | null = null;
  if (description) {
    // Split into sentences and extract ones containing relevant keywords
    const sentences = description.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
    const keywords = ["skick", "defekt", "service", "repor", "skadat", "sliten", "ny", "nyskick", "mint", "oöppnad", "originalförpackning", "problem"];
    
    const relevant = sentences.filter(sent => {
      const lower = sent.toLowerCase();
      return keywords.some(kw => lower.includes(kw));
    });

    // Take up to 3 relevant sentences; if fewer than 2 relevant, add first 1-2 general sentences
    let shortDesc = relevant.slice(0, 3).join(". ");
    if (shortDesc.length === 0) {
      shortDesc = sentences.slice(0, 2).join(". ");
    }
    description_short = shortDesc.trim() ? shortDesc.trim() : null;
  }

  // ===== 5. COMPARABLE_MEDIAN: Median price from altCandidates =====
  let comparable_median: number | null = null;
  try {
    if (candidatesList && candidatesList.length > 0) {
      const values = candidatesList.map(c => c.value).sort((a, b) => a - b);
      const mid = Math.floor(values.length / 2);
      comparable_median = values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
    }
  } catch (e) {
    comparable_median = null;
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
    comparable_median,
    altCandidates,
  } as ScrapeResult;
}
