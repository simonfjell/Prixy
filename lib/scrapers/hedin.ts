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

export function hedinScraper(html: string, url: string): ScrapeResult {
  let pageTitle: string | null = null;
  let ogTitle: string | null = null;
  let priceRaw: string | null = null;
  let priceValue: number | null = null;
  let priceContext: string | null = null;
  let priceConfidence: number | null = null;
  let description: string | null = null;
  let imageUrl: string | null = null;

  // Extract title
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

  // Extract price from visible HTML (pattern: <span>129 000 kr</span>)
  const priceHtmlMatch = html.match(/<span[^>]*>(?:<span[^>]*><\/span>\s*<!--\s*-->)?(\d+(?:\s\d{3})*)\s*kr/);
  if (priceHtmlMatch) {
    const digits = priceHtmlMatch[1].replace(/\s/g, "");
    const num = Number(digits);
    if (!isNaN(num) && num > 1000) {
      priceValue = num;
      priceRaw = `${num} kr`;
      priceContext = "(från synligt pris)";
      priceConfidence = 0.95;
    }
  }

  // Fallback: JSON embedded price
  if (!priceValue) {
    const jsonPriceMatch = html.match(/"car_price_text"\s*:\s*"(\d+(?:\s\d{3})*)\s*kr"/);
    if (jsonPriceMatch) {
      const digits = jsonPriceMatch[1].replace(/\s/g, "");
      const num = Number(digits);
      if (!isNaN(num) && num > 1000) {
        priceValue = num;
        priceRaw = `${num} kr`;
        priceContext = "(från JSON-data)";
        priceConfidence = 0.9;
      }
    }
  }

  // Extract overview specs from visible HTML
  const specs: string[] = [];
  
  // Kaross
  const karossMatch = html.match(/<span class="text-text-secondary">Kaross<\/span><\/div><span class="font-semibold">([^<]+)<\/span>/);
  if (karossMatch) specs.push(`Kaross: ${karossMatch[1]}`);
  
  // Årsmodell
  const yearMatch = html.match(/<span class="text-text-secondary">Årsmodell<\/span><\/div><span class="font-semibold">([^<]+)<\/span>/);
  if (yearMatch) specs.push(`Årsmodell: ${yearMatch[1]}`);
  
  // Drivmedel
  const fuelMatch = html.match(/<span class="text-text-secondary">Drivmedel<\/span><\/div><span class="font-semibold">([^<]+)<\/span>/);
  if (fuelMatch) specs.push(`Drivmedel: ${fuelMatch[1]}`);
  
  // Miltal
  const mileageMatch = html.match(/<span class="text-text-secondary">Miltal<\/span><\/div><span class="font-semibold">([^<]+)<\/span>/);
  if (mileageMatch) specs.push(`Miltal: ${mileageMatch[1]}`);
  
  // Växellåda
  const transMatch = html.match(/<span class="text-text-secondary">Växellåda<\/span><\/div><span class="font-semibold">([^<]+)<\/span>/);
  if (transMatch) specs.push(`Växellåda: ${transMatch[1]}`);
  
  // 0-100
  const accelMatch = html.match(/<span class="text-text-secondary">0-100<\/span><\/div><span class="font-semibold">([^<]+)<\/span>/);
  if (accelMatch) specs.push(`0-100: ${accelMatch[1]}`);
  
  // Färg (from Teknisk data)
  const colorMatch = html.match(/<li class="items-between flex w-full justify-between">Färg<span class="font-semibold">([^<]+)<\/span>/);
  if (colorMatch) specs.push(`Färg: ${colorMatch[1]}`);
  
  // Skick
  const condMatch = html.match(/<li class="items-between flex w-full justify-between">Skick<span class="font-semibold">([^<]+)<\/span>/);
  if (condMatch) specs.push(`Skick: ${condMatch[1]}`);
  
  // Drivning
  const driveMatch = html.match(/<li class="items-between flex w-full justify-between">Drivning<span class="font-semibold">([^<]+)<\/span>/);
  if (driveMatch) specs.push(`Drivning: ${driveMatch[1]}`);
  
  // CO2
  const co2Match = html.match(/<li class="items-between flex w-full justify-between">Co2-utsläpp \(WLTP\)<span class="font-semibold">([^<]+)<\/span>/);
  if (co2Match) specs.push(`CO2: ${co2Match[1]}`);
  
  // Bränsleförbrukning
  const consMatch = html.match(/<li class="items-between flex w-full justify-between">Bränsleförbrukning: Blandad \(WLTP\)<span class="font-semibold">([^<]+)<\/span>/);
  if (consMatch) specs.push(`Förbrukning: ${consMatch[1]}`);

  // Extract description from "Övrig info" section
  const descMatch = html.match(/class="SampleRichText_sample-rte[^"]*"[^>]*><div>([\s\S]*?)<\/div>/);
  if (descMatch) {
    description = descMatch[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Fallback: og:description
  if (!description || description.length < 20) {
    const ogDescMatch = html.match(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i
    );
    if (ogDescMatch) {
      description = decodeEntities(ogDescMatch[1]).trim();
    }
  }

  // Build full description with specs first
  if (specs.length > 0) {
    const specsPart = specs.join(", ") + ".";
    description = description ? `${specsPart} ${description}` : specsPart;
  }

  // Cap at 800 chars
  if (description && description.length > 800) {
    description = description.slice(0, 800).trim() + "...";
  }

  // Generate short description
  let description_short: string | null = null;
  if (description) {
    const sentences = description.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
    description_short = sentences.slice(0, 2).join(". ");
    if (description_short && !description_short.endsWith(".")) {
      description_short += ".";
    }
  }

  // Extract image
  const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if (ogImageMatch) {
    imageUrl = ogImageMatch[1];
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
  };
}
