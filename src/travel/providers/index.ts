/**
 * Travel Providers
 *
 * Re-exports all provider implementations and the registry.
 */

// Base provider and registry
export {
  BaseTravelProvider,
  TravelProviderRegistry,
  TravelProviderError,
  getTravelProviderRegistry,
  initTravelProviderRegistry,
  type CheckInCapableProvider,
  type CheckInOptions,
  type CheckInResult,
  type BoardingPassData,
  type SeatMap,
  type SeatRow,
  type SeatInfo,
  type PriceAggregatorProvider,
  type FlightSearchOptions,
  type FlightPriceResult,
  type HotelSearchOptions,
  type HotelPriceResult,
  type TrafficProvider,
  type TrafficResult,
  type RouteResult,
  type RouteStep,
  type CarRentalProvider,
  type CarRentalSearchOptions,
  type CarRentalResult,
} from './base.js';

// Airline providers
export {
  UnitedProvider,
  createUnitedProvider,
  DeltaProvider,
  createDeltaProvider,
  SouthwestProvider,
  createSouthwestProvider,
} from './airlines/index.js';

// Traffic providers
export {
  GoogleMapsProvider,
  createGoogleMapsProvider,
} from './traffic/index.js';

// Price aggregators
export {
  GoogleFlightsProvider,
  createGoogleFlightsProvider,
  KayakProvider,
  createKayakProvider,
} from './aggregators/index.js';
