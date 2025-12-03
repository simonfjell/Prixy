import type { ScrapeResult } from "./xxl";

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

function tryJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ============================================================
// UPGRADE: FIX A — extract "Tidigare pris" explicitly
// ============================================================
function extractLowestPriceHTML(html: string): number | null {
  const m = html.match(/lowestPrice[^>]*>([\s\S]*?)<\/span>/i);
  if (!m) return null;

  const cleaned = m[1].replace(/[^\d]/g, "");
  const num = Number(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

// ============================================================
// MAIN SCRAPER
// ============================================================
export function netonnetScraper(html: string, url: string): ScrapeResult {
  const result: ScrapeResult = {
    sourceUrl: url,
    pageTitle: null,
    ogTitle: null,
    priceRaw: null,
    priceValue: null,
    priceContext: null,
    priceConfidence: null,
    description: null,
    description_short: null,
    comparable_median: null,
    previousPrice: null,
    campaignInfo: null,
    imageUrl: null,
    condition: "ny",
  };

  // ============================================================
  // 1) TRY __NEXT_DATA__ (best source)
  // ============================================================
  const nextDataMatch = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    const json = tryJson<any>(nextDataMatch[1]);
    if (json && json.props?.pageProps) {
      const p = json.props.pageProps.product || json.props.pageProps.data || null;

      if (p) {
        // TITLE
        result.pageTitle = p.name || p.title || null;

        // PRICE
        let price: number | null = null;

        if (p.price?.current?.value) {
          price = p.price.current.value;
          result.priceContext = "(NetOnNet __NEXT_DATA__ price.current.value)";
        }

        if (!price && p.price?.value) {
          price = p.price.value;
          result.priceContext = "(NetOnNet __NEXT_DATA__ price.value)";
        }

        if (typeof price === "number" && price > 0) {
          result.priceValue = price;
          result.priceRaw = `${price} kr`;
          result.priceConfidence = 0.95;
        }

        // PREVIOUS PRICE (API)
        let prev =
          p.price?.previous?.value ||
          p.price?.oldPrice ||
          p.oldPrice?.value ||
          null;

        if (prev && result.priceValue && prev > result.priceValue) {
          result.previousPrice = prev;
          const diff = prev - result.priceValue;
          result.campaignInfo = `Tidigare pris ${prev} kr – spara ${diff} kr`;
        }

        // DESCRIPTION
        const desc =
          p.shortDescription ||
          p.description ||
          p.longDescription ||
          null;

        if (desc) {
          const cleaned = stripHtml(desc);
          result.description = cleaned.length > 500 ? cleaned.slice(0, 500) + "..." : cleaned;
        }

        // IMAGE
        const img =
          p.images?.[0]?.url ||
          p.images?.[0] ||
          p.mainImage ||
          null;

        if (img) {
          result.imageUrl = img.startsWith("http")
            ? img
            : "https://www.netonnet.se" + img;
        }

        // Continue to HTML lowest-price check before returning
      }
    }
  }

  // ============================================================
  // FIX A: HTML "lowestPrice"
  // ============================================================
  if (result.priceValue) {
    const lowest = extractLowestPriceHTML(html);
    if (lowest && lowest > result.priceValue) {
      result.previousPrice = lowest;
      const diff = lowest - result.priceValue;
      result.campaignInfo = `Tidigare pris ${lowest} kr – spara ${diff} kr`;
    }
  }

  // ============================================================
  // JSON-LD (backup)
  // ============================================================
  const jsonLdMatch = html.match(/application\/ld\+json[^>]*>([\s\S]*?)<\/script>/);
  if (jsonLdMatch && !result.priceValue) {
    const data = tryJson<any>(jsonLdMatch[1]);
    if (data) {
      const item = Array.isArray(data) ? data[0] : data;

      if (item.offers?.price) {
        const num = Number(item.offers.price);
        if (!isNaN(num)) {
          result.priceValue = num;
          result.priceRaw = `${num} kr`;
          result.priceContext = "(JSON-LD)";
          result.priceConfidence = 0.85;
        }
      }

      if (item.offers?.highPrice) {
        const prev = Number(item.offers.highPrice);
        if (prev > (result.priceValue || 0)) {
          result.previousPrice = prev;
          const diff = prev - (result.priceValue || 0);
          result.campaignInfo = `Tidigare pris ${prev} kr – spara ${diff} kr`;
        }
      }

      if (!result.description && item.description) {
        const cleaned = stripHtml(item.description);
        result.description = cleaned.slice(0, 500);
      }
    }
  }

  // ============================================================
  // TITLE / OG FALLBACKS
  // ============================================================
  if (!result.pageTitle) {
    const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (t) result.pageTitle = decodeEntities(t[1]);
  }

  if (!result.imageUrl) {
    const og = html.match(/property="og:image"[^>]+content="([^"]+)"/i);
    if (og) result.imageUrl = og[1];
  }

  // ============================================================
  // HTML PRICE PATTERN (last resort)
  // ============================================================
  if (!result.priceValue) {
    const priceRegex = /(\d[\d\s]{2,7})\s*kr/i;
    const m = html.match(priceRegex);
    if (m) {
      const num = Number(m[1].replace(/\s+/g, ""));
      if (!isNaN(num)) {
        result.priceValue = num;
        result.priceRaw = `${num} kr`;
        result.priceContext = "(HTML pattern fallback)";
        result.priceConfidence = 0.5;
      }
    }
  }

  // ============================================================
  // PREVIOUS PRICE FALLBACK (old format)
  // ============================================================
  if (!result.previousPrice && result.priceValue) {
    const prevRegex = /(tidigare|ord\.?pris|rek\.?pris)[^\d]{0,20}(\d[\d\s]+)/i;
    const match = html.match(prevRegex);
    if (match) {
      const prev = Number(match[2].replace(/\s+/g, ""));
      if (!isNaN(prev) && prev > result.priceValue) {
        result.previousPrice = prev;
        const diff = prev - result.priceValue;
        result.campaignInfo = `Tidigare pris ${prev} kr – spara ${diff} kr`;
      }
    }
  }

  return result;
}
