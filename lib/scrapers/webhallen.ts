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

export async function webhallenScraper(url: string): Promise<ScrapeResult> {
  try {
    // Webhallen = API-first approach (som Power)
    console.log('Webhallen scraper starting for:', url);
    
    // Hämta sidan med user-agent
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "sv-SE,sv;q=0.8,en;q=0.6",
      },
    });

    if (!response.ok) {
      return {
        sourceUrl: url,
        error: `HTTP ${response.status}: Kunde inte hämta Webhallen-sidan`,
      };
    }

    const html = await response.text();

    // Webhallen säljer alltid nya produkter
    const condition = 'ny';
    let previousPrice: number | null = null;
    let campaignInfo: string | null = null;

    // ===== 1. TITEL =====
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

    // ===== 2. PRIS: Försök strukturerad data först =====
    let priceRaw: string | null = null;
    let priceValue: number | null = null;
    let priceContext: string | null = null;
    let priceConfidence: number | null = null;

    console.log('Webhallen HTML length:', html.length);
    console.log('Webhallen title found:', pageTitle);
    
    // STRATEGI 1: JSON-LD strukturerad data (högsta prioritet)
    try {
      const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
      for (const match of jsonLdMatches) {
        try {
          const jsonData = JSON.parse(match[1]);
          const items = Array.isArray(jsonData) ? jsonData : [jsonData];
          
          for (const item of items) {
            // Standard JSON-LD pris-fält
            if (item.offers) {
              const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
              for (const offer of offers) {
                if (offer.price && !isNaN(Number(offer.price))) {
                  priceValue = Number(offer.price);
                  priceRaw = `${priceValue} kr`;
                  priceContext = "(från JSON-LD offers)";
                  priceConfidence = 0.95;
                  console.log('Found structured price:', priceValue);
                  break;
                }
              }
              if (priceValue) break;
            }
            
            // Direkta pris-fält
            if (!priceValue && item.price && !isNaN(Number(item.price))) {
              priceValue = Number(item.price);
              priceRaw = `${priceValue} kr`;
              priceContext = "(från JSON-LD price)";
              priceConfidence = 0.9;
              console.log('Found direct structured price:', priceValue);
              break;
            }
          }
          if (priceValue) break;
        } catch (e) {
          console.log('JSON-LD parse failed for chunk:', e);
        }
      }
    } catch (e) {
      console.log('JSON-LD matching failed:', e);
    }
    
    // STRATEGI 2: Meta tags för pris (backup)
    if (!priceValue) {
      const metaPricePatterns = [
        /<meta[^>]+(?:property|name)=["'](?:product:price:amount|price)["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
        /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:product:price:amount|price)["'][^>]*>/gi
      ];
      
      for (const pattern of metaPricePatterns) {
        const metaMatch = html.match(pattern);
        if (metaMatch) {
          const digits = metaMatch[1].replace(/[^0-9]/g, "");
          const num = Number(digits);
          if (!isNaN(num) && num > 0) {
            priceValue = num;
            priceRaw = `${num} kr`;
            priceContext = "(från meta tag)";
            priceConfidence = 0.8;
            console.log('Found meta price:', priceValue);
            break;
          }
        }
      }
    }
        console.log('Found products array data');
        try {
          const productsStr = `[${productsMatch[1]}]`;
          const products = JSON.parse(productsStr);
          if (products && products.length > 0) {
            const product = products[0];
            console.log('Product from JSON:', Object.keys(product));
            
            if (product.price) {
              priceValue = Number(product.price);
              priceRaw = `${priceValue} kr`;
              priceContext = "(från products JSON)";
              priceConfidence = 0.95;
              console.log('Found price in products JSON:', priceValue);
            }
          }
        } catch (e) {
          console.log('Failed to parse products JSON:', e);
        }
      }
      
      // 2. Leta efter enskilda JSON objekt med produktdata
      if (!priceValue) {
        const jsonObjectPatterns = [
          /"name":\s*"[^"]*"[^}]*"price":\s*(\d+)/g,
          /"price":\s*(\d+)[^}]*"name":\s*"[^"]*"/g,
          /"currentPrice":\s*(\d+)/g,
          /"regularPrice":\s*(\d+)/g
        ];
        
        for (const pattern of jsonObjectPatterns) {
          const matches = [...html.matchAll(pattern)];
          if (matches.length > 0) {
            console.log(`Found ${matches.length} price matches with pattern`);
            for (const match of matches) {
              const price = Number(match[1]);
              if (price > 1000 && price < 100000) { // TV-priser är höga
                priceValue = price;
                priceRaw = `${price} kr`;
                priceContext = "(från JSON object)";
                priceConfidence = 0.9;
                console.log('Found reasonable TV price:', price);
                break;
              }
            }
            if (priceValue) break;
          }
        }
      }
      
      // 3. Leta efter base64 eller encoded data som kan innehålla pris
      if (!priceValue) {
        const encodedDataMatches = html.matchAll(/"data":\s*"([A-Za-z0-9+/=]{100,})"/g);
        let encodedCount = 0;
        for (const match of encodedDataMatches) {
          encodedCount++;
          if (encodedCount > 3) break; // Begränsa antal försök
          
          try {
            // Försök dekoda base64 och leta efter pris
            const decoded = atob(match[1]);
            const priceInDecoded = decoded.match(/(\d{4,6})/g);
            if (priceInDecoded) {
              for (const priceStr of priceInDecoded) {
                const price = Number(priceStr);
                if (price > 0) { // Acceptera alla positiva priser
                  priceValue = price;
                  priceRaw = `${price} kr`;
                  priceContext = "(från encoded data)";
                  priceConfidence = 0.8;
                  console.log('Found price in encoded data:', price);
                  break;
                }
              }
            }
          } catch (e) {
            // Inte base64, försök ändå hitta siffror
            const numberMatches = match[1].match(/(\d{4,6})/g);
            if (numberMatches) {
              for (const numStr of numberMatches) {
                const price = Number(numStr);
                if (price > 0) {
                  priceValue = price;
                  priceRaw = `${price} kr`;
                  priceContext = "(från data string)";
                  priceConfidence = 0.7;
                  console.log('Found price in data string:', price);
                  break;
                }
              }
            }
          }
          if (priceValue) break;
        }
      }
    } catch (e) {
      console.log('Enhanced JSON search failed:', e);
    }
    
    // Befintlig JSON-LD och script-sökning som backup...

    // Först: JSON-LD structured data
    try {
      const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
      for (const match of jsonLdMatches) {
        try {
          const jsonData = JSON.parse(match[1]);
          const items = Array.isArray(jsonData) ? jsonData : [jsonData];
          for (const item of items) {
            if (item.offers && item.offers.price) {
              const price = item.offers.price;
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
          if (priceValue) break;
        } catch (e) {
          console.log('JSON-LD parse failed for chunk:', e);
        }
      }
    } catch (e) {
      console.log('JSON-LD matching failed:', e);
    }

    // Andra: Mycket bredare sök efter pris i hela HTML (förbättrat för TV-priser)
    if (!priceValue) {
      console.log('Searching HTML for prices...');
      const pricePatterns = [
        // Specifika pris-patterns först (högst confidence)
        /(\d{1,8})\s*kr/gi,
        /kr\s*(\d{1,8})/gi,
        /(\d{1,8})\s*kronor/gi,
        /pris[^0-9]*(\d{1,8})/gi,
        // JSON patterns
        /"(?:price|currentPrice|regularPrice|finalPrice)"[^}]*?(\d{1,8})/gi,
        /"price"[^}]*?"value"[^}]*?(\d{1,8})/gi,
        // Webhallen-specifika
        /data-price[^>]*?['"](\d{1,8})/gi,
        /class[^>]*price[^>]*>[^<]*(\d{1,8})[^<]*kr/gi,
        // Bred sökning som backup
        /\b(\d{2,8})\b/gi,
      ];
      
      let allMatches: Array<{value: number, context: string, pattern: string}> = [];
      
      for (let i = 0; i < pricePatterns.length; i++) {
        const pattern = pricePatterns[i];
        let match;
        while ((match = pattern.exec(html)) !== null) {
          const num = Number(match[1]);
          if (!Number.isNaN(num) && num >= 1) { // Acceptera alla positiva priser
            const start = Math.max(0, match.index - 150);
            const end = Math.min(html.length, match.index + 150);
            const context = html.slice(start, end).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            
            // Undvik uppenbart felaktiga nummer (artikelnummer, etc)
            const lowerContext = context.toLowerCase();
            if (!lowerContext.match(/(?:model|artikel|produkt|id|code|nummer|sku|art\.nr)[^0-9]*\d/i) &&
                !lowerContext.match(/\b(?:version|v\d|\d+gb|\d+mb|\d{4}-\d{2})\b/i)) {
              allMatches.push({value: num, context, pattern: `pattern_${i}`});
            }
          }
        }
        pattern.lastIndex = 0; // Reset regex
      }
      
      console.log(`Found ${allMatches.length} potential price matches`);
      
      if (allMatches.length > 0) {
        // Extrahera nyckelord från produkttitel för smartare filtrering
        const titleKeywords = (pageTitle || '').toLowerCase()
          .split(/[\s\-_|:,]+/)
          .filter(word => word.length > 2)
          .filter(word => !['webhallen', 'köp', 'från', 'och', 'med', 'för', 'till'].includes(word));
        
        console.log('Title keywords for price filtering:', titleKeywords);
        
        // Generisk prioritering av priser baserat på kontext OCH titel-relevans
        const realisticPrices = allMatches.filter(m => 
          m.value >= 1 && m.value <= 1000000 && // Acceptera alla rimliga priser
          !m.context.toLowerCase().includes('artikel') &&
          !m.context.toLowerCase().includes('model') &&
          !/\b\d{6,}\b/.test(m.context) && // Undvik långa nummer som kan vara ID:n
          // Filtrera bort priser från helt andra produkter
          !m.context.toLowerCase().match(/\b(digital|slim|pro|edition|bundle|pack)\b.*\d+\s*kr/i) ||
          titleKeywords.some(keyword => m.context.toLowerCase().includes(keyword))
        );
        
        console.log(`Filtered to ${realisticPrices.length} realistic prices from ${allMatches.length} total`);
        
        if (realisticPrices.length > 0) {
          // Prioritera priser som förekommer nära "pris" eller "price" OCH titel-nyckelord
          const sortedPrices = realisticPrices.sort((a, b) => {
            const getTitleRelevance = (context: string) => {
              return titleKeywords.reduce((score, keyword) => {
                return score + (context.toLowerCase().includes(keyword) ? 15 : 0);
              }, 0);
            };
            
            const aScore = (a.context.toLowerCase().includes('pris') ? 10 : 0) +
                          (a.context.toLowerCase().includes('price') ? 10 : 0) +
                          (a.context.toLowerCase().includes('kr') ? 5 : 0) +
                          (a.pattern.startsWith('pattern_0') ? 20 : 0) + // Prioritera specifika patterns
                          getTitleRelevance(a.context);
            const bScore = (b.context.toLowerCase().includes('pris') ? 10 : 0) +
                          (b.context.toLowerCase().includes('price') ? 10 : 0) +
                          (b.context.toLowerCase().includes('kr') ? 5 : 0) +
                          (b.pattern.startsWith('pattern_0') ? 20 : 0) +
                          getTitleRelevance(b.context);
            
            return bScore - aScore; // Högst score först
          });
          
          const selectedMatch = sortedPrices[0];
          priceValue = selectedMatch.value;
          priceRaw = `${priceValue} kr`;
          priceContext = `(${selectedMatch.pattern}: ${selectedMatch.context.slice(0, 50)}...)`;
          priceConfidence = 0.8;
          
          console.log('Selected realistic price:', {
            price: priceValue,
            context: selectedMatch.context.slice(0, 100),
            titleRelevant: titleKeywords.some(k => selectedMatch.context.toLowerCase().includes(k)),
            allFound: allMatches.map(m => `${m.value}kr (${m.context.slice(0, 30)})`).slice(0, 5)
          });
        } else {
          console.log('No realistic prices found after filtering. All matches:', 
            allMatches.map(m => `${m.value} kr`).slice(0, 10));
        }
      }
    }

    // Tredje: Sök efter tidigare pris / kampanj
    if (priceValue) {
      const prevPricePatterns = [
        /(?:tidigare|before|var|ordinarie|rek\.?\s*pris).{0,50}(\d{1,6})/gi,
        /(\d{1,6})[^\d]*(?:tidigare|before|var|ordinarie)/gi,
      ];
      
      for (const pattern of prevPricePatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          const num = Number(match[1]);
          if (!Number.isNaN(num) && num > priceValue) {
            previousPrice = num;
            const saving = previousPrice - priceValue;
            campaignInfo = `Ordinariepris: ${previousPrice} kr, spara ${saving} kr`;
            break;
          }
        }
      }
    }

    // ===== 3. BESKRIVNING: Webhallen produktinfo =====
    let description: string | null = null;
    
    // Först: JSON-LD description
    try {
      const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
      if (jsonLdMatch) {
        const jsonData = JSON.parse(jsonLdMatch[1]);
        const items = Array.isArray(jsonData) ? jsonData : [jsonData];
        for (const item of items) {
          if (item.description && typeof item.description === 'string' && item.description.length > 20) {
            description = item.description.trim();
            break;
          }
        }
      }
    } catch (e) {}

    // Andra: Webhallen-specifika beskrivningsselektorer
    if (!description || description.length < 20) {
      const descPatterns = [
        /<div[^>]*class=["'][^"']*description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class=["'][^"']*product-info[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
        /<section[^>]*class=["'][^"']*product-description[^"']*["'][^>]*>([\s\S]*?)<\/section>/i,
      ];
      
      for (const pattern of descPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          const cleaned = stripHtml(match[1]).trim();
          if (cleaned.length > 20) {
            description = cleaned.slice(0, 800);
            break;
          }
        }
      }
    }

    // Lägg till kampanjinfo i description om det finns
    if (campaignInfo) {
      description = description ? `${description}\n${campaignInfo}` : campaignInfo;
    }

    // ===== 4. BILD =====
    let imageUrl: string | null = null;
    
    // JSON-LD image först
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

    return {
      sourceUrl: url,
      pageTitle,
      ogTitle,
      priceRaw,
      priceValue,
      priceContext,
      priceConfidence,
      description,
      imageUrl,
      comparable_median: null,
      previousPrice,
      campaignInfo,
      condition,
    };

  } catch (error) {
    console.error('Webhallen scraper error:', error);
    return {
      sourceUrl: url,
      error: `Fel vid scraping av Webhallen: ${error}`,
    };
  }
}