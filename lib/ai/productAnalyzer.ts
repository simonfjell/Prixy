import { Anthropic } from '@anthropic-ai/sdk';

interface ProductAnalysis {
  verdict: 'kap' | 'rimligt' | 'överpris' | 'oklart';
  confidence: number; // 0-1
  reasoning: string;
  estimatedFairPrice?: string;
  priceCategory: 'mycket_billigt' | 'billigt' | 'normalt' | 'dyrt' | 'mycket_dyrt';
}

interface ProductData {
  title: string;
  price: string;
  description?: string;
  condition?: string;
  brand?: string;
  category?: string;
  originalPrice?: string;
}

export class ProductAnalyzer {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({
      apiKey: apiKey,
    });
  }

  async analyzeProduct(productData: ProductData): Promise<ProductAnalysis> {
    const prompt = this.buildAnalysisPrompt(productData);

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        // Försök extrahera JSON från svaret
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        throw new Error('No JSON found in Claude response');
      }
      throw new Error('Unexpected response format');
    } catch (error) {
      console.error('Analysis error:', error);
      return {
        verdict: 'oklart',
        confidence: 0,
        reasoning: 'Kunde inte analysera produkten på grund av tekniskt fel',
        priceCategory: 'normalt'
      };
    }
  }

  private buildAnalysisPrompt(data: ProductData): string {
    // Försök avgöra om produkten är ny eller begagnad
      const productType = data.condition && /ny|o?anv[aä]nd|o?öppnad|mint/i.test(data.condition) ? "ny" : "begagnad";

      return `
  Du är Prixy, en AI som gör prisbedömningar med fokus på marknadsvärde, produktkategori, skick, modellår, generationer, specifikationer och historiska priser.

  ===== STEG 1 — FASTSTÄLL PRODUKTENS MARKNADSVÄRDE =====
  Analysera:
  - Produktkategori (t.ex. TV, samlarkort, verktyg, kläder, retrospel)
  - Skick (ny, som ny, begagnad i bra skick, slitet, defekt)
  - Modellår (t.ex. 2023, 2024, 2025)
  - Modellserie-historik (t.ex. LG OLED C1 → C2 → C3 → C4 → C5)
  - Nuvarande marknadspris för jämförbara produkter
  - Tidigare generationers verkliga prisfall
  - Data från beskrivning + produktnamn

  Beräkna ett “realistiskt marknadsvärde”-intervall (rimligt prisintervall).

  ===== STEG 2 — HANTERA FEJKADE REOR SÄRSKILT FÖR NYA PRODUKTER =====
  Regler för bluff-reor:
  1. Om produktens modellår är 2024 eller 2025 OCH “tidigare pris” endast kommer från butiken → anta att det är rekommenderat introduktionspris, inte verkligt marknadspris.
  2. Om tidigare pris är mer än 40% över ditt beräknade marknadsvärde → markera “Fejkad rea”.
  3. Om produkten är helt ny modell (t.ex. C5 2025, QN90D 2024):
     - använd föregående modells marknadspris som referens (ex: C4 65" låg normalt 16 000–19 000 efter kampanjer → C5 bör ligga liknande eller aningen högre).
     - ignorera butikers listpris helt.
  4. Om ”tidigare pris” är exakt samma hos flera butiker → det är listpris → behandla som potentiellt falskt.

  ===== STEG 3 — BESTÄM PRISKATEGORI =====
  Bedömningen ska ENDAST baseras på:
  - Ditt marknadsvärdesintervall
  - Produktens skick
  - Jämförelse mot angivet pris

  Regler:
  • Kap: Om priset ligger ≥25% under ditt rimliga intervall.
  • Rimligt: Om priset ligger inom ditt intervall (±10%).
  • Överpris: Om priset ligger >15% över ditt intervall.
  • Fejkad rea: Om tidigare pris är bluff enligt steg 2, även om nupriset är rimligt.

  ===== STEG 4 — SKAPA SLUTRAPPORT =====
  Svara i strukturen:
  {
    "verdict": "kap|rimligt|överpris|fejkad rea|oklart",
    "confidence": 0.85,
    "reasoning": "Kort förklaring på svenska varför",
    "estimatedFairPrice": "18000-20000kr",
    "priceCategory": "billigt|normalt|dyrt"
  }

  Produktdata:
  TITEL: ${data.title}
  PRIS: ${data.price}
  ${data.description ? `BESKRIVNING: ${data.description}` : ''}
  ${data.condition ? `SKICK: ${data.condition}` : ''}
  ${data.brand ? `MÄRKE: ${data.brand}` : ''}
  ${data.originalPrice ? `TIDIGARE PRIS: ${data.originalPrice}` : ''}

  Produkten är troligen: ${productType}.

  Undvik att överdriva. Var exakt och marknadsbaserad.
  `;
    }
  }


// Helper function for quick analysis
export async function analyzeProductQuick(
  productData: ProductData, 
  apiKey: string
): Promise<ProductAnalysis> {
  const analyzer = new ProductAnalyzer(apiKey);
  return analyzer.analyzeProduct(productData);
}