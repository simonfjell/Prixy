// Simple test version of Inet scraper to isolate the error

export type ScrapeResult = {
  sourceUrl: string;
  pageTitle?: string | null;
  priceRaw?: string | null;
  priceValue?: number | null;
  description?: string | null;
  imageUrl?: string | null;
  error?: string;
};

export async function inetTestScraper(url: string): Promise<ScrapeResult> {
  try {
    console.log('=== INET TEST SCRAPER STARTING ===');
    console.log('URL:', url);

    // Add timeout and better error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "sv-SE,sv;q=0.9,en;q=0.8",
        "accept-encoding": "gzip, deflate, br",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "sec-ch-ua": '"Google Chrome";v="120", "Chromium";v="120", "Not:A-Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "referer": "https://www.google.com/",
      },
    });

    clearTimeout(timeoutId);
    console.log('Fetch response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      console.log('Response not OK, status:', response.status);
      const errorText = await response.text();
      console.log('Error response body (first 500 chars):', errorText.substring(0, 500));
      
      return {
        sourceUrl: url,
        error: `HTTP ${response.status}: ${response.statusText} - ${errorText.substring(0, 200)}`,
      };
    }

    const html = await response.text();
    console.log('HTML length:', html.length);
    console.log('HTML start (first 200 chars):', html.substring(0, 200));

    // Simple title extraction
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].trim() : null;
    console.log('Title found:', pageTitle);

    // Simple price extraction  
    const priceMatch = html.match(/(\d[\d\s]*)\s*kr/i);
    const priceValue = priceMatch ? parseInt(priceMatch[1].replace(/\s/g, ''), 10) : null;
    const priceRaw = priceValue ? `${priceValue} kr` : null;
    console.log('Price found:', priceRaw);

    console.log('=== INET TEST SCRAPER COMPLETE ===');

    return {
      sourceUrl: url,
      pageTitle,
      priceRaw,
      priceValue,
      description: 'TEST: Basic scraper working',
      imageUrl: null,
    };

  } catch (error) {
    console.error('=== INET TEST SCRAPER ERROR ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Full error:', error);
    
    return {
      sourceUrl: url,
      error: `Scraper error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}