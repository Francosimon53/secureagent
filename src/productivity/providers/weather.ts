/**
 * Weather Providers
 *
 * Implementations for OpenWeatherMap and WeatherAPI providers.
 */

import { BaseProvider, ProviderError } from './base.js';
import type {
  WeatherData,
  WeatherForecast,
  WeatherAlert,
  ProviderResult,
  WeatherProviderType,
} from '../types.js';
import type { WeatherConfig } from '../config.js';

/**
 * Abstract weather provider interface
 */
export abstract class WeatherProvider extends BaseProvider<WeatherConfig & { name: string; apiKeyEnvVar: string }> {
  abstract get type(): 'weather';
  abstract get providerType(): WeatherProviderType;

  /**
   * Get current weather for a location
   */
  abstract getCurrentWeather(location: string): Promise<ProviderResult<WeatherData>>;

  /**
   * Get weather forecast
   */
  abstract getForecast(location: string, days?: number): Promise<ProviderResult<WeatherForecast[]>>;

  /**
   * Get weather alerts
   */
  abstract getAlerts(location: string): Promise<ProviderResult<WeatherAlert[]>>;
}

/**
 * OpenWeatherMap provider
 */
export class OpenWeatherMapProvider extends WeatherProvider {
  private readonly baseUrl = 'https://api.openweathermap.org/data/2.5';

  get name(): string {
    return 'openweathermap';
  }

  get type(): 'weather' {
    return 'weather';
  }

  get providerType(): WeatherProviderType {
    return 'openweathermap';
  }

  async getCurrentWeather(location: string): Promise<ProviderResult<WeatherData>> {
    const units = this.config.units === 'imperial' ? 'imperial' : 'metric';
    const url = `${this.baseUrl}/weather?q=${encodeURIComponent(location)}&units=${units}&appid=${this.apiKey}`;

    const result = await this.fetch<OpenWeatherMapCurrentResponse>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to fetch weather data',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const data = result.data;
    const weatherData: WeatherData = {
      location: data.name,
      temperature: Math.round(data.main.temp),
      temperatureUnit: units === 'imperial' ? 'fahrenheit' : 'celsius',
      condition: data.weather[0]?.description ?? 'Unknown',
      humidity: data.main.humidity,
      windSpeed: data.wind?.speed,
      visibility: data.visibility,
      forecast: [],
      alerts: [],
      fetchedAt: Date.now(),
    };

    return {
      success: true,
      data: weatherData,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  async getForecast(location: string, days = 5): Promise<ProviderResult<WeatherForecast[]>> {
    const units = this.config.units === 'imperial' ? 'imperial' : 'metric';
    const cnt = Math.min(days * 8, 40); // 3-hour intervals, max 5 days
    const url = `${this.baseUrl}/forecast?q=${encodeURIComponent(location)}&units=${units}&cnt=${cnt}&appid=${this.apiKey}`;

    const result = await this.fetch<OpenWeatherMapForecastResponse>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to fetch forecast data',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    // Group by day and calculate daily high/low
    const dailyData = new Map<string, { temps: number[]; conditions: string[]; precipitation: number }>();

    for (const item of result.data.list) {
      const date = new Date(item.dt * 1000).toISOString().split('T')[0];
      const existing = dailyData.get(date) ?? { temps: [], conditions: [], precipitation: 0 };
      existing.temps.push(item.main.temp);
      existing.conditions.push(item.weather[0]?.description ?? 'Unknown');
      existing.precipitation += item.pop ?? 0;
      dailyData.set(date, existing);
    }

    const forecasts: WeatherForecast[] = [];
    for (const [date, data] of dailyData) {
      forecasts.push({
        date: new Date(date).getTime(),
        high: Math.round(Math.max(...data.temps)),
        low: Math.round(Math.min(...data.temps)),
        condition: this.getMostCommonCondition(data.conditions),
        precipitation: Math.round((data.precipitation / data.temps.length) * 100),
      });
    }

    return {
      success: true,
      data: forecasts.slice(0, days),
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  async getAlerts(location: string): Promise<ProviderResult<WeatherAlert[]>> {
    // OpenWeatherMap One Call API is needed for alerts (requires different subscription)
    // For now, return empty alerts
    return {
      success: true,
      data: [],
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  private getMostCommonCondition(conditions: string[]): string {
    const counts = new Map<string, number>();
    for (const condition of conditions) {
      counts.set(condition, (counts.get(condition) ?? 0) + 1);
    }
    let maxCount = 0;
    let mostCommon = 'Unknown';
    for (const [condition, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = condition;
      }
    }
    return mostCommon;
  }
}

/**
 * WeatherAPI provider
 */
export class WeatherAPIProvider extends WeatherProvider {
  private readonly baseUrl = 'https://api.weatherapi.com/v1';

  get name(): string {
    return 'weatherapi';
  }

  get type(): 'weather' {
    return 'weather';
  }

  get providerType(): WeatherProviderType {
    return 'weatherapi';
  }

  async getCurrentWeather(location: string): Promise<ProviderResult<WeatherData>> {
    const url = `${this.baseUrl}/current.json?key=${this.apiKey}&q=${encodeURIComponent(location)}&aqi=no`;

    const result = await this.fetch<WeatherAPICurrentResponse>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to fetch weather data',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const data = result.data;
    const useMetric = this.config.units !== 'imperial';

    const weatherData: WeatherData = {
      location: `${data.location.name}, ${data.location.country}`,
      temperature: Math.round(useMetric ? data.current.temp_c : data.current.temp_f),
      temperatureUnit: useMetric ? 'celsius' : 'fahrenheit',
      condition: data.current.condition.text,
      humidity: data.current.humidity,
      windSpeed: useMetric ? data.current.wind_kph : data.current.wind_mph,
      windDirection: data.current.wind_dir,
      uvIndex: data.current.uv,
      visibility: useMetric ? data.current.vis_km : data.current.vis_miles,
      forecast: [],
      alerts: [],
      fetchedAt: Date.now(),
    };

    return {
      success: true,
      data: weatherData,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  async getForecast(location: string, days = 5): Promise<ProviderResult<WeatherForecast[]>> {
    const maxDays = Math.min(days, 10); // WeatherAPI free tier supports up to 3 days
    const url = `${this.baseUrl}/forecast.json?key=${this.apiKey}&q=${encodeURIComponent(location)}&days=${maxDays}&aqi=no`;

    const result = await this.fetch<WeatherAPIForecastResponse>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to fetch forecast data',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const useMetric = this.config.units !== 'imperial';
    const forecasts: WeatherForecast[] = result.data.forecast.forecastday.map(day => ({
      date: new Date(day.date).getTime(),
      high: Math.round(useMetric ? day.day.maxtemp_c : day.day.maxtemp_f),
      low: Math.round(useMetric ? day.day.mintemp_c : day.day.mintemp_f),
      condition: day.day.condition.text,
      precipitation: day.day.daily_chance_of_rain,
    }));

    return {
      success: true,
      data: forecasts,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  async getAlerts(location: string): Promise<ProviderResult<WeatherAlert[]>> {
    const url = `${this.baseUrl}/forecast.json?key=${this.apiKey}&q=${encodeURIComponent(location)}&days=1&alerts=yes`;

    const result = await this.fetch<WeatherAPIForecastResponse>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to fetch alerts',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const alerts: WeatherAlert[] = (result.data.alerts?.alert ?? []).map((alert, index) => ({
      id: `alert-${index}-${Date.now()}`,
      type: this.mapAlertType(alert.msgtype),
      title: alert.headline,
      description: alert.desc,
      severity: this.mapAlertSeverity(alert.severity),
      startsAt: new Date(alert.effective).getTime(),
      expiresAt: new Date(alert.expires).getTime(),
    }));

    return {
      success: true,
      data: alerts,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  private mapAlertType(msgType: string): 'warning' | 'watch' | 'advisory' {
    const type = msgType.toLowerCase();
    if (type.includes('warning')) return 'warning';
    if (type.includes('watch')) return 'watch';
    return 'advisory';
  }

  private mapAlertSeverity(severity: string): 'minor' | 'moderate' | 'severe' | 'extreme' {
    const sev = severity.toLowerCase();
    if (sev.includes('extreme')) return 'extreme';
    if (sev.includes('severe')) return 'severe';
    if (sev.includes('moderate')) return 'moderate';
    return 'minor';
  }
}

// =============================================================================
// API Response Types
// =============================================================================

interface OpenWeatherMapCurrentResponse {
  name: string;
  main: {
    temp: number;
    humidity: number;
  };
  weather: Array<{
    description: string;
  }>;
  wind?: {
    speed: number;
  };
  visibility?: number;
}

interface OpenWeatherMapForecastResponse {
  list: Array<{
    dt: number;
    main: {
      temp: number;
    };
    weather: Array<{
      description: string;
    }>;
    pop?: number;
  }>;
}

interface WeatherAPICurrentResponse {
  location: {
    name: string;
    country: string;
  };
  current: {
    temp_c: number;
    temp_f: number;
    condition: {
      text: string;
    };
    humidity: number;
    wind_kph: number;
    wind_mph: number;
    wind_dir: string;
    uv: number;
    vis_km: number;
    vis_miles: number;
  };
}

interface WeatherAPIForecastResponse {
  forecast: {
    forecastday: Array<{
      date: string;
      day: {
        maxtemp_c: number;
        maxtemp_f: number;
        mintemp_c: number;
        mintemp_f: number;
        condition: {
          text: string;
        };
        daily_chance_of_rain: number;
      };
    }>;
  };
  alerts?: {
    alert: Array<{
      headline: string;
      msgtype: string;
      severity: string;
      desc: string;
      effective: string;
      expires: string;
    }>;
  };
}

/**
 * Create a weather provider based on type
 */
export function createWeatherProvider(
  type: WeatherProviderType,
  config: WeatherConfig
): WeatherProvider {
  const providerConfig = {
    ...config,
    name: type,
    apiKeyEnvVar: config.apiKeyEnvVar,
  };

  switch (type) {
    case 'openweathermap':
      return new OpenWeatherMapProvider(providerConfig);
    case 'weatherapi':
      return new WeatherAPIProvider(providerConfig);
    default:
      throw new ProviderError('weather', `Unknown weather provider type: ${type}`);
  }
}
