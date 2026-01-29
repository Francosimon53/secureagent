/**
 * Providers Module
 *
 * Exports all provider implementations and utilities.
 */

// Base provider and registry
export {
  BaseProvider,
  ProviderRegistry,
  ProviderError,
  getProviderRegistry,
  initProviderRegistry,
} from './base.js';

// Weather providers
export {
  WeatherProvider,
  OpenWeatherMapProvider,
  WeatherAPIProvider,
  createWeatherProvider,
} from './weather.js';

// Calendar providers
export {
  CalendarProvider,
  GoogleCalendarProvider,
  OutlookCalendarProvider,
  createCalendarProvider,
} from './calendar.js';

// Email providers
export {
  EmailProvider,
  GmailProvider,
  OutlookMailProvider,
  createEmailProvider,
  type EmailQueryOptions,
} from './email.js';

// News providers
export {
  NewsProvider,
  NewsAPIProvider,
  RSSProvider,
  createNewsProvider,
  type NewsQueryOptions,
} from './news.js';
