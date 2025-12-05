// ------------------------------------------------------------
// UNIVERSAL SCRAPER V4 — Production-Grade
// ------------------------------------------------------------

export async function universalScraperV4(html: string, url: string) {
  try {
    const cleanedHtml = html.replace(/\s+/g, " ");

    // ------------------------------------------------------------
    // Helper: Robust price parser for Swedish/international formats
    // Handles: "14990", "14 990", "14.990", "14,990", "14990 kr", etc
    // ------------------------------------------------------------
    const parsePrice = (raw: string | null): number | null => {
      if (!raw) return null;

      let str = raw.toString().trim();

      // Ta bort valuta, whitespace, ord
      str = str.replace(/[^\d.,]/g, "");

      // Fall: båda förekommer → "." är troligen tusental → ta bort punkter
      if (str.includes(".") && str.includes(",")) {
        str = str.replace(/\./g, "").replace(/,/g, ".");
      }

      // Fall: "14.990" eller "1.299" → punkt som tusental
      if (str.match(/^\d{1,3}\.\d{3}$/)) {
        str = str.replace(/\./g, "");
      }

      // Fall: "14,990" → comma tusental
      if (str.match(/^\d{1,3},\d{3}$/)) {
        str = str.replace(/,/g, "");
      }

      // Fall: decimal med komma → skapa korrekt decimalpunkt
      if (str.match(/,\d{2}$/)) {
        str = str.replace(",", ".");
      }

      // Ta bort allt utom siffror och EN eventuell decimalpunkt
      str = str.replace(/(?!^)-/g, "");
      const parts = str.split(".");
      if (parts.length > 2) {
        // för många punkter → tolka som tusentalsavskiljare
        str = parts.join("");
      }

      const num = Number(str);
      return Number.isFinite(num) ? num : null;
    };

    // ------------------------------------------------------------
    // 1. JSON-LD extraction
    // ------------------------------------------------------------
    let jsonLdPrice: number | null = null;
    let jsonLdImage: string | null = null;
    let jsonLdBrand: string | null = null;
    let jsonLdDesc: string | null = null;
    let jsonLdTitle: string | null = null;
    let jsonLdPrevious: number | null = null;

    try {
      const ldMatches = cleanedHtml.match(
        /<script type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
      );

      if (ldMatches) {
        for (let block of ldMatches) {
          const jsonStr = block.replace(
            /<script type=["']application\/ld\+json["'][^>]*>|<\/script>/gi,
            ""
          );

          try {
            const data = JSON.parse(jsonStr);

            const product =
              Array.isArray(data)
                ? data.find((d) => d["@type"] === "Product")
                : data["@type"] === "Product"
                ? data
                : null;

            if (product) {
              jsonLdTitle = product.name || null;
              jsonLdImage = product.image || null;
              jsonLdDesc = product.description || null;
              jsonLdBrand =
                product.brand?.name || product.brand || null;

              if (product.offers) {
                jsonLdPrice = parsePrice(product.offers.price);

                if (product.offers.highPrice && product.offers.lowPrice) {
                  jsonLdPrevious = parsePrice(product.offers.highPrice);
                }
              }
            }
          } catch {}
        }
      }
    } catch {}

    // ------------------------------------------------------------
    // 2. OpenGraph (og:) fallback
    // ------------------------------------------------------------
    const og = (prop: string) => {
      const m = cleanedHtml.match(
        new RegExp(`property=["']og:${prop}["'] content=["']([^"']+)["']`)
      );
      return m ? m[1] : null;
    };

    const ogTitle = og("title");
    const ogDesc = og("description");
    const ogImg = og("image");

    // ------------------------------------------------------------
    // Bild-fallback: fånga src, data-src, data-srcset
    // ------------------------------------------------------------
    const imgSrcMatch =
      cleanedHtml.match(/<img[^>]+src=["']([^"']+)["']/i);

    const imgDataSrcMatch =
      cleanedHtml.match(/<img[^>]+data-src=["']([^"']+)["']/i);

    const imgDataSrcSetMatch =
      cleanedHtml.match(/<img[^>]+data-srcset=["']([^"']+)["']/i);

    // ------------------------------------------------------------
    // 3. Meta description/title fallback
    // ------------------------------------------------------------
    const meta = (name: string) => {
      const m = cleanedHtml.match(
        new RegExp(`name=["']${name}["'] content=["']([^"']+)["']`)
      );
      return m ? m[1] : null;
    };

    const metaDesc = meta("description");

    // ------------------------------------------------------------
    // 4. Regex price extraction from HTML
    // ------------------------------------------------------------
    const priceRegex =
      /(pris|price|total|summa|belopp)[^0-9]{0,20}(\d[\d\s.,]+)/i;

    let priceFromRegex: number | null = null;
    const pr = cleanedHtml.match(priceRegex);
    if (pr && pr[2]) {
      priceFromRegex = parsePrice(pr[2]);
    }

    // ------------------------------------------------------------
    // Regex för tidigare pris (rea-bluff detektion)
    // ------------------------------------------------------------
    const prevPriceRegex =
      /(ordinarie|ursprungligt|tidigare|före|ord\.?\s*pris)[^0-9]{0,20}(\d[\d\s.,]+)/i;

    let previousFromRegex: number | null = null;
    const ppr = cleanedHtml.match(prevPriceRegex);
    if (ppr && ppr[2]) {
      previousFromRegex = parsePrice(ppr[2]);
    }

    // ------------------------------------------------------------
    // 5. Build final output (prio order: JSON-LD → regex → fallback)
    // ------------------------------------------------------------
    const finalPrice =
      jsonLdPrice ??
      priceFromRegex ??
      null;

    const finalPrevious =
      jsonLdPrevious ??
      previousFromRegex ??
      null;

    const finalTitle =
      jsonLdTitle ??
      ogTitle ??
      null;

    const finalDesc =
      jsonLdDesc ??
      metaDesc ??
      ogDesc ??
      null;

    const finalImg =
      jsonLdImage ??
      ogImg ??
      (imgSrcMatch ? imgSrcMatch[1] : null) ??
      (imgDataSrcMatch ? imgDataSrcMatch[1] : null) ??
      (imgDataSrcSetMatch ? imgDataSrcSetMatch[1].split(" ")[0] : null);

    return {
      sourceUrl: url,
      pageTitle: finalTitle,
      priceValue: finalPrice,
      priceRaw: finalPrice ? `${finalPrice} kr` : null,
      description: finalDesc,
      imageUrl: finalImg,
      brand: jsonLdBrand,
      previousPrice: finalPrevious,
      condition: "okänd",
      campaignInfo: null,
      error: null,
    };
  } catch (err) {
    return {
      sourceUrl: url,
      pageTitle: "Kunde inte tolka sidan",
      priceValue: null,
      description: null,
      imageUrl: null,
      error: String(err),
    };
  }
}
