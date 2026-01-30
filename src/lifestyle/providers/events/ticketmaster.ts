/**
 * Ticketmaster Provider
 *
 * Ticketmaster API integration for event discovery.
 */

import {
  BaseLifestyleProvider,
  type EventProvider,
  type EventSearchParams,
  type EventSearchResult,
  type EventDetails,
  type ArtistResult,
  type VenueResult,
} from '../base.js';

export interface TicketmasterProviderConfig {
  apiKeyEnvVar?: string;
  baseUrl?: string;
  defaultCountry?: string;
}

/**
 * Ticketmaster provider implementation
 */
export class TicketmasterProvider extends BaseLifestyleProvider implements EventProvider {
  readonly name = 'ticketmaster';
  readonly type = 'events' as const;

  private apiKey: string | null = null;
  private readonly baseUrl: string;
  private readonly defaultCountry: string;

  constructor(private readonly config: TicketmasterProviderConfig = {}) {
    super();
    this.baseUrl = config.baseUrl ?? 'https://app.ticketmaster.com/discovery/v2';
    this.defaultCountry = config.defaultCountry ?? 'US';
  }

  async initialize(): Promise<void> {
    const envVar = this.config.apiKeyEnvVar ?? 'TICKETMASTER_API_KEY';
    this.apiKey = process.env[envVar] ?? null;

    if (!this.apiKey) {
      console.warn(`Ticketmaster API key not found in ${envVar}`);
    }

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  async searchEvents(params: EventSearchParams): Promise<EventSearchResult[]> {
    const queryParams: Record<string, string> = {
      size: String(params.limit ?? 20),
      sort: 'date,asc',
    };

    if (params.query) {
      queryParams.keyword = params.query;
    }

    if (params.categories && params.categories.length > 0) {
      queryParams.classificationName = params.categories.join(',');
    }

    if (params.location) {
      queryParams.latlong = `${params.location.lat},${params.location.lng}`;
      queryParams.radius = String(Math.round(params.location.radiusKm * 0.621371)); // km to miles
      queryParams.unit = 'miles';
    }

    if (params.startDate) {
      queryParams.startDateTime = new Date(params.startDate).toISOString().replace('.000Z', 'Z');
    }

    if (params.endDate) {
      queryParams.endDateTime = new Date(params.endDate).toISOString().replace('.000Z', 'Z');
    }

    if (params.artistId) {
      queryParams.attractionId = params.artistId;
    }

    if (params.venueId) {
      queryParams.venueId = params.venueId;
    }

    const data = await this.request<TMSearchResponse>('/events.json', queryParams);

    if (!data._embedded?.events) {
      return [];
    }

    return data._embedded.events.map(e => this.mapToEventResult(e));
  }

  async getEventDetails(externalId: string): Promise<EventDetails | null> {
    try {
      const data = await this.request<TMEvent>(`/events/${externalId}.json`);
      return this.mapToEventDetails(data);
    } catch {
      return null;
    }
  }

  async searchArtists(query: string): Promise<ArtistResult[]> {
    const data = await this.request<TMAttractionSearchResponse>('/attractions.json', {
      keyword: query,
      size: '10',
    });

    if (!data._embedded?.attractions) {
      return [];
    }

    return data._embedded.attractions.map(a => ({
      externalId: a.id,
      name: a.name,
      genres: a.classifications?.[0]?.genre?.name
        ? [a.classifications[0].genre.name]
        : undefined,
      imageUrl: this.getBestImage(a.images),
      upcomingEventCount: a.upcomingEvents?._total,
    }));
  }

  async searchVenues(query: string, location?: { lat: number; lng: number }): Promise<VenueResult[]> {
    const params: Record<string, string> = {
      keyword: query,
      size: '10',
    };

    if (location) {
      params.latlong = `${location.lat},${location.lng}`;
      params.radius = '50';
      params.unit = 'miles';
    }

    const data = await this.request<TMVenueSearchResponse>('/venues.json', params);

    if (!data._embedded?.venues) {
      return [];
    }

    return data._embedded.venues.map(v => ({
      externalId: v.id,
      name: v.name,
      address: v.address?.line1,
      city: v.city?.name,
      location: v.location
        ? { lat: parseFloat(v.location.latitude), lng: parseFloat(v.location.longitude) }
        : undefined,
      capacity: v.boxOfficeInfo?.acceptedPaymentDetail
        ? parseInt(v.boxOfficeInfo.acceptedPaymentDetail, 10) || undefined
        : undefined,
      imageUrl: this.getBestImage(v.images),
    }));
  }

  async getArtistEvents(artistId: string): Promise<EventSearchResult[]> {
    return this.searchEvents({ artistId, limit: 50 });
  }

  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    if (!this.apiKey) {
      throw new Error('Ticketmaster API key not configured');
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.set('apikey', this.apiKey);
    url.searchParams.set('countryCode', this.defaultCountry);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Ticketmaster API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private mapToEventResult(event: TMEvent): EventSearchResult {
    const venue = event._embedded?.venues?.[0];
    const priceRange = event.priceRanges?.[0];
    const startTime = this.parseDateTime(event.dates?.start);

    return {
      externalId: event.id,
      name: event.name,
      category: this.mapClassification(event.classifications),
      venue: {
        name: venue?.name ?? 'TBA',
        address: venue?.address?.line1,
        city: venue?.city?.name,
        location: venue?.location
          ? { lat: parseFloat(venue.location.latitude), lng: parseFloat(venue.location.longitude) }
          : undefined,
      },
      startTime,
      priceRange: priceRange
        ? {
            min: priceRange.min,
            max: priceRange.max,
            currency: priceRange.currency,
          }
        : undefined,
      artists: event._embedded?.attractions?.map(a => a.name),
      imageUrl: this.getBestImage(event.images),
      ticketUrl: event.url,
      isSoldOut: event.dates?.status?.code === 'offsale',
    };
  }

  private mapToEventDetails(event: TMEvent): EventDetails {
    const base = this.mapToEventResult(event);
    const venue = event._embedded?.venues?.[0];

    return {
      ...base,
      description: event.info ?? event.pleaseNote,
      ageRestriction: event.ageRestrictions?.legalAgeEnforced ? '18+' : undefined,
      ticketTypes: event.priceRanges?.map(p => ({
        name: p.type ?? 'Standard',
        price: p.min,
        currency: p.currency,
        available: event.dates?.status?.code !== 'offsale',
      })),
      seatMap: event.seatmap?.staticUrl,
      lineup: event._embedded?.attractions?.map((a, i) => ({
        name: a.name,
        headliner: i === 0,
      })),
    };
  }

  private mapClassification(classifications?: TMClassification[]): string {
    const classification = classifications?.[0];
    if (!classification) return 'other';

    const segment = classification.segment?.name?.toLowerCase();

    switch (segment) {
      case 'music':
        return 'concert';
      case 'sports':
        return 'sports';
      case 'arts & theatre':
        return 'theater';
      case 'film':
        return 'film';
      default:
        return classification.genre?.name?.toLowerCase() ?? 'other';
    }
  }

  private parseDateTime(dateInfo?: TMDateStart): number {
    if (!dateInfo?.dateTime) {
      if (dateInfo?.localDate) {
        const time = dateInfo.localTime ?? '19:00:00';
        return new Date(`${dateInfo.localDate}T${time}`).getTime();
      }
      return Date.now();
    }
    return new Date(dateInfo.dateTime).getTime();
  }

  private getBestImage(images?: TMImage[]): string | undefined {
    if (!images || images.length === 0) return undefined;

    // Prefer 16:9 ratio images at reasonable resolution
    const preferred = images.find(
      i => i.ratio === '16_9' && (i.width ?? 0) >= 640 && (i.width ?? 0) <= 1024
    );

    if (preferred) return preferred.url;

    // Fall back to largest available
    const sorted = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
    return sorted[0]?.url;
  }
}

// Ticketmaster API response types
interface TMSearchResponse {
  _embedded?: {
    events?: TMEvent[];
  };
  page?: {
    totalElements: number;
    totalPages: number;
  };
}

interface TMEvent {
  id: string;
  name: string;
  url?: string;
  info?: string;
  pleaseNote?: string;
  dates?: {
    start?: TMDateStart;
    status?: { code?: string };
  };
  classifications?: TMClassification[];
  priceRanges?: Array<{
    type?: string;
    min: number;
    max: number;
    currency: string;
  }>;
  images?: TMImage[];
  seatmap?: { staticUrl?: string };
  ageRestrictions?: { legalAgeEnforced?: boolean };
  _embedded?: {
    venues?: TMVenue[];
    attractions?: TMAttraction[];
  };
}

interface TMDateStart {
  localDate?: string;
  localTime?: string;
  dateTime?: string;
}

interface TMClassification {
  segment?: { name?: string };
  genre?: { name?: string };
  subGenre?: { name?: string };
}

interface TMImage {
  url: string;
  ratio?: string;
  width?: number;
  height?: number;
}

interface TMVenue {
  id: string;
  name: string;
  address?: { line1?: string };
  city?: { name?: string };
  state?: { stateCode?: string };
  country?: { countryCode?: string };
  location?: { latitude: string; longitude: string };
  images?: TMImage[];
  boxOfficeInfo?: { acceptedPaymentDetail?: string };
}

interface TMAttraction {
  id: string;
  name: string;
  classifications?: TMClassification[];
  images?: TMImage[];
  upcomingEvents?: { _total?: number };
}

interface TMAttractionSearchResponse {
  _embedded?: {
    attractions?: TMAttraction[];
  };
}

interface TMVenueSearchResponse {
  _embedded?: {
    venues?: TMVenue[];
  };
}

/**
 * Create a Ticketmaster provider instance
 */
export function createTicketmasterProvider(config?: TicketmasterProviderConfig): TicketmasterProvider {
  return new TicketmasterProvider(config);
}
