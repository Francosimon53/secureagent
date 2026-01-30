/**
 * Travel Module Types
 *
 * Core type definitions for the travel automations module including
 * flight auto-check-in, price monitoring, car rental comparison,
 * itinerary consolidation, and traffic-based departure alerts.
 */

// =============================================================================
// Common Types
// =============================================================================

export interface Location {
  lat: number;
  lng: number;
  address?: string;
  name?: string;
}

export interface TravelProviderConfig {
  name: string;
  apiKeyEnvVar?: string;
  baseUrl?: string;
  timeout?: number;
  retryCount?: number;
}

export interface TravelProviderResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  cached: boolean;
  fetchedAt: number;
}

// =============================================================================
// Trip & Booking Types
// =============================================================================

export type TripStatus = 'planning' | 'booked' | 'in_progress' | 'completed' | 'cancelled';
export type BookingType = 'flight' | 'hotel' | 'car_rental' | 'activity';
export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled';
export type CheckInStatus = 'not_available' | 'available' | 'pending' | 'completed' | 'failed';

export interface Trip {
  id: string;
  userId: string;
  name: string;
  destination: string;
  startDate: number;
  endDate: number;
  status: TripStatus;
  bookings: TripBooking[];
  budget?: number;
  actualSpend?: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TripBooking {
  id: string;
  tripId: string;
  userId: string;
  type: BookingType;
  confirmationNumber: string;
  status: BookingStatus;
  provider: string;
  startTime: number;
  endTime?: number;
  cost: number;
  currency: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// Flight Types
// =============================================================================

export interface FlightBooking extends TripBooking {
  type: 'flight';
  airline: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTime: number;
  arrivalTime: number;
  checkInOpensAt: number;
  checkInStatus: CheckInStatus;
  boardingPass?: BoardingPass;
  seatAssignment?: string;
  frequentFlyerNumber?: string;
  passengers: FlightPassenger[];
}

export interface FlightPassenger {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: number;
  knownTravelerNumber?: string;
  seatPreference?: 'window' | 'aisle' | 'middle' | 'no_preference';
  seatAssignment?: string;
  boardingGroup?: string;
}

export interface BoardingPass {
  id: string;
  bookingId: string;
  passengerId: string;
  barcodeData: string;
  barcodeType: 'pdf417' | 'aztec' | 'qr';
  imageUrl?: string;
  pdfUrl?: string;
  gate?: string;
  boardingTime?: number;
  zone?: string;
  issuedAt: number;
}

export interface CheckInAttempt {
  id: string;
  bookingId: string;
  status: 'pending' | 'success' | 'failed' | 'partial';
  attemptedAt: number;
  completedAt?: number;
  errorMessage?: string;
  boardingPassIds?: string[];
  seatAssignments?: Record<string, string>;
  retryCount: number;
}

// =============================================================================
// Hotel Types
// =============================================================================

export interface HotelBooking extends TripBooking {
  type: 'hotel';
  hotelName: string;
  hotelAddress: string;
  hotelLocation?: Location;
  checkInTime: number;
  checkOutTime: number;
  roomType: string;
  guests: number;
  amenities?: string[];
  specialRequests?: string;
}

// =============================================================================
// Car Rental Types
// =============================================================================

export interface CarRentalBooking extends TripBooking {
  type: 'car_rental';
  rentalCompany: string;
  vehicleClass: string;
  vehicleType?: string;
  pickupLocation: Location;
  dropoffLocation: Location;
  pickupTime: number;
  dropoffTime: number;
  insuranceIncluded: boolean;
  additionalDrivers?: number;
  mileageLimit?: number | 'unlimited';
}

export interface CarRentalQuote {
  id: string;
  provider: string;
  providerUrl?: string;
  vehicleClass: string;
  vehicleType?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  dailyRate: number;
  totalCost: number;
  currency: string;
  pickupLocation: Location;
  dropoffLocation: Location;
  pickupTime: number;
  dropoffTime: number;
  insuranceIncluded: boolean;
  features: string[];
  policies: CarRentalPolicies;
  fetchedAt: number;
  expiresAt: number;
}

export interface CarRentalPolicies {
  fuelPolicy: 'full_to_full' | 'prepaid' | 'pay_on_return';
  mileagePolicy: 'unlimited' | 'limited';
  mileageLimit?: number;
  cancellationPolicy: string;
  minimumAge?: number;
  depositAmount?: number;
}

export interface CarRentalSearchParams {
  pickupLocation: Location | string;
  dropoffLocation?: Location | string;
  pickupTime: number;
  dropoffTime: number;
  vehicleClass?: string[];
  maxDailyRate?: number;
  providers?: string[];
}

export interface CarRentalComparisonResult {
  searchParams: CarRentalSearchParams;
  quotes: CarRentalQuote[];
  cheapestQuote?: CarRentalQuote;
  bestValueQuote?: CarRentalQuote;
  fetchedAt: number;
}

// =============================================================================
// Activity Types
// =============================================================================

export interface ActivityBooking extends TripBooking {
  type: 'activity';
  activityName: string;
  activityType: string;
  location: Location;
  duration?: number;
  participants: number;
  ticketUrls?: string[];
}

// =============================================================================
// Price Monitoring Types
// =============================================================================

export type TravelPriceAlertType = 'flight' | 'hotel';

export interface TravelPriceAlert {
  id: string;
  userId: string;
  type: TravelPriceAlertType;
  origin?: string;
  destination: string;
  outboundDate: number;
  returnDate?: number;
  targetPrice: number;
  currentPrice?: number;
  lowestPrice?: number;
  lowestPriceDate?: number;
  priceHistory: TravelPricePoint[];
  isActive: boolean;
  notificationChannels: string[];
  lastCheckedAt?: number;
  triggeredAt?: number;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface TravelPricePoint {
  price: number;
  timestamp: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface TravelPriceCheckResult {
  alertId: string;
  currentPrice: number;
  previousPrice?: number;
  lowestPrice: number;
  priceChange?: {
    direction: 'up' | 'down' | 'unchanged';
    amount: number;
    percentChange: number;
  };
  checkedAt: number;
  source: string;
}

export interface FlightPriceSearch {
  origin: string;
  destination: string;
  outboundDate: number;
  returnDate?: number;
  passengers?: number;
  cabinClass?: 'economy' | 'premium_economy' | 'business' | 'first';
  flexibleDates?: boolean;
}

export interface HotelPriceSearch {
  destination: string;
  checkInDate: number;
  checkOutDate: number;
  guests: number;
  rooms?: number;
  starRating?: number[];
}

// =============================================================================
// Departure Alert Types
// =============================================================================

export type TransportMode = 'driving' | 'transit' | 'walking' | 'bicycling';
export type TrafficConditions = 'light' | 'moderate' | 'heavy' | 'severe';

export interface DepartureAlert {
  id: string;
  userId: string;
  bookingId: string;
  bookingType: BookingType;
  origin: Location;
  destination: Location;
  targetArrivalTime: number;
  bufferMinutes: number;
  transportMode: TransportMode;
  isActive: boolean;
  recommendedDepartureTime?: number;
  currentTravelTime?: number;
  trafficConditions?: TrafficConditions;
  lastCheckedAt?: number;
  alertsSent: DepartureAlertNotification[];
  createdAt: number;
  updatedAt: number;
}

export interface DepartureAlertNotification {
  id: string;
  alertId: string;
  type: 'initial' | 'update' | 'leave_now' | 'delayed';
  message: string;
  recommendedDepartureTime: number;
  estimatedTravelTime: number;
  trafficConditions: TrafficConditions;
  sentAt: number;
  channels: string[];
}

export interface TrafficUpdate {
  origin: Location;
  destination: Location;
  transportMode: TransportMode;
  currentDuration: number;
  typicalDuration: number;
  durationInTraffic: number;
  distance: number;
  trafficConditions: TrafficConditions;
  incidents?: TrafficIncident[];
  fetchedAt: number;
}

export interface TrafficIncident {
  id: string;
  type: 'accident' | 'construction' | 'road_closure' | 'congestion' | 'weather';
  severity: 'minor' | 'moderate' | 'major' | 'severe';
  description: string;
  location?: Location;
  expectedDuration?: number;
}

// =============================================================================
// Itinerary Types
// =============================================================================

export interface ConsolidatedItinerary {
  id: string;
  tripId: string;
  userId: string;
  title: string;
  startDate: number;
  endDate: number;
  items: ItineraryItem[];
  generatedAt: number;
  format: 'detailed' | 'summary';
}

export interface ItineraryItem {
  id: string;
  bookingId?: string;
  type: BookingType | 'layover' | 'gap' | 'note';
  title: string;
  description?: string;
  startTime: number;
  endTime?: number;
  location?: Location;
  confirmationNumber?: string;
  notes?: string;
  reminders?: ItineraryReminder[];
}

export interface ItineraryReminder {
  id: string;
  itemId: string;
  minutesBefore: number;
  message?: string;
  channels: string[];
  scheduledFor: number;
  sent: boolean;
  sentAt?: number;
}

// =============================================================================
// Airline Provider Types
// =============================================================================

export interface AirlineCredentials {
  userId: string;
  airline: string;
  username: string;
  encryptedPassword: string;
  frequentFlyerNumber?: string;
  lastUsed?: number;
  isValid: boolean;
  createdAt: number;
  updatedAt: number;
}

export type SeatCategory = 'window' | 'aisle' | 'front' | 'exit_row' | 'extra_legroom' | 'bulkhead';

export interface SeatPreference {
  categories: SeatCategory[];
  avoidMiddle: boolean;
  preferForward: boolean;
}

export interface AvailableSeat {
  seatNumber: string;
  row: number;
  column: string;
  type: 'standard' | 'exit_row' | 'bulkhead' | 'extra_legroom';
  isWindow: boolean;
  isAisle: boolean;
  isMiddle: boolean;
  isAvailable: boolean;
  price?: number;
  features?: string[];
}

// =============================================================================
// Event Types
// =============================================================================

export interface TravelEvent {
  type: TravelEventType;
  userId: string;
  timestamp: number;
  data: unknown;
}

export type TravelEventType =
  // Check-in events
  | 'travel.checkin.available'
  | 'travel.checkin.completed'
  | 'travel.checkin.failed'
  // Price events
  | 'travel.price.drop-detected'
  | 'travel.price.target-reached'
  | 'travel.price.increase-detected'
  // Booking events
  | 'travel.booking.created'
  | 'travel.booking.reminder'
  | 'travel.booking.cancelled'
  // Departure events
  | 'travel.departure.alert'
  | 'travel.departure.leave-now'
  | 'travel.departure.traffic-update'
  // Trip events
  | 'travel.trip.created'
  | 'travel.trip.started'
  | 'travel.trip.completed'
  | 'travel.trip.cancelled';

// =============================================================================
// Query Options Types
// =============================================================================

export interface TripQueryOptions {
  status?: TripStatus[];
  dateFrom?: number;
  dateTo?: number;
  destination?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'startDate' | 'createdAt' | 'updatedAt';
  orderDirection?: 'asc' | 'desc';
}

export interface BookingQueryOptions {
  tripId?: string;
  type?: BookingType[];
  status?: BookingStatus[];
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
  offset?: number;
  orderBy?: 'startTime' | 'createdAt';
  orderDirection?: 'asc' | 'desc';
}

export interface PriceAlertQueryOptions {
  type?: TravelPriceAlertType[];
  isActive?: boolean;
  destination?: string;
  limit?: number;
  offset?: number;
}

export interface CheckInQueryOptions {
  status?: CheckInStatus[];
  airline?: string;
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
  offset?: number;
}

export interface DepartureAlertQueryOptions {
  bookingType?: BookingType[];
  isActive?: boolean;
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
  offset?: number;
}

// =============================================================================
// Service Config Types
// =============================================================================

export interface TravelServiceConfig {
  enabled?: boolean;
}

export interface CheckInServiceConfig extends TravelServiceConfig {
  autoCheckInEnabled?: boolean;
  checkInAdvanceMinutes?: number;
  maxRetries?: number;
  preferredSeatCategories?: SeatCategory[];
}

export interface PriceMonitoringServiceConfig extends TravelServiceConfig {
  flightCheckIntervalMinutes?: number;
  hotelCheckIntervalMinutes?: number;
  maxAlertsPerUser?: number;
}

export interface CarRentalServiceConfig extends TravelServiceConfig {
  providers?: string[];
  cacheResultsMinutes?: number;
}

export interface ItineraryServiceConfig extends TravelServiceConfig {
  defaultReminderMinutes?: number[];
  calendarSyncEnabled?: boolean;
}

export interface DepartureAlertServiceConfig extends TravelServiceConfig {
  trafficProvider?: 'google_maps' | 'here';
  checkIntervalMinutes?: number;
  defaultBufferMinutes?: {
    airport?: number;
    hotel?: number;
    activity?: number;
    car_rental?: number;
    flight?: number;
  };
}
