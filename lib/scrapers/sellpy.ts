// Sellpy.se scraper with Algolia API integration

export interface SellpyProduct {
  objectID: string;
  createdAt: number;
  updatedAt: number;
  metadata: {
    brand: string;
    demography?: string;
    color?: string[];
    size?: string;
    type?: string;
    condition?: string;
    material?: string[];
    pattern?: string;
    neckline?: string;
    sleeveLength?: string;
    garmentLength?: string;
    fabric?: string;
    variantId?: string;
    productId?: string;
    defects?: Array<{
      type: string;
      location?: string;
      id: string;
    }>;
    measurement?: {
      waistInCm?: number;
      innerLegLengthInCm?: number;
      shoulderWidthInCm?: number;
      sleeveLengthInCm?: number;
      widthInCm?: number;
      heightInCm?: number;
      depthInCm?: number;
    };
  };
  images: string[];
  sizes: string[];
  categories: {
    lvl0: string[];
    lvl1: string[];
    lvl2: string[];
    lvl3?: string[];
  };
  keywords: string[];
  style: string[];
  pricing: {
    amount: number;
    currency: string;
  };
  isForSale: boolean;
  isReserved: boolean;
  saleStartedAt: number;
  price_SE: {
    amount: number;
    currency: string;
  };
}

export interface SellpySearchResponse {
  hits: SellpyProduct[];
  nbHits: number;
  page: number;
  nbPages: number;
  hitsPerPage: number;
  processingTimeMS: number;
}

export interface SellpySearchParams {
  query?: string;
  facetFilters?: string[][];
  facets?: string[];
  attributesToRetrieve?: string;
  page?: number;
  hitsPerPage?: number;
  filters?: string;
}

export type ScrapeResult = {
  sourceUrl: string;
  pageTitle?: string | null;
  priceRaw?: string | null;
  priceValue?: number | null;
  description?: string | null;
  imageUrl?: string | null;
  error?: string;
};

export class SellpyScraper {
  private readonly baseUrl = 'https://m6wnfr0lvi-dsn.algolia.net';
  private readonly applicationId = 'M6WNFR0LVI';
  private readonly apiKey = '313e09c3b00b6e2da5dbe382cd1c8f4b';
  private readonly index = 'prod_marketItem_se_saleStartedAt_desc';

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-algolia-application-id': this.applicationId,
      'x-algolia-api-key': this.apiKey,
      'x-algolia-agent': 'Algolia for JavaScript (4.24.0); Browser (lite)',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'application/json',
      'Origin': 'https://sellpy.se',
      'Referer': 'https://sellpy.se/',
    };
  }

  async searchProducts(params: SellpySearchParams = {}): Promise<SellpySearchResponse> {
    const url = `${this.baseUrl}/1/indexes/${this.index}/query`;
    
    const defaultParams: SellpySearchParams = {
      query: '',
      facets: ['metadata.brand'],
      attributesToRetrieve: '',
      page: 0,
      hitsPerPage: 20,
      ...params
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(defaultParams)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: SellpySearchResponse = await response.json();
      return data;
    } catch (error) {
      console.error('Error searching Sellpy products:', error);
      throw error;
    }
  }

  async getProductById(objectId: string): Promise<SellpyProduct | null> {
    const searchParams: SellpySearchParams = {
      query: '',
      filters: `objectID:"${objectId}"`,
      hitsPerPage: 1
    };

    try {
      const response = await this.searchProducts(searchParams);
      return response.hits.length > 0 ? response.hits[0] : null;
    } catch (error) {
      console.error('Error getting product by ID:', error);
      return null;
    }
  }

  async searchByBrand(brand: string): Promise<SellpyProduct[]> {
    const searchParams: SellpySearchParams = {
      query: '',
      facetFilters: [[`metadata.brand:${brand}`]],
      facets: ['metadata.brand'],
      attributesToRetrieve: ''
    };

    const response = await this.searchProducts(searchParams);
    return response.hits;
  }

  async searchByKeyword(keyword: string): Promise<SellpyProduct[]> {
    const searchParams: SellpySearchParams = {
      query: keyword,
      facets: ['metadata.brand'],
      attributesToRetrieve: ''
    };

    const response = await this.searchProducts(searchParams);
    return response.hits;
  }

  async getProductsByPriceRange(minPrice: number, maxPrice: number): Promise<SellpyProduct[]> {
    // Priser är i ören (100ths), så konvertera
    const minPriceOre = minPrice * 100;
    const maxPriceOre = maxPrice * 100;
    
    const searchParams: SellpySearchParams = {
      query: '',
      filters: `price_SE.amount >= ${minPriceOre} AND price_SE.amount <= ${maxPriceOre}`,
      attributesToRetrieve: ''
    };

    const response = await this.searchProducts(searchParams);
    return response.hits;
  }

  formatPrice(product: SellpyProduct): string {
    return `${product.pricing.amount} ${product.pricing.currency}`;
  }

  getProductUrl(product: SellpyProduct): string {
    return `https://sellpy.se/item/${product.objectID}`;
  }

  getProductTitle(product: SellpyProduct): string {
    const { metadata } = product;
    const parts = [];
    
    if (metadata.brand) parts.push(metadata.brand);
    if (metadata.type) parts.push(metadata.type);
    if (metadata.size) parts.push(`Storlek ${metadata.size}`);
    if (metadata.color && metadata.color.length > 0) parts.push(metadata.color.join(', '));
    
    return parts.join(' - ');
  }

  isGoodDeal(product: SellpyProduct, maxPrice: number): boolean {
    return product.pricing.amount <= maxPrice && product.isForSale && !product.isReserved;
  }
}

// Enhanced scraper function that gets detailed product information
export async function sellpyScraper(url: string): Promise<ScrapeResult> {
  try {
    // Extract item ID from URL (e.g., /item/DRexnxa5FE)
    const itemIdMatch = url.match(/\/item\/([^?&]+)/);
    if (!itemIdMatch) {
      return {
        sourceUrl: url,
        error: "Could not extract item ID from URL",
      };
    }

    const itemId = itemIdMatch[1];

    // First, try the original GraphQL approach for detailed product info
    const graphqlUrl = "https://sellpy-parse-prod.herokuapp.com/graphql?_=buyerPDPQuery";
    
    const query = `query buyerPDPQuery($itemId: ID!, $locale: String!) {
      item: getPdpItem(itemId: $itemId) {
        objectId
        headline
        localizedMetadata(locale: $locale)
        images {
          value
        }
        photos {
          value
        }
        metadata
        pricing {
          amount
          currency
        }
        isForSale
        condition
        defects
        description
        brand
        type
        size
        color
        material
        pattern
        fabric
        model
        demography
        garmentLength
        neckline
        sleeveLength
        measurement
      }
    }`;

    try {
      const graphqlResponse = await fetch(graphqlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "accept": "*/*",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "referer": "https://www.sellpy.se/",
          "origin": "https://www.sellpy.se",
          "x-parse-application-id": "3ebgwo1hPV0sk74fnWBTSW3RIxgw3b2ZAxM6qmCj",
        },
        body: JSON.stringify({
          operationName: "buyerPDPQuery",
          query,
          variables: { itemId, locale: "sv" }
        }),
      });

      if (graphqlResponse.ok) {
        const graphqlData = await graphqlResponse.json();
        const item = graphqlData.data?.item;

        if (item) {
          // Build comprehensive description from all available metadata
          const metadata = item.localizedMetadata || item.metadata || {};
          const brand = metadata.brand || item.brand || '';
          const type = metadata.type || item.type || '';
          const model = metadata.model || item.model || '';
          const size = metadata.size || item.size || '';
          const condition = metadata.condition || item.condition || '';
          const color = metadata.color || item.color || [];
          const material = metadata.material || item.material || [];
          const pattern = metadata.pattern || item.pattern || '';
          const fabric = metadata.fabric || item.fabric || '';
          const demography = metadata.demography || item.demography || '';
          const garmentLength = metadata.garmentLength || item.garmentLength || '';
          const neckline = metadata.neckline || item.neckline || '';
          const sleeveLength = metadata.sleeveLength || item.sleeveLength || '';
          const defects = item.defects || [];

          // Build CONCISE description - only essential info for AI analysis
          let description = '';
          
          // Essential brand/product info
          if (brand) description += `${brand}`;
          if (type) description += ` ${type}`;
          if (model) description += ` ${model}`;
          description += '.';
          
          // Critical assessment factors
          if (size) description += ` Storlek: ${size}.`;
          if (condition) description += ` Skick: ${condition}.`;
          
          // Important for value assessment
          if (defects && defects.length > 0) {
            const defectTexts = defects.map((d: any) => d.type || d).join(', ');
            description += ` Defekter: ${defectTexts}.`;
          }
          
          // Key material info for luxury brands
          if (material && material.length > 0) {
            const materialText = Array.isArray(material) ? material.join(', ') : material;
            description += ` Material: ${materialText}.`;
          }

          const pageTitle = item.headline || `${brand} ${type} ${model}`.trim();
          const imageUrl = item.images?.[0]?.value || item.photos?.[0]?.value?.url || null;
          
          // Try to get pricing from GraphQL first
          let priceRaw = null;
          let priceValue = null;
          
          if (item.pricing?.amount) {
            priceValue = item.pricing.amount;
            priceRaw = `${priceValue} ${item.pricing.currency || 'SEK'}`;
          }

          return {
            sourceUrl: url,
            pageTitle,
            priceRaw,
            priceValue,
            description: description.trim(),
            imageUrl,
          };
        }
      }
    } catch (graphqlError) {
      console.log('GraphQL failed, falling back to Algolia API');
    }

    // Fallback to Algolia API if GraphQL fails
    const scraper = new SellpyScraper();
    const product = await scraper.getProductById(itemId);
    
    if (!product) {
      return {
        sourceUrl: url,
        error: "Product not found",
      };
    }

    const pageTitle = scraper.getProductTitle(product);
    const priceRaw = scraper.formatPrice(product);
    const priceValue = product.pricing.amount;
    
    // Build CONCISE description from Algolia metadata - only essentials  
    const metadata = product.metadata;
    let description = '';
    
    // Core product info
    if (metadata.brand) description += `${metadata.brand}`;
    if (metadata.type) description += ` ${metadata.type}`;
    description += '.';
    
    // Critical for pricing analysis
    if (metadata.condition) description += ` Skick: ${metadata.condition}.`;
    
    // Size for clothes and shoes
    if (metadata.size) {
      description += ` Storlek: ${metadata.size}.`;
    } else if (product.sizes && product.sizes.length > 0 && product.sizes[0] !== 'NO SIZE') {
      description += ` Storlek: ${product.sizes[0]}.`;
    }
    
    // Important defects
    if (metadata.defects && metadata.defects.length > 0) {
      const defectTexts = metadata.defects.map(d => d.type).join(', ');
      description += ` Defekter: ${defectTexts}.`;
    }
    
    // Key details that affect value
    if (metadata.color && metadata.color.length > 0) {
      description += ` Färg: ${metadata.color.join(', ')}.`;
    }
    
    // Size/measurements for bags and accessories
    if (metadata.measurement) {
      const m = metadata.measurement;
      if (m.widthInCm || m.heightInCm) {
        description += ` Mått: ${m.widthInCm || '?'}x${m.heightInCm || '?'}cm.`;
      }
    }
    
    // Material for luxury assessment
    if (metadata.material && metadata.material.length > 0) {
      description += ` Material: ${metadata.material.join(', ')}.`;
    }
    
    // Key features from keywords that indicate quality/value
    if (product.keywords && product.keywords.length > 0) {
      const qualityKeywords = product.keywords.filter(k => 
        k.includes('läder') || k.includes('metall') || k.includes('justerbar') || 
        k.includes('original') || k.includes('vintage') || k.includes('designer')
      );
      if (qualityKeywords.length > 0) {
        description += ` Detaljer: ${qualityKeywords.slice(0, 3).join(', ')}.`;
      }
    }
    
    const imageUrl = product.images?.[0] || null;

    return {
      sourceUrl: url,
      pageTitle,
      priceRaw,
      priceValue,
      description: description.trim(),
      imageUrl,
    };
  } catch (error) {
    return {
      sourceUrl: url,
      error: `Scraper error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Helper function to check if URL is from Sellpy.se
export function isSellpyUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes("sellpy.se");
  } catch {
    return false;
  }
}