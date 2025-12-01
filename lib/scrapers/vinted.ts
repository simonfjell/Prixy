
import type { ScrapeResult } from "./xxl";
function decodeEntities(str: string | null | undefined) {
  if (!str) return str ?? "";
  return str.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

export async function vintedScraper(html: string, url: string): Promise<ScrapeResult> {
  // ===== 0. Klipp bort "andra annonser" längre ner =====
  let mainHtml = html;
  // Vanliga markörer för "fler annonser" på Vinted
  const cutMarkers = [
    'Andra annonser från',
    'Liknande annonser',
    'Liknande produkter',
    'Upptäck fler fynd',
    'Mer från',
    'Du kanske också gillar',
    'data-testid="other-items"',
    'data-testid="item-list"',
    'data-testid="feed-grid"',
    'aria-label="Liknande annonser"',
    'aria-label="Andra annonser"',
    'aria-label="Liknande produkter"',
    'aria-label="Upptäck fler fynd"',
    'aria-label="Mer från"',
    'aria-label="Du kanske också gillar"',
    // Fallback: första förekomsten av ett nytt produktkort
    '<article',
  ];
  for (const marker of cutMarkers) {
    const idx = mainHtml.indexOf(marker);
    if (idx !== -1 && idx > 1000) { // undvik att klippa för tidigt
      mainHtml = mainHtml.slice(0, idx);
      break;
    }
  }
  // ===== 1. TITEL =====
  let pageTitle: string | null = null;
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (titleMatch && titleMatch[1]) {
    pageTitle = decodeEntities(titleMatch[1].trim());
  }

  // ===== 2. PRIS: Försök JSON-LD och structured data först =====
  let priceRaw: string | null = null;
  let priceValue: number | null = null;
  let priceContext: string | null = null;
  let priceConfidence: number | null = null;
  let altCandidates: Array<{ raw: string; value: number; context: string; score: number }> = [];

  // Först: Structured data (JSON-LD)
  try {
    const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      const jsonData = JSON.parse(jsonLdMatch[1]);
      const items = Array.isArray(jsonData) ? jsonData : [jsonData];
      for (const item of items) {
        if (item.offers && item.offers.price) {
          const price = item.offers.price;
          const num = Number(String(price).replace(/[^0-9.,]/g, "").replace(/,/g, "."));
          if (!Number.isNaN(num) && num > 0) {
            priceValue = num; // Direkt utan konvertering
            priceRaw = `${priceValue} kr`;
            priceContext = "(från JSON-LD)";
            priceConfidence = 0.95;
            break;
          }
        }
      }
    }
  } catch (e) {
    console.log('JSON-LD parsing failed:', e);
  }

  // Andra: Vinted-specifika data-testid selektorer
  if (!priceValue) {
    const priceSelectors = [
      /data-testid=["']item-price["'][^>]*>([^<]*\d+[^<]*kr)/i,
      /data-testid=["']price["'][^>]*>([^<]*\d+[^<]*kr)/i,
      /class=["'][^"']*price[^"']*["'][^>]*>([^<]*\d+[^<]*kr)/i
    ];
    
    for (const selector of priceSelectors) {
      const match = mainHtml.match(selector);
      if (match && match[1]) {
        const priceText = match[1];
        const digits = priceText.replace(/[^0-9.,]/g, "").replace(/,/g, ".");
        const num = Number(digits);
        if (!Number.isNaN(num) && num > 0) {
          priceValue = num; // Direkt utan konvertering
          priceRaw = `${priceValue} kr`;
          priceContext = "(från data-testid)";
          priceConfidence = 0.9;
          break;
        }
      }
    }
  }

  // Tredje: Fallback till begränsad HTML-sökning runt <h1>
  if (!priceValue) {
    // Hitta <h1> och ta bara 500 tecken efter (mycket mindre än förut)
    let priceSection = "";
    const h1Match = mainHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match && h1Match.index !== undefined) {
      priceSection = mainHtml.slice(h1Match.index, h1Match.index + 500); // Mycket mindre sektion
    }
    
    if (priceSection) {
      const found = findBestPriceCandidate(priceSection);
      altCandidates = found?.candidates ?? [];
      const selected = found?.best ?? null;
      
      // Debug: Logga alla kandidater till konsolen för felsökning
      console.log('Vinted price candidates:', altCandidates.map(c => `${c.raw} (${c.value}) score: ${c.score}`));
      
      if (selected && selected.value > 0 && selected.value < 100000) {
        priceRaw = cleanPriceRaw(selected.raw);
        priceValue = selected.value;
        priceContext = selected.context;
        priceConfidence = Math.min(1, Math.max(0, selected.score / 200));
      }
    }
  }

  function stripHtml(raw: string): string {
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Helper: Clean price string (remove HTML, whitespace, systemtext)
  function cleanPriceRaw(raw: string): string {
    let s = stripHtml(raw);
    s = s.replace(/[^0-9.,kr\s]/gi, "");
    s = s.replace(/\s+/g, " ").trim();
    // Remove systemtext/labels
    s = s.replace(/(inkl(uderar)?|avgift|proposition|försäkran|leverans|prisgaranti|value_proposition|cta_url|title:)[^0-9]*?/gi, "");
    // Remove trailing/leading non-digit
    s = s.replace(/^[^0-9]+|[^0-9kr]+$/gi, "");
    return s;
  }

  // Fallback regex-funktion för HTML-sökning
  function findBestPriceCandidate(htmlFragment: string) {
    // Regex för Vinted-priser: 40,00 kr, 150 kr, 999,50 kr (max 3+2 siffror)
    const re = /(?:[^0-9]|^)([0-9]{1,3}(?:[\s,][0-9]{1,2})?)[\s]*kr\b/gi;
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
      const cleanedRaw = cleanPriceRaw(raw);
      const digits = cleanedRaw.replace(/[^0-9,]/g, "").replace(/,/g, "");
      const val = Number(digits);
      if (Number.isNaN(val) || val < 1) continue;
      const idx = m.index;
      const start = Math.max(0, idx - 200);
      const end = Math.min(htmlFragment.length, idx + 200);
      const rawContext = decodeEntities(htmlFragment.slice(start, end));
      const context = stripHtml(rawContext);
      const ctxLower = context.toLowerCase();
      let score = 0;
      
      if (ctxLower.includes("köp nu")) score += 100;
      if (ctxLower.includes("pris") || ctxLower.includes("price")) score += 60;
      if (val < 1000) score += 50;
      if (val < 500) score += 30;
      if (val < 100) score += 20;
      if (val > 2000) score -= 100;
      if (val > 1000) score -= 50;
      if (ctxLower.includes("köparskydd")) score -= 50;
      if (ctxLower.includes("leverans")) score -= 30;
      if (ctxLower.includes("avgift")) score -= 100;
      
      score += Math.log10(Math.max(1, val));
      candidates.push({ raw: cleanedRaw, value: val, index: idx, context, score });
    }
    if (candidates.length === 0) return { candidates: [], best: null };
    candidates.sort((a, b) => b.score - a.score);
    return { candidates, best: candidates[0] };
  }

  // Final fallback om inget hittades
  if (!priceValue) {
    priceRaw = null;
    priceValue = null;
    priceContext = null;
    priceConfidence = 0;
  }

  // ===== 3. BESKRIVNING: Förbättrade strategier för Vinted =====
  let description: string | null = null;
  
  // Först: Leta efter produktbeskrivning i JSON-LD
  try {
    const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      const jsonData = JSON.parse(jsonLdMatch[1]);
      const items = Array.isArray(jsonData) ? jsonData : [jsonData];
      for (const item of items) {
        if (item.description && typeof item.description === 'string' && item.description.length > 10) {
          description = item.description.trim();
          break;
        }
      }
    }
  } catch (e) {}

  // Andra: <div data-testid="description">...</div>
  if (!description) {
    const descMatch = mainHtml.match(/<div[^>]*data-testid=["']description["'][^>]*>([\s\S]*?)<\/div>/i);
    if (descMatch && descMatch[1]) {
      description = decodeEntities(descMatch[1].replace(/<[^>]+>/g, "").trim());
    }
  }

  // Tredje: Leta efter beskrivning med specifika Vinted-selektorer
  if (!description || description.length < 20) {
    const descSelectors = [
      /class=["'][^"']*description[^"']*["'][^>]*>([^<]{20,})</i,
      /data-testid=["']item-description["'][^>]*>([^<]{20,})/i,
      /<p[^>]*>([^<]{30,}(?:leksak|bok|spel|condition|skick|pack|fresh|set)[^<]{10,})</i,
    ];
    
    for (const selector of descSelectors) {
      const match = mainHtml.match(selector);
      if (match && match[1]) {
        description = decodeEntities(match[1].trim());
        break;
      }
    }
  }

  // Fjärde: Fallback med förbättrad logik
  if (!description || description.length < 10) {
    // Ta första större textblock efter <h1> som INTE innehåller systemord
    let afterH1 = mainHtml.split(/<h1[^>]*>[\s\S]*?<\/h1>/i)[1] || mainHtml;
    let textBlocks = afterH1.replace(/<[^>]+>/g, '\n').split(/\n|\.|!|\?/).map(s => s.trim()).filter(s => s.length > 15);
    const badWords = ["proposition", "försäkran", "avgift", "valuta", "trygg", "prisgaranti", "system", "artikelpris", "value_proposition", "cta_url", "title:", "lägger regelbundet", "skickar snabbt", "medlem fick betyget", "uppladdare", "köparskydd"];
    if (textBlocks && textBlocks.length > 0) {
      const goodBlock = textBlocks.find(t => !badWords.some(bw => t.toLowerCase().includes(bw)) && t.length > 15);
      if (goodBlock) {
        description = decodeEntities(goodBlock);
      }
    }
  }

  // Femte: Om fortfarande ingen beskrivning, använd produktdetaljer från sidan
  if (!description || description.length < 10) {
    const productDetails = [];
    
    // Extrahera varumärke, skick, etc från Vinted-strukturen
    const brandMatch = mainHtml.match(/Varumärke[^<]*<[^>]*>([^<]+)</i);
    if (brandMatch && brandMatch[1].trim()) {
      productDetails.push(`Varumärke: ${brandMatch[1].trim()}`);
    }
    
    const conditionMatch = mainHtml.match(/Skick[^<]*<[^>]*>([^<]+)</i);
    if (conditionMatch && conditionMatch[1].trim()) {
      productDetails.push(`Skick: ${conditionMatch[1].trim()}`);
    }
    
    if (productDetails.length > 0) {
      description = productDetails.join(", ");
    }
  }

  // ===== 4. BILD =====
  let imageUrl: string | null = null;
  // Först: JSON-LD
  try {
    const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
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
    }
  } catch (e) {}
  // Fallback: og:image
  if (!imageUrl) {
    const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    if (ogImageMatch) {
      imageUrl = ogImageMatch[1];
    }
  }
  // Fallback: första .webp-länk i HTML
  if (!imageUrl) {
    const urlMatch = html.match(/https?:[^"'\s>]+\.webp/);
    if (urlMatch && urlMatch[0]) {
      imageUrl = urlMatch[0];
    }
  }

  // ===== 5. SKICK =====
  let condition: string | undefined = undefined;
  const condMatch = html.match(/<span[^>]*data-testid=["']item-conditions["'][^>]*>([^<]+)<\/span>/i);
  if (condMatch && condMatch[1]) {
    condition = decodeEntities(condMatch[1].trim().toLowerCase());
  }

  return {
    sourceUrl: url,
    pageTitle,
    priceRaw,
    priceValue,
    priceContext,
    priceConfidence,
    description,
    condition,
    imageUrl,
    comparable_median: null,
    altCandidates,
  };
}
