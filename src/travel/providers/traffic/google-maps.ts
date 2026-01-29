/**
 * Google Maps Traffic Provider
 *
 * Traffic and directions provider using Google Maps APIs.
 */

import {
  BaseTravelProvider,
  type TrafficProvider,
  type TrafficResult,
  type RouteResult,
  type RouteStep,
  TravelProviderError,
} from '../base.js';
import type { TravelProviderConfig, TravelProviderResult, Location } from '../../types.js';

export interface GoogleMapsConfig extends TravelProviderConfig {
  name: 'google-maps';
  apiKeyEnvVar: string;
  baseUrl?: string;
}

interface DirectionsResponse {
  status: string;
  routes: Array<{
    legs: Array<{
      distance: { value: number; text: string };
      duration: { value: number; text: string };
      duration_in_traffic?: { value: number; text: string };
      start_location: { lat: number; lng: number };
      end_location: { lat: number; lng: number };
      steps: Array<{
        html_instructions: string;
        distance: { value: number };
        duration: { value: number };
        start_location: { lat: number; lng: number };
        end_location: { lat: number; lng: number };
      }>;
    }>;
    overview_polyline: { points: string };
    warnings: string[];
  }>;
  error_message?: string;
}

interface DistanceMatrixResponse {
  status: string;
  rows: Array<{
    elements: Array<{
      status: string;
      distance: { value: number; text: string };
      duration: { value: number; text: string };
      duration_in_traffic?: { value: number; text: string };
    }>;
  }>;
  error_message?: string;
}

/**
 * Google Maps traffic and directions provider
 */
export class GoogleMapsProvider
  extends BaseTravelProvider<GoogleMapsConfig>
  implements TrafficProvider
{
  private baseUrl: string;

  constructor(config: GoogleMapsConfig) {
    super(config);
    this.baseUrl = config.baseUrl ?? 'https://maps.googleapis.com/maps/api';
  }

  get name(): string {
    return 'google-maps';
  }

  get type(): string {
    return 'traffic';
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  /**
   * Get travel time and traffic conditions between two points
   */
  async getTravelTime(
    origin: Location,
    destination: Location,
    departureTime?: number,
    mode: 'driving' | 'transit' | 'walking' | 'bicycling' = 'driving'
  ): Promise<TrafficResult> {
    const originStr = `${origin.lat},${origin.lng}`;
    const destStr = `${destination.lat},${destination.lng}`;

    const params = new URLSearchParams({
      origins: originStr,
      destinations: destStr,
      mode,
      key: this.apiKey!,
    });

    if (mode === 'driving') {
      params.append('departure_time', String(departureTime ?? Math.floor(Date.now() / 1000)));
      params.append('traffic_model', 'best_guess');
    }

    const url = `${this.baseUrl}/distancematrix/json?${params}`;
    const result = await this.fetch<DistanceMatrixResponse>(url);

    if (!result.success || !result.data) {
      throw new TravelProviderError(
        this.name,
        result.error ?? 'Failed to fetch distance matrix'
      );
    }

    const data = result.data;
    if (data.status !== 'OK') {
      throw new TravelProviderError(
        this.name,
        data.error_message ?? `API error: ${data.status}`
      );
    }

    const element = data.rows[0]?.elements[0];
    if (!element || element.status !== 'OK') {
      throw new TravelProviderError(
        this.name,
        `No route found: ${element?.status ?? 'Unknown error'}`
      );
    }

    const durationSeconds = element.duration.value;
    const durationInTrafficSeconds = element.duration_in_traffic?.value ?? durationSeconds;
    const distanceMeters = element.distance.value;

    const trafficRatio = durationInTrafficSeconds / durationSeconds;
    let trafficCondition: TrafficResult['trafficCondition'];

    if (trafficRatio < 1.1) {
      trafficCondition = 'light';
    } else if (trafficRatio < 1.3) {
      trafficCondition = 'moderate';
    } else if (trafficRatio < 1.6) {
      trafficCondition = 'heavy';
    } else {
      trafficCondition = 'severe';
    }

    return {
      durationSeconds,
      durationInTrafficSeconds,
      distanceMeters,
      trafficCondition,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get detailed route with traffic information
   */
  async getRoute(
    origin: Location,
    destination: Location,
    departureTime?: number,
    mode: 'driving' | 'transit' | 'walking' | 'bicycling' = 'driving'
  ): Promise<RouteResult> {
    const originStr = `${origin.lat},${origin.lng}`;
    const destStr = `${destination.lat},${destination.lng}`;

    const params = new URLSearchParams({
      origin: originStr,
      destination: destStr,
      mode,
      key: this.apiKey!,
    });

    if (mode === 'driving') {
      params.append('departure_time', String(departureTime ?? Math.floor(Date.now() / 1000)));
      params.append('traffic_model', 'best_guess');
    }

    const url = `${this.baseUrl}/directions/json?${params}`;
    const result = await this.fetch<DirectionsResponse>(url);

    if (!result.success || !result.data) {
      throw new TravelProviderError(
        this.name,
        result.error ?? 'Failed to fetch directions'
      );
    }

    const data = result.data;
    if (data.status !== 'OK') {
      throw new TravelProviderError(
        this.name,
        data.error_message ?? `API error: ${data.status}`
      );
    }

    const route = data.routes[0];
    if (!route) {
      throw new TravelProviderError(this.name, 'No route found');
    }

    const leg = route.legs[0];
    const durationSeconds = leg.duration.value;
    const durationInTrafficSeconds = leg.duration_in_traffic?.value ?? durationSeconds;
    const distanceMeters = leg.distance.value;

    const trafficRatio = durationInTrafficSeconds / durationSeconds;
    let trafficCondition: TrafficResult['trafficCondition'];

    if (trafficRatio < 1.1) {
      trafficCondition = 'light';
    } else if (trafficRatio < 1.3) {
      trafficCondition = 'moderate';
    } else if (trafficRatio < 1.6) {
      trafficCondition = 'heavy';
    } else {
      trafficCondition = 'severe';
    }

    const steps: RouteStep[] = leg.steps.map(step => ({
      instruction: this.stripHtml(step.html_instructions),
      distance: step.distance.value,
      duration: step.duration.value,
      startLocation: step.start_location,
      endLocation: step.end_location,
    }));

    return {
      durationSeconds,
      durationInTrafficSeconds,
      distanceMeters,
      trafficCondition,
      polyline: route.overview_polyline.points,
      steps,
      warnings: route.warnings,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Calculate recommended departure time to arrive at target time
   */
  async getRecommendedDepartureTime(
    origin: Location,
    destination: Location,
    targetArrivalTime: number,
    bufferMinutes: number = 15,
    mode: 'driving' | 'transit' = 'driving'
  ): Promise<{ departureTime: number; travelTime: number; trafficCondition: TrafficResult['trafficCondition'] }> {
    // Start checking from target arrival time minus a generous buffer
    const estimatedMaxTravelTime = 4 * 60 * 60 * 1000; // 4 hours
    let checkTime = targetArrivalTime - estimatedMaxTravelTime;

    // Binary search to find optimal departure time
    let low = checkTime;
    let high = targetArrivalTime - (bufferMinutes * 60 * 1000);
    let bestDeparture = low;
    let bestTravelTime = 0;
    let bestCondition: TrafficResult['trafficCondition'] = 'light';

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const result = await this.getTravelTime(origin, destination, Math.floor(mid / 1000), mode);

      const arrivalTime = mid + (result.durationInTrafficSeconds * 1000);
      const targetWithBuffer = targetArrivalTime - (bufferMinutes * 60 * 1000);

      if (arrivalTime <= targetWithBuffer) {
        bestDeparture = mid;
        bestTravelTime = result.durationInTrafficSeconds;
        bestCondition = result.trafficCondition;
        low = mid + (15 * 60 * 1000); // 15 minute increments
      } else {
        high = mid - (15 * 60 * 1000);
      }
    }

    return {
      departureTime: bestDeparture,
      travelTime: bestTravelTime,
      trafficCondition: bestCondition,
    };
  }

  /**
   * Geocode an address to coordinates
   */
  async geocode(address: string): Promise<Location | null> {
    const params = new URLSearchParams({
      address,
      key: this.apiKey!,
    });

    const url = `${this.baseUrl}/geocode/json?${params}`;
    const result = await this.fetch<{
      status: string;
      results: Array<{
        geometry: { location: { lat: number; lng: number } };
        formatted_address: string;
      }>;
    }>(url);

    if (!result.success || !result.data || result.data.status !== 'OK') {
      return null;
    }

    const first = result.data.results[0];
    if (!first) {
      return null;
    }

    return {
      lat: first.geometry.location.lat,
      lng: first.geometry.location.lng,
      address: first.formatted_address,
    };
  }

  /**
   * Reverse geocode coordinates to address
   */
  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    const params = new URLSearchParams({
      latlng: `${lat},${lng}`,
      key: this.apiKey!,
    });

    const url = `${this.baseUrl}/geocode/json?${params}`;
    const result = await this.fetch<{
      status: string;
      results: Array<{ formatted_address: string }>;
    }>(url);

    if (!result.success || !result.data || result.data.status !== 'OK') {
      return null;
    }

    return result.data.results[0]?.formatted_address ?? null;
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '');
  }
}

/**
 * Create a Google Maps provider instance
 */
export function createGoogleMapsProvider(
  apiKeyEnvVar: string = 'GOOGLE_MAPS_API_KEY'
): GoogleMapsProvider {
  return new GoogleMapsProvider({
    name: 'google-maps',
    apiKeyEnvVar,
  });
}
