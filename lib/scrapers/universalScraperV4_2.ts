// ------------------------------------------------------------
// UNIVERSAL SCRAPER V4_2 — HYBRID + DEEP SCAN + PREVIOUS PRICE FIX
// ------------------------------------------------------------

export async function universalScraperV4_2(html: string, url: string) {
  try {
    const cleanedHtml = html.replace(/\s+/g, " ");

    // ------------------------------------------------------------
    // Helper: Robust price parser
    // ------------------------------------------------------------
    const parsePrice = (raw: string | null): number | null => {
      if (!raw) return null;
      let str = raw.toString().trim();
      str = str.replace(/[^\d.,]/g, "");

      if (str.includes(".") && str.includes(",")) {
        str = str.replace(/\./g, "").replace(/,/g, ".");
      }

      if (/^\d{1,3}\.\d{3}$/.test(str)) str = str.replace(/\./g, "");
      if (/^\d{1,3},\d{3}$/.test(str)) str = str.replace(/,/g, "");
      if (/,\d{2}$/.test(str)) str = str.replace(",", ".");

      const parts = str.split(".");
      if (parts.length > 2) str = parts.join("");

      const num = Number(str);
      return Number.isFinite(num) ? num : null;
    };

    // ------------------------------------------------------------
    // JSON-LD extraction
    // ------------------------------------------------------------
    let jsonLdPrice: number | null = null;
    let jsonLdPrev: number | null = null;
    let jsonLdTitle: string | null = null;
    let jsonLdImage: any = null;
    let jsonLdDesc: string | null = null;
    let jsonLdBrand: string | null = null;

    try {
      const ldMatches = cleanedHtml.match(
        /<script type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
      );
      if (ldMatches) {
        for (const block of ldMatches) {
          const jsonStr = block.replace(
            /<script[^>]*>|<\/script>/gi,
            ""
          );
          try {
            const data = JSON.parse(jsonStr);
            const product =
              Array.isArray(data)
                ? data.find((d: any) => d["@type"] === "Product")
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
                const arr = Array.isArray(product.offers)
                  ? product.offers
                  : [product.offers];
                const offer = arr.find(o => o.price) || arr[0];

                if (offer?.price) jsonLdPrice = parsePrice(offer.price);
                if (offer?.highPrice) jsonLdPrev = parsePrice(offer.highPrice);
              }
            }
          } catch {}
        }
      }
    } catch {}

    // ------------------------------------------------------------
    // OpenGraph / meta fallback
    // ------------------------------------------------------------
    const og = (prop: string) => {
      const m = cleanedHtml.match(
        new RegExp(`property=["']og:${prop}["'] content=["']([^"']+)["']`)
      );
      return m ? m[1] : null;
    };

    const ogTitle = og("title");
    const ogDesc = og("description");
    const ogImage = og("image");

    const meta = (name: string) => {
      const m = cleanedHtml.match(
        new RegExp(`name=["']${name}["'] content=["']([^"']+)["']`)
      );
      return m ? m[1] : null;
    };
    const metaDesc = meta("description");

    // ------------------------------------------------------------
    // Regex price extraction
    // ------------------------------------------------------------
    const currentRegex =
      /(pris|price)[^0-9]{0,20}(\d[\d\s.,]+)/i;
    let priceFromRegex: number | null = null;
    const pm = cleanedHtml.match(currentRegex);
    if (pm && pm[2]) priceFromRegex = parsePrice(pm[2]);

    // Previous price regex
    const previousPricePatterns = [
      /(ordinarie|ord\.?\s*pris)[^\d]{0,20}(\d[\d\s.,]+)/i,
      /(tidigare|före|förr)[^\d]{0,20}(\d[\d\s.,]+)/i,
      /(rek(ommenderat)?\.?\s*pris)[^\d]{0,20}(\d[\d\s.,]+)/i
    ];

    let previousFromRegex: number | null = null;
    for (const r of previousPricePatterns) {
      const m = cleanedHtml.match(r);
      if (m?.[2]) {
        previousFromRegex = parsePrice(m[2]);
        break;
      }
    }

    // ------------------------------------------------------------
    // Image fallback system
    // ------------------------------------------------------------
    let finalImg: any = null;

    if (jsonLdImage) {
      if (typeof jsonLdImage === "string") finalImg = jsonLdImage;
      else if (Array.isArray(jsonLdImage)) finalImg = jsonLdImage[0];
      else if (jsonLdImage?.url) finalImg = jsonLdImage.url;
    }

    if (!finalImg && ogImage) finalImg = ogImage;

    const imgCandidates: string[] = [];

    const imgSrc = cleanedHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgSrc) imgCandidates.push(imgSrc[1]);

    const dataSrc = cleanedHtml.match(/data-src=["']([^"']+)["']/i);
    if (dataSrc) imgCandidates.push(dataSrc[1]);

    const dataImg = cleanedHtml.match(/data-image=["']([^"']+)["']/i);
    if (dataImg) imgCandidates.push(dataImg[1]);

    const srcSet = cleanedHtml.match(/data-srcset=["']([^"']+)["']/i);
    if (srcSet) {
      const first = srcSet[1].split(",")[0].trim().split(" ")[0];
      imgCandidates.push(first);
    }

    // Generic deep scan
    const genericImg = cleanedHtml.match(/https[^"']+\.(jpg|jpeg|png|webp)/i);
    if (genericImg) imgCandidates.push(genericImg[0]);

    // Deep scan (multiple)
    const deepScan = [...cleanedHtml.matchAll(/https[^"' ]+\.(jpg|jpeg|png|webp)/gi)]
      .map(m => m[0])
      .filter(u =>
        !u.includes("logo") &&
        !u.includes("icon") &&
        !u.includes("placeholder") &&
        !u.includes("social")
      );

    if (!finalImg && deepScan.length > 0) {
      finalImg = deepScan.sort((a, b) => b.length - a.length)[0];
    }

    if (!finalImg && imgCandidates.length > 0) {
      finalImg = imgCandidates[0];
    }

    // Fix relative URL
    try {
      if (finalImg?.startsWith("/")) {
        const base = new URL(url);
        finalImg = base.origin + finalImg;
      }
    } catch {}

    // ------------------------------------------------------------
    // FINAL OUTPUT
    // ------------------------------------------------------------
    const finalPrice =
      jsonLdPrice ??
      priceFromRegex ??
      null;

    const finalPrevious =
      jsonLdPrev ??
      previousFromRegex ??
      null;

    const finalTitle =
      jsonLdTitle ??
      ogTitle ??
      null;

    const finalDesc =
      metaDesc ??
      jsonLdDesc ??
      ogDesc ??
      null;

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
      error: null
    };

  } catch (err: any) {
    return {
      sourceUrl: url,
      pageTitle: "Kunde inte tolka sidan",
      priceValue: null,
      description: null,
      imageUrl: null,
      error: String(err)
    };
  }
}
