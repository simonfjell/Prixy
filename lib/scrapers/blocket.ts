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

export function blocketScraper(html: string, url: string): ScrapeResult {
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

  // Extract price from embedded JSON (Blocket uses data attributes)
  let priceRaw: string | null = null;
  let priceValue: number | null = null;
  let priceContext: string | null = null;
  let priceConfidence: number | null = null;

  // Look for price in JSON data - multiple patterns
  // Pattern 1: {"key":"price","value":["46000"]}
  const priceKeyValueMatch = html.match(/\{"key"\s*:\s*"price"\s*,\s*"value"\s*:\s*\["?(\d{3,})"?\]/);
  if (priceKeyValueMatch) {
    const num = Number(priceKeyValueMatch[1]);
    if (!Number.isNaN(num) && num > 500) {
      priceValue = num;
      priceRaw = `${num} kr`;
      priceContext = "(från JSON-data)";
      priceConfidence = 0.9;
    }
  }
  
  // Pattern 2: "price": 46000 (simpler JSON)
  if (!priceValue) {
    const priceSimpleMatch = html.match(/"price"\s*:\s*(\d{3,})[,\s}]/);
    if (priceSimpleMatch) {
      const num = Number(priceSimpleMatch[1]);
      if (!Number.isNaN(num) && num > 500) {
        priceValue = num;
        priceRaw = `${num} kr`;
        priceContext = "(från JSON-data)";
        priceConfidence = 0.9;
      }
    }
  }

  // Fallback: meta tags
  if (!priceValue) {
    const metaPriceMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:price|product:price:amount)["'][^>]+content=["']([^"']+)["'][^>]*>/i);
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

  // Extract description
  let description: string | null = null;

  // Try to extract from window.__staticRouterHydrationData JSON
  const jsonDataMatch = html.match(/window\.__staticRouterHydrationData\s*=\s*JSON\.parse\("(.+?)"\);/);
  if (jsonDataMatch) {
    try {
      // Unescape the JSON string
      const jsonStr = jsonDataMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      
      const data = JSON.parse(jsonStr);
      
      // Navigate to itemData.description
      const itemData = data?.loaderData?.["item-recommerce"]?.itemData;
      if (itemData?.description) {
        description = itemData.description
          .replace(/\\n\\n/g, " ")
          .replace(/\\n/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    } catch (e) {
      // Fall through to other methods
    }
  }

  // Fallback: try direct regex match for description field
  if (!description || description.length < 50) {
    const descJsonMatch = html.match(/"description"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
    if (descJsonMatch) {
      try {
        const parsed = JSON.parse('"' + descJsonMatch[1] + '"');
        description = parsed.replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
      } catch (e) {
        description = descJsonMatch[1].replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
      }
    }
  }

  // Fallback: Try expandable-section (mobility ads with full text in HTML)
  if (!description || description.length < 100) {
    const expandMatch = html.match(/data-testid="expandable-section"[^>]*>[\s\S]*?<div[^>]*class="[^"]*whitespace-pre-wrap[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (expandMatch) {
      description = stripHtml(expandMatch[1]).trim();
    }
  }

  // Fallback: Try og:description (usually truncated)
  if (!description || description.length < 20) {
    const ogDescMatch = html.match(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i
    );
    if (ogDescMatch) {
      description = decodeEntities(ogDescMatch[1]).trim();
    }
  }

  // Final fallback: meta description
  if (!description || description.length < 20) {
    const metaDescMatch = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i
    );
    if (metaDescMatch) {
      description = decodeEntities(metaDescMatch[1]).trim();
    }
  }

  // Extract structured vehicle data (year, mileage, make, model, etc.)
  const structuredData: string[] = [];
  
  // Try to extract condition from JSON first
  let conditionFound = false;
  if (jsonDataMatch) {
    try {
      const jsonStr = jsonDataMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      const data = JSON.parse(jsonStr);
      const extras = data?.loaderData?.["item-recommerce"]?.itemData?.extras;
      
      if (extras && Array.isArray(extras)) {
        const conditionExtra = extras.find((e: any) => e.id === "condition");
        if (conditionExtra?.value) {
          structuredData.push(`Skick: ${conditionExtra.value}`);
          conditionFound = true;
        }
      }
    } catch (e) {
      // Fall through to regex method
    }
  }
  
  // Fallback: Condition/Skick - pattern: {"id":"condition","label":"Skick","value":"Mycket bra skick - som ny"}
  if (!conditionFound) {
    const conditionMatch = html.match(/\{"id"\s*:\s*"condition"\s*,\s*"label"\s*:\s*"Skick"\s*,\s*"value"\s*:\s*"([^"]+)"/);
    if (conditionMatch) {
      structuredData.push(`Skick: ${conditionMatch[1]}`);
    }
  }
  
  // Year - pattern: {"key":"year","value":["2020"]}
  const yearMatch = html.match(/\{"key"\s*:\s*"year"\s*,\s*"value"\s*:\s*\["?(\d{4})"?\]/);
  if (yearMatch) structuredData.push(`Årsmodell: ${yearMatch[1]}`);
  
  // Mileage - pattern: {"key":"mileage","value":["500"]}
  const mileageMatch = html.match(/\{"key"\s*:\s*"mileage"\s*,\s*"value"\s*:\s*\["?(\d+)"?\]/);
  if (mileageMatch) structuredData.push(`Miltal: ${mileageMatch[1]} mil`);
  
  // Make and model - pattern: {"key":"make_text","value":["Sur Ron"]}
  const makeMatch = html.match(/\{"key"\s*:\s*"make_text"\s*,\s*"value"\s*:\s*\["([^"]+)"\]/);
  const modelMatch = html.match(/\{"key"\s*:\s*"model_text"\s*,\s*"value"\s*:\s*\["([^"]+)"\]/);
  if (makeMatch && modelMatch) {
    structuredData.push(`${makeMatch[1]} ${modelMatch[1]}`);
  }
  
  // Fuel type - pattern: {"key":"fuel","value":["4"]}
  const fuelMatch = html.match(/\{"key"\s*:\s*"fuel"\s*,\s*"value"\s*:\s*\["?(\d+)"?\]/);
  if (fuelMatch) {
    const fuelTypes: {[key: string]: string} = {
      "1": "Bensin", "2": "Diesel", "3": "Hybrid", "4": "El", 
      "5": "Etanol", "6": "Biogas", "7": "Gasol"
    };
    const fuelType = fuelTypes[fuelMatch[1]] || `Drivmedel: ${fuelMatch[1]}`;
    structuredData.push(fuelType);
  }
  
  // Registration number - pattern: {"key":"registration_number","value":["ZXF720"]}
  const regMatch = html.match(/\{"key"\s*:\s*"registration_number"\s*,\s*"value"\s*:\s*\["([^"]+)"\]/);
  if (regMatch) structuredData.push(`Reg.nr: ${regMatch[1]}`);

  // Prepend structured data to description
  if (structuredData.length > 0 && description) {
    description = structuredData.join(", ") + ". " + description;
  } else if (structuredData.length > 0) {
    description = structuredData.join(", ") + ".";
  }

  // If description is truncated ("..."), try to find full text in body
  if (description && description.endsWith("...")) {
    const bodyStart = html.indexOf("<body");
    const bodyHtml = bodyStart !== -1 ? html.slice(bodyStart, bodyStart + 15000) : html;
    
    // Look for description in common Blocket patterns
    const descPatterns = [
      /<div[^>]*class="[^"]*description[^"]*"[^>]*>([^<]+)/i,
      /<p[^>]*class="[^"]*ad-description[^"]*"[^>]*>([^<]+)/i,
    ];
    
    for (const pattern of descPatterns) {
      const match = bodyHtml.match(pattern);
      if (match && match[1] && match[1].length > description.length) {
        const fullDesc = decodeEntities(stripHtml(match[1])).trim();
        // Keep structured data, replace truncated part
        const structPart = structuredData.length > 0 ? structuredData.join(", ") + ". " : "";
        description = structPart + fullDesc;
        break;
      }
    }
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
    const keywords = ["skick", "mil", "reg", "service", "defekt", "original", "modifierad"];
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
  
  // Try og:image first (most reliable)
  const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if (ogImageMatch) {
    imageUrl = ogImageMatch[1];
  }
  
  // Fallback: look for images in JSON data
  if (!imageUrl) {
    const imageJsonMatch = html.match(/"images"\s*:\s*\[\s*\{\s*"uri"\s*:\s*"([^"]+)"/);
    if (imageJsonMatch) {
      imageUrl = imageJsonMatch[1];
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
    comparable_median: null, // No price comparables for single listings
  };
}
