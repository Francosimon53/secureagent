/**
 * Thermostat Integration
 *
 * Support for Nest and Ecobee thermostats.
 */

import type {
  ThermostatDevice,
  CommandResult,
} from './types.js';
import type { NestConfig, EcobeeConfig } from './config.js';

// Nest API types
interface NestDevice {
  name: string;
  type: string;
  traits: {
    'sdm.devices.traits.Info'?: {
      customName: string;
    };
    'sdm.devices.traits.Temperature'?: {
      ambientTemperatureCelsius: number;
    };
    'sdm.devices.traits.Humidity'?: {
      ambientHumidityPercent: number;
    };
    'sdm.devices.traits.ThermostatMode'?: {
      mode: string;
      availableModes: string[];
    };
    'sdm.devices.traits.ThermostatTemperatureSetpoint'?: {
      heatCelsius?: number;
      coolCelsius?: number;
    };
    'sdm.devices.traits.ThermostatHvac'?: {
      status: string;
    };
    'sdm.devices.traits.ThermostatEco'?: {
      mode: string;
      heatCelsius?: number;
      coolCelsius?: number;
    };
  };
}

// Ecobee API types
interface EcobeeThermostat {
  identifier: string;
  name: string;
  thermostatRev: string;
  isRegistered: boolean;
  modelNumber: string;
  brand: string;
  runtime: {
    actualTemperature: number;
    actualHumidity: number;
    desiredHeat: number;
    desiredCool: number;
  };
  settings: {
    hvacMode: string;
    fanMinOnTime: number;
  };
  equipmentStatus: string;
}

/**
 * Google Nest Integration
 */
export class NestIntegration {
  private config: NestConfig;
  private devices: Map<string, ThermostatDevice> = new Map();
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: NestConfig) {
    this.config = config;
    this.accessToken = config.accessToken || null;
  }

  /**
   * Initialize Nest integration
   */
  async initialize(): Promise<boolean> {
    try {
      if (!this.accessToken || Date.now() >= this.tokenExpiry) {
        await this.refreshAccessToken();
      }
      await this.refreshDevices();
      return true;
    } catch (error) {
      console.error('Failed to initialize Nest:', error);
      return false;
    }
  }

  /**
   * Get OAuth URL for authorization
   */
  getAuthUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/sdm.service',
      access_type: 'offline',
      prompt: 'consent',
    });
    return `https://nestservices.google.com/partnerconnections/${this.config.projectId}/auth?${params}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(code: string, redirectUri: string): Promise<void> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    interface TokenResponse {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      error?: string;
      error_description?: string;
    }
    const tokens = (await response.json()) as TokenResponse;
    if (tokens.error) {
      throw new Error(`Token exchange failed: ${tokens.error_description}`);
    }

    this.accessToken = tokens.access_token;
    this.tokenExpiry = Date.now() + tokens.expires_in * 1000;
    // Store refresh token for future use
    this.config.refreshToken = tokens.refresh_token;
  }

  /**
   * Refresh access token
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.config.refreshToken) {
      throw new Error('No refresh token available. Re-authorize the app.');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    interface TokenResponse {
      access_token: string;
      expires_in: number;
      error?: string;
      error_description?: string;
    }
    const tokens = (await response.json()) as TokenResponse;
    if (tokens.error) {
      throw new Error(`Token refresh failed: ${tokens.error_description}`);
    }

    this.accessToken = tokens.access_token;
    this.tokenExpiry = Date.now() + tokens.expires_in * 1000;
  }

  /**
   * Make API request to Nest SDM API
   */
  private async api<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown
  ): Promise<T> {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.refreshAccessToken();
    }

    const url = `https://smartdevicemanagement.googleapis.com/v1${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`Nest API error: ${response.status}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Refresh all devices
   */
  async refreshDevices(): Promise<void> {
    const result = await this.api<{ devices: NestDevice[] }>(
      `/enterprises/${this.config.projectId}/devices`
    );

    this.devices.clear();
    for (const device of result.devices) {
      if (device.type === 'sdm.devices.types.THERMOSTAT') {
        const parsed = this.parseDevice(device);
        this.devices.set(parsed.id, parsed);
      }
    }
  }

  /**
   * Parse Nest device to our format
   */
  private parseDevice(device: NestDevice): ThermostatDevice {
    const traits = device.traits;
    const id = device.name.split('/').pop()!;

    const tempTrait = traits['sdm.devices.traits.Temperature'];
    const humidityTrait = traits['sdm.devices.traits.Humidity'];
    const modeTrait = traits['sdm.devices.traits.ThermostatMode'];
    const setpointTrait = traits['sdm.devices.traits.ThermostatTemperatureSetpoint'];
    const hvacTrait = traits['sdm.devices.traits.ThermostatHvac'];
    const infoTrait = traits['sdm.devices.traits.Info'];

    const mode = modeTrait?.mode || 'OFF';
    const targetTemp = mode === 'HEAT'
      ? setpointTrait?.heatCelsius
      : mode === 'COOL'
        ? setpointTrait?.coolCelsius
        : (setpointTrait?.heatCelsius || setpointTrait?.coolCelsius);

    return {
      id: `nest_${id}`,
      name: infoTrait?.customName || 'Nest Thermostat',
      type: 'thermostat',
      state: mode !== 'OFF' ? 'on' : 'off',
      reachable: true,
      manufacturer: 'Google',
      model: 'Nest Thermostat',
      capabilities: ['temperature', 'hvac_mode', 'humidity'],
      currentTemp: this.celsiusToFahrenheit(tempTrait?.ambientTemperatureCelsius || 0),
      targetTemp: this.celsiusToFahrenheit(targetTemp || 0),
      humidity: humidityTrait?.ambientHumidityPercent,
      mode: this.mapNestMode(mode),
      hvacState: this.mapHvacStatus(hvacTrait?.status),
      metadata: { nestId: device.name },
    };
  }

  private mapNestMode(mode: string): ThermostatDevice['mode'] {
    const modeMap: Record<string, ThermostatDevice['mode']> = {
      HEAT: 'heat',
      COOL: 'cool',
      HEATCOOL: 'auto',
      OFF: 'off',
    };
    return modeMap[mode] || 'off';
  }

  private mapHvacStatus(status?: string): ThermostatDevice['hvacState'] {
    if (!status) return 'idle';
    const statusMap: Record<string, ThermostatDevice['hvacState']> = {
      HEATING: 'heating',
      COOLING: 'cooling',
      OFF: 'off',
    };
    return statusMap[status] || 'idle';
  }

  private celsiusToFahrenheit(celsius: number): number {
    return Math.round(celsius * 9 / 5 + 32);
  }

  private fahrenheitToCelsius(fahrenheit: number): number {
    return (fahrenheit - 32) * 5 / 9;
  }

  /**
   * Get all thermostats
   */
  getDevices(): ThermostatDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Set temperature
   */
  async setTemperature(deviceId: string, tempF: number): Promise<CommandResult> {
    const device = this.devices.get(deviceId);
    if (!device) {
      return { success: false, deviceId, command: 'set_temperature', error: 'Device not found' };
    }

    const nestId = device.metadata?.nestId as string;
    const tempC = this.fahrenheitToCelsius(tempF);

    try {
      const command = device.mode === 'heat'
        ? { 'sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat': { heatCelsius: tempC } }
        : { 'sdm.devices.commands.ThermostatTemperatureSetpoint.SetCool': { coolCelsius: tempC } };

      await this.api(`${nestId}:executeCommand`, 'POST', { command, params: {} });
      device.targetTemp = tempF;

      return { success: true, deviceId, command: 'set_temperature' };
    } catch (error) {
      return {
        success: false,
        deviceId,
        command: 'set_temperature',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Set HVAC mode
   */
  async setMode(deviceId: string, mode: ThermostatDevice['mode']): Promise<CommandResult> {
    const device = this.devices.get(deviceId);
    if (!device) {
      return { success: false, deviceId, command: 'set_mode', error: 'Device not found' };
    }

    const nestId = device.metadata?.nestId as string;
    const nestMode = mode === 'auto' ? 'HEATCOOL' : mode.toUpperCase();

    try {
      await this.api(`${nestId}:executeCommand`, 'POST', {
        command: 'sdm.devices.commands.ThermostatMode.SetMode',
        params: { mode: nestMode },
      });
      device.mode = mode;

      return { success: true, deviceId, command: 'set_mode' };
    } catch (error) {
      return {
        success: false,
        deviceId,
        command: 'set_mode',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Ecobee Integration
 */
export class EcobeeIntegration {
  private config: EcobeeConfig;
  private devices: Map<string, ThermostatDevice> = new Map();
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: EcobeeConfig) {
    this.config = config;
    this.accessToken = config.accessToken || null;
  }

  /**
   * Initialize Ecobee integration
   */
  async initialize(): Promise<boolean> {
    try {
      if (!this.accessToken || Date.now() >= this.tokenExpiry) {
        await this.refreshAccessToken();
      }
      await this.refreshDevices();
      return true;
    } catch (error) {
      console.error('Failed to initialize Ecobee:', error);
      return false;
    }
  }

  /**
   * Start PIN-based authorization
   */
  async requestPin(): Promise<{ pin: string; code: string }> {
    const response = await fetch(
      `https://api.ecobee.com/authorize?response_type=ecobeePin&client_id=${this.config.apiKey}&scope=smartWrite`
    );
    const result = (await response.json()) as { ecobeePin: string; code: string };
    return { pin: result.ecobeePin, code: result.code };
  }

  /**
   * Exchange PIN code for tokens
   */
  async exchangePin(code: string): Promise<void> {
    const response = await fetch('https://api.ecobee.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'ecobeePin',
        code,
        client_id: this.config.apiKey,
      }),
    });

    interface TokenResponse {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      error?: string;
      error_description?: string;
    }
    const tokens = (await response.json()) as TokenResponse;
    if (tokens.error) {
      throw new Error(`Token exchange failed: ${tokens.error_description}`);
    }

    this.accessToken = tokens.access_token;
    this.tokenExpiry = Date.now() + tokens.expires_in * 1000;
    this.config.refreshToken = tokens.refresh_token;
  }

  /**
   * Refresh access token
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.config.refreshToken) {
      throw new Error('No refresh token. Please authorize the app.');
    }

    const response = await fetch('https://api.ecobee.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.config.refreshToken,
        client_id: this.config.apiKey,
      }),
    });

    interface TokenResponse {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      error?: string;
      error_description?: string;
    }
    const tokens = (await response.json()) as TokenResponse;
    if (tokens.error) {
      throw new Error(`Token refresh failed: ${tokens.error_description}`);
    }

    this.accessToken = tokens.access_token;
    this.tokenExpiry = Date.now() + tokens.expires_in * 1000;
    this.config.refreshToken = tokens.refresh_token;
  }

  /**
   * Make API request
   */
  private async api<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown
  ): Promise<T> {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.refreshAccessToken();
    }

    const url = `https://api.ecobee.com/1${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`Ecobee API error: ${response.status}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Refresh all devices
   */
  async refreshDevices(): Promise<void> {
    const selection = {
      selectionType: 'registered',
      selectionMatch: '',
      includeRuntime: true,
      includeSettings: true,
      includeEquipmentStatus: true,
    };

    const result = await this.api<{ thermostatList: EcobeeThermostat[] }>(
      `/thermostat?format=json&body=${encodeURIComponent(JSON.stringify({ selection }))}`
    );

    this.devices.clear();
    for (const thermostat of result.thermostatList) {
      const parsed = this.parseDevice(thermostat);
      this.devices.set(parsed.id, parsed);
    }
  }

  /**
   * Parse Ecobee device to our format
   */
  private parseDevice(thermostat: EcobeeThermostat): ThermostatDevice {
    const runtime = thermostat.runtime;
    const settings = thermostat.settings;

    return {
      id: `ecobee_${thermostat.identifier}`,
      name: thermostat.name,
      type: 'thermostat',
      state: settings.hvacMode !== 'off' ? 'on' : 'off',
      reachable: thermostat.isRegistered,
      manufacturer: thermostat.brand || 'Ecobee',
      model: thermostat.modelNumber,
      capabilities: ['temperature', 'hvac_mode', 'humidity', 'fan'],
      currentTemp: runtime.actualTemperature / 10, // Ecobee uses 10x values
      targetTemp: settings.hvacMode === 'heat'
        ? runtime.desiredHeat / 10
        : runtime.desiredCool / 10,
      humidity: runtime.actualHumidity,
      mode: this.mapEcobeeMode(settings.hvacMode),
      hvacState: this.mapEquipmentStatus(thermostat.equipmentStatus),
      fanMode: settings.fanMinOnTime > 0 ? 'circulate' : 'auto',
      metadata: { ecobeeId: thermostat.identifier },
    };
  }

  private mapEcobeeMode(mode: string): ThermostatDevice['mode'] {
    const modeMap: Record<string, ThermostatDevice['mode']> = {
      heat: 'heat',
      cool: 'cool',
      auto: 'auto',
      off: 'off',
    };
    return modeMap[mode] || 'off';
  }

  private mapEquipmentStatus(status: string): ThermostatDevice['hvacState'] {
    if (status.includes('heatPump') || status.includes('auxHeat')) return 'heating';
    if (status.includes('compCool')) return 'cooling';
    return 'idle';
  }

  /**
   * Get all thermostats
   */
  getDevices(): ThermostatDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Set temperature
   */
  async setTemperature(deviceId: string, temp: number): Promise<CommandResult> {
    const device = this.devices.get(deviceId);
    if (!device) {
      return { success: false, deviceId, command: 'set_temperature', error: 'Device not found' };
    }

    const ecobeeId = device.metadata?.ecobeeId as string;

    try {
      const holdParams = device.mode === 'heat'
        ? { heatHoldTemp: temp * 10 }
        : { coolHoldTemp: temp * 10 };

      await this.api('/thermostat?format=json', 'POST', {
        selection: {
          selectionType: 'thermostats',
          selectionMatch: ecobeeId,
        },
        functions: [{
          type: 'setHold',
          params: {
            ...holdParams,
            holdType: 'nextTransition',
          },
        }],
      });

      device.targetTemp = temp;
      return { success: true, deviceId, command: 'set_temperature' };
    } catch (error) {
      return {
        success: false,
        deviceId,
        command: 'set_temperature',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Set HVAC mode
   */
  async setMode(deviceId: string, mode: ThermostatDevice['mode']): Promise<CommandResult> {
    const device = this.devices.get(deviceId);
    if (!device) {
      return { success: false, deviceId, command: 'set_mode', error: 'Device not found' };
    }

    const ecobeeId = device.metadata?.ecobeeId as string;

    try {
      await this.api('/thermostat?format=json', 'POST', {
        selection: {
          selectionType: 'thermostats',
          selectionMatch: ecobeeId,
        },
        thermostat: {
          settings: { hvacMode: mode },
        },
      });

      device.mode = mode;
      return { success: true, deviceId, command: 'set_mode' };
    } catch (error) {
      return {
        success: false,
        deviceId,
        command: 'set_mode',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Resume schedule
   */
  async resumeSchedule(deviceId: string): Promise<CommandResult> {
    const device = this.devices.get(deviceId);
    if (!device) {
      return { success: false, deviceId, command: 'resume_schedule', error: 'Device not found' };
    }

    const ecobeeId = device.metadata?.ecobeeId as string;

    try {
      await this.api('/thermostat?format=json', 'POST', {
        selection: {
          selectionType: 'thermostats',
          selectionMatch: ecobeeId,
        },
        functions: [{
          type: 'resumeProgram',
          params: { resumeAll: false },
        }],
      });

      return { success: true, deviceId, command: 'resume_schedule' };
    } catch (error) {
      return {
        success: false,
        deviceId,
        command: 'resume_schedule',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
