/**
 * Google Flights Price Aggregator
 *
 * Price aggregator using Google Flights data.
 * Note: This is a simulated implementation as Google Flights doesn't have
 * a public API. In production, this would use web scraping or similar techniques.
 */

import {
  BaseTravelProvider,
  type PriceAggregatorProvider,
  type FlightSearchOptions,
  type FlightPriceResult,
  type HotelSearchOptions,
  type HotelPriceResult,
  TravelProviderError,
} from '../base.js';
import type { TravelProviderConfig } from '../../types.js';

export interface GoogleFlightsConfig extends TravelProviderConfig {
  name: 'google-flights';
  serpApiKeyEnvVar?: string;
}

/**
 * Google Flights price aggregator
 */
export class GoogleFlightsProvider
  extends BaseTravelProvider<GoogleFlightsConfig>
  implements PriceAggregatorProvider
{
  constructor(config: GoogleFlightsConfig) {
    super(config);
  }

  get name(): string {
    return 'google-flights';
  }

  get type(): string {
    return 'aggregator';
  }

  protected requiresApiKey(): boolean {
    return false; // Works in simulation mode without API key
  }

  /**
   * Search for flight prices
   */
  async searchFlightPrices(
    origin: string,
    destination: string,
    outboundDate: number,
    returnDate?: number,
    options?: FlightSearchOptions
  ): Promise<FlightPriceResult[]> {
    // Validate airport codes
    if (!this.isValidAirportCode(origin)) {
      throw new TravelProviderError(this.name, `Invalid origin airport code: ${origin}`);
    }
    if (!this.isValidAirportCode(destination)) {
      throw new TravelProviderError(this.name, `Invalid destination airport code: ${destination}`);
    }

    await this.simulateDelay(800, 2000);

    // Generate simulated flight results
    const results: FlightPriceResult[] = [];
    const airlines = ['United', 'Delta', 'American', 'Southwest', 'JetBlue', 'Alaska'];
    const cabinClass = options?.cabinClass ?? 'economy';

    // Base price varies by cabin class
    const basePriceMultiplier = {
      economy: 1,
      premium_economy: 1.5,
      business: 3,
      first: 5,
    }[cabinClass];

    // Generate 5-10 flight options
    const numResults = 5 + Math.floor(Math.random() * 6);

    for (let i = 0; i < numResults; i++) {
      const airline = airlines[Math.floor(Math.random() * airlines.length)];
      const stops = options?.maxStops !== undefined
        ? Math.min(options.maxStops, Math.floor(Math.random() * 3))
        : Math.floor(Math.random() * 3);

      // Calculate price based on various factors
      const basePrice = 200 + Math.random() * 300;
      const stopsMultiplier = stops === 0 ? 1.3 : (stops === 1 ? 1 : 0.9);
      const price = Math.round(basePrice * basePriceMultiplier * stopsMultiplier);

      // Calculate duration (3-8 hours base + layover time)
      const baseDuration = 3 + Math.random() * 5;
      const layoverTime = stops * (1 + Math.random() * 2);
      const duration = Math.round((baseDuration + layoverTime) * 60);

      // Generate flight times
      const outboundDepartureHour = 6 + Math.floor(Math.random() * 14); // 6am-8pm
      const outboundDeparture = new Date(outboundDate);
      outboundDeparture.setHours(outboundDepartureHour, Math.floor(Math.random() * 4) * 15, 0, 0);

      const outboundArrival = new Date(outboundDeparture.getTime() + duration * 60 * 1000);

      results.push({
        price,
        currency: 'USD',
        airline,
        flightNumbers: this.generateFlightNumbers(airline, stops + 1),
        outboundDeparture: outboundDeparture.getTime(),
        outboundArrival: outboundArrival.getTime(),
        returnDeparture: returnDate ? this.generateReturnTime(returnDate) : undefined,
        returnArrival: returnDate ? this.generateReturnTime(returnDate, duration) : undefined,
        stops,
        duration,
        cabinClass,
        bookingUrl: `https://www.google.com/flights?q=${origin}+to+${destination}`,
        source: this.name,
        fetchedAt: Date.now(),
      });
    }

    // Sort by price
    return results.sort((a, b) => a.price - b.price);
  }

  /**
   * Search for hotel prices
   */
  async searchHotelPrices(
    destination: string,
    checkInDate: number,
    checkOutDate: number,
    options?: HotelSearchOptions
  ): Promise<HotelPriceResult[]> {
    await this.simulateDelay(600, 1500);

    const results: HotelPriceResult[] = [];
    const nights = Math.ceil((checkOutDate - checkInDate) / (24 * 60 * 60 * 1000));

    // Generate hotel results
    const hotels = [
      { name: 'Marriott', rating: 4.2, stars: 4 },
      { name: 'Hilton', rating: 4.3, stars: 4 },
      { name: 'Hyatt', rating: 4.4, stars: 4 },
      { name: 'Holiday Inn', rating: 3.8, stars: 3 },
      { name: 'Hampton Inn', rating: 4.0, stars: 3 },
      { name: 'Courtyard', rating: 4.1, stars: 3 },
      { name: 'Four Seasons', rating: 4.8, stars: 5 },
      { name: 'Westin', rating: 4.3, stars: 4 },
      { name: 'Best Western', rating: 3.6, stars: 2 },
      { name: 'La Quinta', rating: 3.5, stars: 2 },
    ];

    for (const hotel of hotels) {
      // Filter by star rating if specified
      if (options?.starRating && !options.starRating.includes(hotel.stars)) {
        continue;
      }

      // Base price per night varies by star rating
      const basePricePerNight = 50 + (hotel.stars * 40) + Math.random() * 50;
      const pricePerNight = Math.round(basePricePerNight);
      const totalPrice = pricePerNight * nights;

      // Filter by max price if specified
      if (options?.maxPrice && totalPrice > options.maxPrice) {
        continue;
      }

      results.push({
        hotelName: `${hotel.name} ${destination}`,
        price: totalPrice,
        currency: 'USD',
        pricePerNight,
        starRating: hotel.stars,
        rating: hotel.rating,
        reviewCount: 100 + Math.floor(Math.random() * 2000),
        address: `${100 + Math.floor(Math.random() * 900)} Main St, ${destination}`,
        amenities: this.generateAmenities(hotel.stars),
        roomType: options?.rooms && options.rooms > 1 ? 'Double Queen' : 'King',
        bookingUrl: `https://www.google.com/hotels?q=${destination}`,
        source: this.name,
        fetchedAt: Date.now(),
      });
    }

    // Sort by price
    return results.sort((a, b) => a.price - b.price);
  }

  /**
   * Get price history for a route
   */
  async getPriceHistory(
    origin: string,
    destination: string,
    daysBack: number = 30
  ): Promise<Array<{ date: number; price: number }>> {
    await this.simulateDelay(300, 700);

    const history: Array<{ date: number; price: number }> = [];
    const basePrice = 250 + Math.random() * 100;

    for (let i = daysBack; i >= 0; i--) {
      const date = Date.now() - (i * 24 * 60 * 60 * 1000);
      // Add some variation to price
      const variation = (Math.random() - 0.5) * 100;
      const price = Math.round(basePrice + variation);
      history.push({ date, price });
    }

    return history;
  }

  /**
   * Get price predictions
   */
  async getPricePrediction(
    origin: string,
    destination: string,
    travelDate: number
  ): Promise<{
    currentPrice: number;
    predictedDirection: 'up' | 'down' | 'stable';
    confidence: number;
    recommendation: 'buy_now' | 'wait' | 'unknown';
  }> {
    await this.simulateDelay(200, 500);

    const currentPrice = 250 + Math.random() * 200;
    const directions = ['up', 'down', 'stable'] as const;
    const predictedDirection = directions[Math.floor(Math.random() * 3)];
    const confidence = 0.5 + Math.random() * 0.4;

    let recommendation: 'buy_now' | 'wait' | 'unknown';
    if (predictedDirection === 'up' && confidence > 0.7) {
      recommendation = 'buy_now';
    } else if (predictedDirection === 'down' && confidence > 0.7) {
      recommendation = 'wait';
    } else {
      recommendation = 'unknown';
    }

    return {
      currentPrice: Math.round(currentPrice),
      predictedDirection,
      confidence: Math.round(confidence * 100) / 100,
      recommendation,
    };
  }

  private isValidAirportCode(code: string): boolean {
    return /^[A-Z]{3}$/.test(code.toUpperCase());
  }

  private generateFlightNumbers(airline: string, count: number): string[] {
    const codes: Record<string, string> = {
      'United': 'UA',
      'Delta': 'DL',
      'American': 'AA',
      'Southwest': 'WN',
      'JetBlue': 'B6',
      'Alaska': 'AS',
    };

    const code = codes[airline] ?? 'XX';
    const numbers: string[] = [];

    for (let i = 0; i < count; i++) {
      numbers.push(`${code}${100 + Math.floor(Math.random() * 9000)}`);
    }

    return numbers;
  }

  private generateReturnTime(date: number, offset?: number): number {
    const returnDate = new Date(date);
    const hour = 8 + Math.floor(Math.random() * 12);
    returnDate.setHours(hour, Math.floor(Math.random() * 4) * 15, 0, 0);

    if (offset) {
      return returnDate.getTime() + offset * 60 * 1000;
    }

    return returnDate.getTime();
  }

  private generateAmenities(stars: number): string[] {
    const allAmenities = [
      'Free WiFi',
      'Pool',
      'Gym',
      'Restaurant',
      'Room Service',
      'Spa',
      'Business Center',
      'Parking',
      'Pet Friendly',
      'Airport Shuttle',
      'Concierge',
      'Valet Parking',
    ];

    // Higher star = more amenities
    const count = Math.min(stars + 2, allAmenities.length);
    const shuffled = [...allAmenities].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  private async simulateDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

/**
 * Create a Google Flights provider instance
 */
export function createGoogleFlightsProvider(): GoogleFlightsProvider {
  return new GoogleFlightsProvider({
    name: 'google-flights',
  });
}
