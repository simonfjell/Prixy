import { NextResponse } from "next/server";

type EvalRequest = {
  title?: string;
  description?: string | null;
  priceValue?: number | null;
  priceConfidence?: number | null;
  comparable_median?: number | null;
  url?: string;
  imageUrl?: string | null;
};

function sanitizeText(s?: string | null) {
  return (s || "").toLowerCase();
}

function containsAny(text: string, keywords: string[]) {
  return keywords.some((k) => text.includes(k));
}

export async function POST(req: Request) {
  try {
    const body: EvalRequest = await req.json();
    const { title, description, priceValue, priceConfidence, comparable_median, url, imageUrl } = body;

    const desc = sanitizeText(description);

    if (priceValue == null || Number.isNaN(priceValue)) {
      return NextResponse.json(
        {
          verdict: "okänd",
          confidence: 0.3,
          explanation: "Inget giltigt pris hittades i annonsen, kan inte ge en bedömning.",
        },
        { status: 200 }
      );
    }

    // Enkel heuristisk (fejk-)analys
    const goodKeywords = ["ny", "oanvänd", "nyskick", "mint", "oöppnad"];
    const badKeywords = ["sliten", "skadat", "defekt", "repor", "rensad"];

    let conditionFactor = 1;
    if (containsAny(desc, goodKeywords)) conditionFactor += 0.15;
    if (containsAny(desc, badKeywords)) conditionFactor -= 0.25;

    // Price-based scoring: compare against comparable_median if available
    let priceScore = 0; // positive => cheap, negative => expensive
    if (comparable_median && comparable_median > 0) {
      // Use comparable_median as reference (marknadsmedian från annonsen)
      const ratio = priceValue / comparable_median;
      if (ratio < 0.8) priceScore = 1; // 20% under median => cheap
      else if (ratio < 0.95) priceScore = 0.5;
      else if (ratio <= 1.05) priceScore = 0; // nära median => neutral
      else if (ratio < 1.2) priceScore = -0.5;
      else priceScore = -1; // 20% över median => expensive
    } else {
      // Fallback to fixed buckets if no comparable_median
      if (priceValue <= 1000) priceScore = 1;
      else if (priceValue <= 5000) priceScore = 0;
      else priceScore = -1;
    }

    const total = priceScore * 0.75 + (conditionFactor - 1) * 0.5;

    let verdict = "normalpris";
    if (total >= 1.0) verdict = "superbra deal";
    else if (total >= 0.4) verdict = "bra deal";
    else if (total <= -0.6) verdict = "röverpris";

    let confidence = Math.min(0.95, 0.45 + Math.abs(total) * 0.5);
    // Blend in priceConfidence from scraper (if provided) to reflect extraction certainty
    if (priceConfidence && typeof priceConfidence === "number") {
      confidence = Math.min(0.98, confidence * 0.6 + priceConfidence * 0.4);
    }
    confidence = Math.round(confidence * 100) / 100;

    let explanation = "Bedömningen baseras på enkla heuristiker (falsk AI).";

    if (verdict === "superbra deal" || verdict === "bra deal") {
      explanation = `Pris: ${priceValue} kr verkar lågt jämfört med jämförbara annonser. Beskrivningen indikerar ${containsAny(desc, goodKeywords) ? "bra skick" : "ingen tydlig indikator"}.`;
    } else if (verdict === "röverpris") {
      explanation = `Pris: ${priceValue} kr ligger i den högre delen. Beskrivningen visar ${containsAny(desc, badKeywords) ? "problem/skador" : "ingen uppenbar nedsättning"}.`;
    } else {
      explanation = `Pris: ${priceValue} kr verkar rimligt utifrån annonsens information. Beskrivningen indikerar ${containsAny(desc, goodKeywords) ? "bra skick" : containsAny(desc, badKeywords) ? "sämre skick" : "ingen tydlig skillnad"}.`;
    }

    return NextResponse.json(
      {
        verdict,
        confidence,
        explanation,
        source: url ?? null,
        priceValue,
        title: title ?? null,
        imageUrl: imageUrl ?? null,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Evaluate error:", err);
    return NextResponse.json({ error: "Internt fel i evaluate." }, { status: 500 });
  }
}
