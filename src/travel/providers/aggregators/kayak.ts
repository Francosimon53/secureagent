/**
 * Kayak Price Aggregator
 *
 * Price aggregator using Kayak data.
 * Note: This is a simulated implementation. In production, this would
 * use Kayak's affiliate API or web scraping.
 */

import {
  BaseTravelProvider,
  type PriceAggregatorProvider,
  type FlightSearchOptions,
  type FlightPriceResult,
  type HotelSearchOptions,
  type HotelPriceResult,
  type CarRentalProvider,
  type CarRentalSearchOptions,
  type CarRentalResult,
  TravelProviderError,
} from '../base.js';
import type { TravelProviderConfig } from '../../types.js';

export interface KayakConfig extends TravelProviderConfig {
  name: 'kayak';
  apiKeyEnvVar?: string;
}

/**
 * Kayak price aggregator for flights, hotels, and car rentals
 */
export class KayakProvider
  extends BaseTravelProvider<KayakConfig>
  implements PriceAggregatorProvider, CarRentalProvider
{
  constructor(config: KayakConfig) {
    super(config);
  }

  get name(): string {
    return 'kayak';
  }

  get type(): string {
    return 'aggregator';
  }

  protected requiresApiKey(): boolean {
    return false;
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
    if (!this.isValidAirportCode(origin) || !this.isValidAirportCode(destination)) {
      throw new TravelProviderError(this.name, 'Invalid airport code');
    }

    await this.simulateDelay(1000, 2500);

    const results: FlightPriceResult[] = [];
    const airlines = ['United', 'Delta', 'American', 'Frontier', 'Spirit', 'Sun Country'];
    const cabinClass = options?.cabinClass ?? 'economy';

    const basePriceMultiplier = {
      economy: 1,
      premium_economy: 1.6,
      business: 3.2,
      first: 5.5,
    }[cabinClass];

    const numResults = 6 + Math.floor(Math.random() * 8);

    for (let i = 0; i < numResults; i++) {
      const airline = airlines[Math.floor(Math.random() * airlines.length)];
      const stops = Math.floor(Math.random() * 3);

      // Kayak often shows lower prices for budget carriers
      const isBudget = ['Frontier', 'Spirit', 'Sun Country'].includes(airline);
      const budgetDiscount = isBudget ? 0.7 : 1;

      const basePrice = 180 + Math.random() * 280;
      const stopsMultiplier = stops === 0 ? 1.25 : (stops === 1 ? 1 : 0.85);
      const price = Math.round(basePrice * basePriceMultiplier * stopsMultiplier * budgetDiscount);

      const baseDuration = 2.5 + Math.random() * 6;
      const layoverTime = stops * (1.5 + Math.random() * 2);
      const duration = Math.round((baseDuration + layoverTime) * 60);

      const outboundDepartureHour = 5 + Math.floor(Math.random() * 16);
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
        bookingUrl: `https://www.kayak.com/flights/${origin}-${destination}`,
        source: this.name,
        fetchedAt: Date.now(),
      });
    }

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
    await this.simulateDelay(700, 1800);

    const results: HotelPriceResult[] = [];
    const nights = Math.ceil((checkOutDate - checkInDate) / (24 * 60 * 60 * 1000));

    const hotels = [
      { name: 'Sheraton', rating: 4.1, stars: 4 },
      { name: 'W Hotel', rating: 4.5, stars: 5 },
      { name: 'Aloft', rating: 4.0, stars: 3 },
      { name: 'Element', rating: 4.2, stars: 3 },
      { name: 'St. Regis', rating: 4.9, stars: 5 },
      { name: 'Residence Inn', rating: 4.1, stars: 3 },
      { name: 'Fairfield Inn', rating: 3.8, stars: 2 },
      { name: 'AC Hotel', rating: 4.2, stars: 4 },
      { name: 'Moxy', rating: 4.0, stars: 3 },
      { name: 'JW Marriott', rating: 4.6, stars: 5 },
    ];

    for (const hotel of hotels) {
      if (options?.starRating && !options.starRating.includes(hotel.stars)) {
        continue;
      }

      const basePricePerNight = 60 + (hotel.stars * 45) + Math.random() * 60;
      const pricePerNight = Math.round(basePricePerNight);
      const totalPrice = pricePerNight * nights;

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
        reviewCount: 150 + Math.floor(Math.random() * 2500),
        address: `${Math.floor(Math.random() * 999) + 1} ${this.getStreetName()}, ${destination}`,
        amenities: this.generateAmenities(hotel.stars),
        roomType: 'Standard Room',
        bookingUrl: `https://www.kayak.com/hotels/${destination}`,
        source: this.name,
        fetchedAt: Date.now(),
      });
    }

    return results.sort((a, b) => a.price - b.price);
  }

  /**
   * Search for car rental prices
   */
  async searchRentals(
    pickupLocation: string | { lat: number; lng: number },
    dropoffLocation: string | { lat: number; lng: number } | undefined,
    pickupTime: number,
    dropoffTime: number,
    options?: CarRentalSearchOptions
  ): Promise<CarRentalResult[]> {
    await this.simulateDelay(600, 1500);

    const results: CarRentalResult[] = [];
    const days = Math.ceil((dropoffTime - pickupTime) / (24 * 60 * 60 * 1000));

    const providers = [
      { name: 'Enterprise', premium: 1.0 },
      { name: 'Hertz', premium: 1.15 },
      { name: 'Avis', premium: 1.1 },
      { name: 'Budget', premium: 0.9 },
      { name: 'National', premium: 1.05 },
      { name: 'Alamo', premium: 0.95 },
      { name: 'Dollar', premium: 0.85 },
      { name: 'Thrifty', premium: 0.8 },
    ];

    const vehicleClasses = [
      { class: 'economy', baseDailyRate: 35, type: 'Compact Car' },
      { class: 'compact', baseDailyRate: 40, type: 'Compact Car' },
      { class: 'midsize', baseDailyRate: 50, type: 'Midsize Sedan' },
      { class: 'fullsize', baseDailyRate: 60, type: 'Full-size Sedan' },
      { class: 'suv', baseDailyRate: 75, type: 'SUV' },
      { class: 'minivan', baseDailyRate: 80, type: 'Minivan' },
      { class: 'luxury', baseDailyRate: 120, type: 'Luxury Car' },
    ];

    for (const provider of providers) {
      for (const vehicle of vehicleClasses) {
        // Filter by vehicle class if specified
        if (options?.vehicleClass && !options.vehicleClass.includes(vehicle.class)) {
          continue;
        }

        const dailyRate = Math.round(vehicle.baseDailyRate * provider.premium + Math.random() * 15);
        const totalCost = dailyRate * days;

        // Filter by max daily rate
        if (options?.maxDailyRate && dailyRate > options.maxDailyRate) {
          continue;
        }

        results.push({
          provider: provider.name,
          vehicleClass: vehicle.class,
          vehicleType: vehicle.type,
          vehicleMake: this.getRandomMake(vehicle.class),
          vehicleModel: this.getRandomModel(vehicle.class),
          dailyRate,
          totalCost,
          currency: 'USD',
          features: this.getVehicleFeatures(vehicle.class),
          insuranceIncluded: Math.random() > 0.7,
          mileagePolicy: Math.random() > 0.2 ? 'unlimited' : 'limited',
          mileageLimit: Math.random() > 0.2 ? undefined : 150 * days,
          bookingUrl: `https://www.kayak.com/cars`,
          source: this.name,
          fetchedAt: Date.now(),
        });
      }
    }

    return results.sort((a, b) => a.totalCost - b.totalCost);
  }

  private isValidAirportCode(code: string): boolean {
    return /^[A-Z]{3}$/.test(code.toUpperCase());
  }

  private generateFlightNumbers(airline: string, count: number): string[] {
    const codes: Record<string, string> = {
      'United': 'UA',
      'Delta': 'DL',
      'American': 'AA',
      'Frontier': 'F9',
      'Spirit': 'NK',
      'Sun Country': 'SY',
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
    const hour = 7 + Math.floor(Math.random() * 13);
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
      'Fitness Center',
      'Restaurant',
      'Bar',
      'Spa',
      'Business Center',
      'Free Parking',
      'EV Charging',
      'Rooftop Bar',
    ];

    const count = Math.min(stars + 2, allAmenities.length);
    const shuffled = [...allAmenities].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  private getStreetName(): string {
    const streets = ['Market St', 'Broadway', 'Main St', 'Park Ave', 'Ocean Blvd', 'Center St'];
    return streets[Math.floor(Math.random() * streets.length)];
  }

  private getRandomMake(vehicleClass: string): string {
    const makes: Record<string, string[]> = {
      economy: ['Toyota', 'Nissan', 'Hyundai', 'Kia'],
      compact: ['Toyota', 'Honda', 'Mazda', 'Hyundai'],
      midsize: ['Toyota', 'Honda', 'Nissan', 'Chevrolet'],
      fullsize: ['Toyota', 'Nissan', 'Chevrolet', 'Dodge'],
      suv: ['Ford', 'Chevrolet', 'Toyota', 'Jeep'],
      minivan: ['Chrysler', 'Toyota', 'Honda', 'Dodge'],
      luxury: ['BMW', 'Mercedes', 'Audi', 'Lexus'],
    };

    const options = makes[vehicleClass] ?? makes.midsize;
    return options[Math.floor(Math.random() * options.length)];
  }

  private getRandomModel(vehicleClass: string): string {
    const models: Record<string, string[]> = {
      economy: ['Yaris', 'Versa', 'Accent', 'Rio'],
      compact: ['Corolla', 'Civic', 'Mazda3', 'Elantra'],
      midsize: ['Camry', 'Accord', 'Altima', 'Malibu'],
      fullsize: ['Avalon', 'Maxima', 'Impala', 'Charger'],
      suv: ['Explorer', 'Tahoe', 'Highlander', 'Grand Cherokee'],
      minivan: ['Pacifica', 'Sienna', 'Odyssey', 'Grand Caravan'],
      luxury: ['5 Series', 'E-Class', 'A6', 'ES'],
    };

    const options = models[vehicleClass] ?? models.midsize;
    return options[Math.floor(Math.random() * options.length)];
  }

  private getVehicleFeatures(vehicleClass: string): string[] {
    const baseFeatures = ['Air Conditioning', 'Automatic Transmission'];

    if (['economy', 'compact'].includes(vehicleClass)) {
      return [...baseFeatures, 'Bluetooth'];
    }

    if (['midsize', 'fullsize'].includes(vehicleClass)) {
      return [...baseFeatures, 'Bluetooth', 'Backup Camera', 'USB Ports'];
    }

    if (vehicleClass === 'suv') {
      return [...baseFeatures, 'Bluetooth', 'Backup Camera', 'Apple CarPlay', '4WD Available'];
    }

    if (vehicleClass === 'luxury') {
      return [...baseFeatures, 'Leather Seats', 'Navigation', 'Apple CarPlay', 'Heated Seats', 'Sunroof'];
    }

    return baseFeatures;
  }

  private async simulateDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

/**
 * Create a Kayak provider instance
 */
export function createKayakProvider(): KayakProvider {
  return new KayakProvider({
    name: 'kayak',
  });
}
