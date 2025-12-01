// Power.se API scraper - uses their public API instead of HTML scraping

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
  previousPrice?: number | null;
  condition?: string;
};

export async function powerScraper(url: string): Promise<ScrapeResult> {
  try {
    // Extract product ID from URL (e.g., /p-4114990/)
    const productIdMatch = url.match(/\/p-(\d+)\//);
    if (!productIdMatch) {
      return {
        sourceUrl: url,
        error: "Could not extract product ID from URL",
      };
    }

    const productId = productIdMatch[1];
    const apiUrl = `https://www.power.se/api/v2/products?ids=${productId}&allowWebStatus8=true`;

    // Fetch from API
    const response = await fetch(apiUrl, {
      headers: {
        accept: "application/json",
        "accept-language": "sv-SE,sv;q=0.9",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      return {
        sourceUrl: url,
        error: `API request failed: ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();

    // API returns array of products
    if (!Array.isArray(data) || data.length === 0) {
      return {
        sourceUrl: url,
        error: "No product data in API response",
      };
    }

    const product = data[0];

    // Extract data from API response
    const pageTitle = product.title || product.productName || null;
    const priceValue = product.price || null;
    const priceRaw = priceValue ? `${priceValue} kr` : null;

    // Försök hitta "tidigare pris" (olika API-fält kan förekomma)
    let previousPrice: number | null = null;
    const prevFields = [
      'previousPrice', 'oldPrice', 'originalPrice', 'recommendedPrice', 'beforePrice', 'priceBefore', 'pricePrevious'
    ];
    for (const field of prevFields) {
      if (product[field] && typeof product[field] === 'number' && product[field] > 0) {
        previousPrice = product[field];
        break;
      }
    }

    // Build description from salesArguments and add any 'tidigare lägsta pris' found in all text fields
    let description: string | null = null;
    let extraPriceInfo: string[] = [];
    const textFields = [product.salesArguments, product.productDescription, product.longDescription, product.marketingText, product.additionalInfo];
    for (const field of textFields) {
      if (typeof field === 'string' && field.length > 0) {
        // Sök efter "tidigare lägsta pris" eller liknande
        const match = field.match(/tidigare\s*l[äa]gsta\s*pris[^\d]{0,20}(\d{2,6})/i);
        if (match && match[1]) {
          extraPriceInfo.push(`Tidigare lägsta pris: ${match[1]} kr`);
        }
        // Sök efter kampanjperiod
        const kampanj = field.match(/kampanj(en)?\s*g[äa]ller[^\d]{0,20}([\d\/-]+\s*-\s*[\d\/-]+)/i);
        if (kampanj && kampanj[2]) {
          extraPriceInfo.push(`Kampanjperiod: ${kampanj[2]}`);
        }
      }
    }
    if (product.salesArguments) {
      description = product.salesArguments.trim();
    } else if (product.productDescription) {
      description = product.productDescription.trim();
    }
    // Lägg till extra info om det finns
    if (extraPriceInfo.length > 0) {
      description = (description ? description + '\n' : '') + extraPriceInfo.join(' | ');
    }

    // Short description from first line
    let description_short: string | null = null;
    if (description) {
      const firstLine = description.split("\n")[0].trim();
      description_short = firstLine.length > 0 ? firstLine : null;
    }

    // Get image URL - handle both 'variants' and 'baseImages' arrays
    let imageUrl: string | null = null;
    if (product.productImage?.basePath) {
      // Try 'variants' array first (new API format)
      const variants = product.productImage.variants || [];
      if (variants.length > 0 && variants[0].filename) {
        imageUrl = `https://media.power-cdn.net${product.productImage.basePath}/${variants[0].filename}`;
      } else {
        // Fallback to 'baseImages' array (old API format)
        const baseImages = product.productImage.baseImages || [];
        if (baseImages.length > 0 && baseImages[0].filename) {
          imageUrl = `https://media.power-cdn.net${product.productImage.basePath}/${baseImages[0].filename}`;
        }
      }
    }

    return {
      sourceUrl: url,
      pageTitle,
      ogTitle: pageTitle, // Use same as pageTitle
      priceRaw,
      priceValue,
      priceContext: "(från Power.se API)",
      priceConfidence: 1.0, // API data is always accurate
      description,
      description_short,
      imageUrl,
      comparable_median: null,
      previousPrice,
      condition: 'ny',
    };
  } catch (error) {
    return {
      sourceUrl: url,
      error: `Scraper error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Helper function to check if URL is from Power.se
export function isPowerUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes("power.se");
  } catch {
    return false;
  }
}
