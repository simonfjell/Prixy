// Modern Inet.se scraper - rebuilt with API expertise from webhallen_v2.ts

export type ScrapeResult = {
  sourceUrl: string;
  pageTitle?: string | null;
  priceRaw?: string | null;
  priceValue?: number | null;
  description?: string | null;
  imageUrl?: string | null;
  error?: string;
};

// Extract product data from various sources with priority order
function extractCompleteProductData(html: string, url: string): {
  title: string | null;
  price: number | null;
  priceRaw: string | null;
  description: string | null;
  imageUrl: string | null;
} {
  let title: string | null = null;
  let price: number | null = null;
  let priceRaw: string | null = null;
  let description: string | null = null;
  let imageUrl: string | null = null;

  try {
    // 1. Try JSON-LD structured data (highest priority)
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatches) {
      for (const match of jsonLdMatches) {
        try {
          const content = match.replace(/<script[^>]*>|<\/script>/g, '');
          const jsonLd = JSON.parse(content);
          
          if (jsonLd['@type'] === 'Product' || (jsonLd['@graph'] && jsonLd['@graph'].find((item: any) => item['@type'] === 'Product'))) {
            const product = jsonLd['@type'] === 'Product' ? jsonLd : jsonLd['@graph'].find((item: any) => item['@type'] === 'Product');
            
            if (product.name && !title) {
              title = product.name.trim();
            }
            
            if (product.offers) {
              const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
              if (offer.price && !price) {
                price = parseFloat(offer.price);
                priceRaw = offer.priceCurrency === 'SEK' ? `${price} kr` : `${price}`;
              }
            }
            
            if (product.description && !description) {
              description = product.description.trim();
            }
            
            if (product.image && !imageUrl) {
              imageUrl = Array.isArray(product.image) ? product.image[0] : product.image;
            }
          }
        } catch (jsonError) {
          // Continue to next JSON-LD block
        }
      }
    }

    // 2. Try meta tags and OpenGraph (medium priority)
    if (!title) {
      const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const metaTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
      title = ogTitle || metaTitle || null;
      if (title) title = title.trim().replace(/\s*\|\s*.*$/, ''); // Remove site name suffix
    }

    // 3. Try specific Inet selectors for price (medium-high priority)
    if (!price) {
      // Look for price patterns in HTML - multiple strategies
      const pricePatterns = [
        // Standard Inet price format: "1 490 kr"
        /(\d[\d\s]*)\s*kr/i,
        // Price in JSON-like structures
        /"price":\s*"?(\d+)"?/i,
        // Data attributes
        /data-price=["'](\d+)["']/i,
      ];

      for (const pattern of pricePatterns) {
        const match = html.match(pattern);
        if (match && match[1] && !price) {
          const cleaned = match[1].replace(/\s/g, '');
          const parsed = parseInt(cleaned, 10);
          if (!isNaN(parsed) && parsed > 0) {
            price = parsed;
            priceRaw = `${price} kr`;
            break;
          }
        }
      }
    }

    // 4. Extract description from various sources
    if (!description) {
      const ogDescription = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1];
      const metaDescription = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1];
      description = ogDescription || metaDescription || null;
      if (description) description = description.trim();
    }

    // 5. Extract image URL
    if (!imageUrl) {
      const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
      imageUrl = ogImage || null;
    }

  } catch (error) {
    // If extraction fails, continue with basic fallbacks
  }

  return { title, price, priceRaw, description, imageUrl };
}

export async function inetScraper(url: string): Promise<ScrapeResult> {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "accept-language": "sv-SE,sv;q=0.9,en;q=0.8",
        "accept-encoding": "gzip, deflate, br",
        "cache-control": "no-cache",
        "sec-ch-ua": '"Google Chrome";v="120", "Chromium";v="120", "Not:A-Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "upgrade-insecure-requests": "1",
      },
    });

    if (!response.ok) {
      return {
        sourceUrl: url,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const html = await response.text();

    // Use the comprehensive extraction function
    const extractedData = extractCompleteProductData(html, url);

    return {
      sourceUrl: url,
      pageTitle: extractedData.title,
      priceRaw: extractedData.priceRaw,
      priceValue: extractedData.price,
      description: extractedData.description,
      imageUrl: extractedData.imageUrl,
    };

  } catch (error) {
    return {
      sourceUrl: url,
      error: `Scraper error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Helper function to check if URL is from Inet.se
export function isInetUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes("inet.se");
  } catch {
    return false;
  }
}