/**
 * Price Monitoring Providers
 *
 * Providers for fetching product prices from various retailers.
 */

import { BaseSavingsProvider, SavingsProviderError } from './base.js';

/**
 * Product price data
 */
export interface ProductPrice {
  url: string;
  name: string;
  price: number;
  originalPrice?: number;
  currency: string;
  inStock: boolean;
  seller?: string;
  lastChecked: number;
  metadata?: Record<string, unknown>;
}

/**
 * Price check result
 */
export interface PriceCheckResult {
  success: boolean;
  price?: ProductPrice;
  error?: string;
}

/**
 * Base price monitoring provider
 */
export abstract class PriceMonitoringProvider extends BaseSavingsProvider {
  abstract checkPrice(url: string): Promise<PriceCheckResult>;
  abstract getSupportedDomains(): string[];

  /**
   * Fetch raw HTML response (for price scraping)
   */
  protected async fetchRaw(url: string): Promise<Response> {
    const timeout = this.config.timeout ?? 10000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PriceMonitor/1.0)',
        },
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}

/**
 * Generic price monitoring provider using meta tags and structured data
 */
export class GenericPriceProvider extends PriceMonitoringProvider {
  readonly name = 'generic-price';
  readonly version = '1.0.0';

  get type(): string {
    return 'price-monitoring';
  }

  constructor() {
    super({ name: 'generic-price' });
  }

  getSupportedDomains(): string[] {
    return ['*']; // Supports any domain
  }

  async checkPrice(url: string): Promise<PriceCheckResult> {
    try {
      const response = await this.fetchRaw(url);
      const html = await response.text();

      // Try to extract price from structured data (JSON-LD)
      const jsonLdPrice = this.extractJsonLdPrice(html);
      if (jsonLdPrice) {
        return { success: true, price: jsonLdPrice };
      }

      // Try to extract from Open Graph meta tags
      const ogPrice = this.extractOpenGraphPrice(html, url);
      if (ogPrice) {
        return { success: true, price: ogPrice };
      }

      // Try common price patterns
      const patternPrice = this.extractPriceFromPatterns(html, url);
      if (patternPrice) {
        return { success: true, price: patternPrice };
      }

      return {
        success: false,
        error: 'Could not find price information on page',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private extractJsonLdPrice(html: string): ProductPrice | null {
    const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let match;

    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        const product = this.findProductInJsonLd(data);

        if (product) {
          const price = this.extractPriceFromProduct(product);
          if (price !== null) {
            const offers = product.offers as Record<string, unknown> | undefined;
            const seller = offers?.seller as Record<string, unknown> | undefined;
            return {
              url: typeof product.url === 'string' ? product.url : '',
              name: typeof product.name === 'string' ? product.name : 'Unknown Product',
              price,
              originalPrice: this.extractOriginalPrice(product),
              currency: typeof offers?.priceCurrency === 'string' ? offers.priceCurrency : 'USD',
              inStock: this.extractAvailability(product),
              seller: typeof seller?.name === 'string' ? seller.name : undefined,
              lastChecked: Date.now(),
            };
          }
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private findProductInJsonLd(data: unknown): Record<string, unknown> | null {
    if (!data) return null;

    if (Array.isArray(data)) {
      for (const item of data) {
        const result = this.findProductInJsonLd(item);
        if (result) return result;
      }
      return null;
    }

    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      if (obj['@type'] === 'Product' || obj['@type'] === 'Offer') {
        return obj;
      }
      if (obj['@graph'] && Array.isArray(obj['@graph'])) {
        return this.findProductInJsonLd(obj['@graph']);
      }
    }

    return null;
  }

  private extractPriceFromProduct(product: Record<string, unknown>): number | null {
    const offers = product.offers as Record<string, unknown> | undefined;

    if (offers) {
      if (typeof offers.price === 'number') {
        return offers.price;
      }
      if (typeof offers.price === 'string') {
        return parseFloat(offers.price);
      }
      if (typeof offers.lowPrice === 'number') {
        return offers.lowPrice;
      }
    }

    if (typeof product.price === 'number') {
      return product.price;
    }
    if (typeof product.price === 'string') {
      return parseFloat(product.price);
    }

    return null;
  }

  private extractOriginalPrice(product: Record<string, unknown>): number | undefined {
    const offers = product.offers as Record<string, unknown> | undefined;

    if (offers?.highPrice && typeof offers.highPrice === 'number') {
      return offers.highPrice;
    }

    return undefined;
  }

  private extractAvailability(product: Record<string, unknown>): boolean {
    const offers = product.offers as Record<string, unknown> | undefined;
    const availability = offers?.availability;

    if (typeof availability === 'string') {
      const lower = availability.toLowerCase();
      return lower.includes('instock') || lower.includes('available');
    }

    return true; // Assume in stock if not specified
  }

  private extractOpenGraphPrice(html: string, url: string): ProductPrice | null {
    const metaTags: Record<string, string> = {};

    const metaRegex = /<meta[^>]+(?:property|name)="([^"]+)"[^>]+content="([^"]+)"/gi;
    let match;

    while ((match = metaRegex.exec(html)) !== null) {
      metaTags[match[1].toLowerCase()] = match[2];
    }

    const price = metaTags['product:price:amount'] ?? metaTags['og:price:amount'];
    if (!price) {
      return null;
    }

    return {
      url,
      name: metaTags['og:title'] ?? 'Unknown Product',
      price: parseFloat(price),
      currency: metaTags['product:price:currency'] ?? metaTags['og:price:currency'] ?? 'USD',
      inStock: true,
      lastChecked: Date.now(),
    };
  }

  private extractPriceFromPatterns(html: string, url: string): ProductPrice | null {
    // Common price patterns
    const pricePatterns = [
      /\$(\d+(?:,\d{3})*(?:\.\d{2})?)/g,
      /USD\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g,
      /price["\s:]+(\d+(?:\.\d{2})?)/gi,
    ];

    for (const pattern of pricePatterns) {
      const match = pattern.exec(html);
      if (match) {
        const price = parseFloat(match[1].replace(',', ''));
        if (price > 0 && price < 100000) { // Sanity check
          // Try to get title
          const titleMatch = /<title>([^<]+)<\/title>/i.exec(html);
          const name = titleMatch ? titleMatch[1].trim() : 'Unknown Product';

          return {
            url,
            name,
            price,
            currency: 'USD',
            inStock: true,
            lastChecked: Date.now(),
          };
        }
      }
    }

    return null;
  }
}

/**
 * Amazon price provider
 */
export class AmazonPriceProvider extends PriceMonitoringProvider {
  readonly name = 'amazon-price';
  readonly version = '1.0.0';

  get type(): string {
    return 'price-monitoring';
  }

  constructor() {
    super({ name: 'amazon-price' });
  }

  getSupportedDomains(): string[] {
    return ['amazon.com', 'amazon.co.uk', 'amazon.ca', 'amazon.de', 'amazon.fr'];
  }

  async checkPrice(url: string): Promise<PriceCheckResult> {
    // In a real implementation, this would use Amazon's Product Advertising API
    // or scrape the page with proper rate limiting and user-agent handling
    try {
      const response = await this.fetchRaw(url);
      const html = await response.text();

      // Extract ASIN from URL
      const asinMatch = /\/dp\/([A-Z0-9]{10})/i.exec(url) ||
                       /\/gp\/product\/([A-Z0-9]{10})/i.exec(url);

      if (!asinMatch) {
        return { success: false, error: 'Could not extract product ID from URL' };
      }

      // Try JSON-LD extraction first
      const price = this.extractAmazonPrice(html, url);
      if (price) {
        return { success: true, price };
      }

      return { success: false, error: 'Could not extract price from Amazon page' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private extractAmazonPrice(html: string, url: string): ProductPrice | null {
    // Look for price in various Amazon elements
    const pricePatterns = [
      /id="priceblock_ourprice"[^>]*>([^<]+)/i,
      /id="priceblock_dealprice"[^>]*>([^<]+)/i,
      /class="a-price"[^>]*>[^<]*<span[^>]*>([^<]+)/i,
      /"price":\s*"?(\d+\.?\d*)"/i,
    ];

    for (const pattern of pricePatterns) {
      const match = pattern.exec(html);
      if (match) {
        const priceStr = match[1].replace(/[^0-9.]/g, '');
        const price = parseFloat(priceStr);

        if (price > 0) {
          // Get product name
          const titleMatch = /<span[^>]*id="productTitle"[^>]*>([^<]+)/i.exec(html);
          const name = titleMatch ? titleMatch[1].trim() : 'Amazon Product';

          // Check availability
          const inStock = !/currently unavailable/i.test(html) &&
                         !/out of stock/i.test(html);

          return {
            url,
            name,
            price,
            currency: 'USD',
            inStock,
            seller: 'Amazon',
            lastChecked: Date.now(),
          };
        }
      }
    }

    return null;
  }
}

/**
 * Multi-provider price checker
 */
export class MultiProviderPriceChecker {
  private providers: PriceMonitoringProvider[] = [];

  constructor() {
    // Register default providers
    this.providers.push(new AmazonPriceProvider());
    this.providers.push(new GenericPriceProvider());
  }

  /**
   * Register a price monitoring provider
   */
  registerProvider(provider: PriceMonitoringProvider): void {
    this.providers.unshift(provider); // Add to front for priority
  }

  /**
   * Check price for a URL
   */
  async checkPrice(url: string): Promise<PriceCheckResult> {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');

    // Find a matching provider
    for (const provider of this.providers) {
      const supportedDomains = provider.getSupportedDomains();

      const isSupported = supportedDomains.includes('*') ||
        supportedDomains.some(d => domain.includes(d) || d.includes(domain));

      if (isSupported) {
        const result = await provider.checkPrice(url);
        if (result.success) {
          return result;
        }
      }
    }

    return {
      success: false,
      error: 'No provider could extract price from this URL',
    };
  }

  /**
   * Check prices for multiple URLs in parallel
   */
  async checkPrices(urls: string[]): Promise<Map<string, PriceCheckResult>> {
    const results = new Map<string, PriceCheckResult>();

    const promises = urls.map(async (url) => {
      const result = await this.checkPrice(url);
      results.set(url, result);
    });

    await Promise.all(promises);
    return results;
  }
}
