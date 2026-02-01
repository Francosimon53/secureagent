/**
 * Home Assistant Integration
 *
 * Control devices via Home Assistant REST API and WebSocket.
 */

import type {
  SmartDevice,
  LightDevice,
  ThermostatDevice,
  LockDevice,
  SensorDevice,
  AlarmDevice,
  PlugDevice,
  CommandResult,
  DeviceType,
} from './types';
import type { HomeAssistantConfig } from './config';

// Home Assistant API types
interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

interface HAService {
  domain: string;
  services: Record<string, {
    name: string;
    description: string;
    fields: Record<string, unknown>;
  }>;
}

interface HAEvent {
  event_type: string;
  data: {
    entity_id: string;
    old_state?: HAState;
    new_state?: HAState;
  };
}

type WebSocketCallback = (event: HAEvent) => void;

export class HomeAssistantIntegration {
  private config: HomeAssistantConfig;
  private devices: Map<string, SmartDevice> = new Map();
  private ws: WebSocket | null = null;
  private wsCallbacks: Map<string, WebSocketCallback[]> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageId = 0;

  constructor(config: HomeAssistantConfig) {
    this.config = config;
  }

  /**
   * Initialize connection to Home Assistant
   */
  async initialize(): Promise<boolean> {
    try {
      // Test REST API connection
      const config = await this.api<{ version: string }>('/api/config');
      console.log(`Connected to Home Assistant ${config.version}`);

      // Load initial states
      await this.refreshDevices();

      // Connect WebSocket if enabled
      if (this.config.useWebSocket) {
        await this.connectWebSocket();
      }

      return true;
    } catch (error) {
      console.error('Failed to initialize Home Assistant:', error);
      return false;
    }
  }

  /**
   * Make REST API request
   */
  private async api<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown
  ): Promise<T> {
    const url = `${this.config.url}${endpoint}`;
    const headers: HeadersInit = {
      'Authorization': `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`Home Assistant API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Connect WebSocket for real-time updates
   */
  private async connectWebSocket(): Promise<void> {
    const wsUrl = this.config.url.replace(/^http/, 'ws') + '/api/websocket';

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('Home Assistant WebSocket connected');
      };

      this.ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'auth_required':
            this.ws?.send(JSON.stringify({
              type: 'auth',
              access_token: this.config.accessToken,
            }));
            break;

          case 'auth_ok':
            // Subscribe to state changes
            this.ws?.send(JSON.stringify({
              id: ++this.messageId,
              type: 'subscribe_events',
              event_type: 'state_changed',
            }));
            resolve();
            break;

          case 'auth_invalid':
            reject(new Error('Invalid Home Assistant access token'));
            break;

          case 'event':
            this.handleEvent(message.event);
            break;
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed, reconnecting...');
        this.scheduleReconnect();
      };
    });
  }

  /**
   * Schedule WebSocket reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connectWebSocket();
      } catch (error) {
        console.error('Reconnection failed:', error);
        this.scheduleReconnect();
      }
    }, 5000);
  }

  /**
   * Handle WebSocket event
   */
  private handleEvent(event: HAEvent): void {
    if (event.event_type === 'state_changed' && event.data.new_state) {
      const entityId = event.data.entity_id;
      const state = event.data.new_state;

      // Update local device state
      const device = this.devices.get(entityId);
      if (device) {
        const updated = this.parseState(state);
        if (updated) {
          this.devices.set(entityId, updated);
        }
      }

      // Notify callbacks
      const callbacks = this.wsCallbacks.get(entityId) || [];
      for (const callback of callbacks) {
        callback(event);
      }
    }
  }

  /**
   * Subscribe to entity state changes
   */
  subscribe(entityId: string, callback: WebSocketCallback): () => void {
    const callbacks = this.wsCallbacks.get(entityId) || [];
    callbacks.push(callback);
    this.wsCallbacks.set(entityId, callbacks);

    return () => {
      const idx = callbacks.indexOf(callback);
      if (idx !== -1) callbacks.splice(idx, 1);
    };
  }

  /**
   * Refresh all devices from Home Assistant
   */
  async refreshDevices(): Promise<void> {
    const states = await this.api<HAState[]>('/api/states');

    this.devices.clear();
    for (const state of states) {
      const device = this.parseState(state);
      if (device) {
        this.devices.set(state.entity_id, device);
      }
    }
  }

  /**
   * Parse Home Assistant state to our device format
   */
  private parseState(state: HAState): SmartDevice | null {
    const [domain] = state.entity_id.split('.');
    const attrs = state.attributes;

    const baseDevice = {
      id: state.entity_id,
      name: (attrs.friendly_name as string) || state.entity_id,
      reachable: state.state !== 'unavailable',
      lastSeen: new Date(state.last_updated).getTime(),
      metadata: { haEntityId: state.entity_id },
    };

    switch (domain) {
      case 'light':
        return this.parseLightState(state, baseDevice);
      case 'switch':
      case 'input_boolean':
        return this.parseSwitchState(state, baseDevice);
      case 'climate':
        return this.parseThermostatState(state, baseDevice);
      case 'lock':
        return this.parseLockState(state, baseDevice);
      case 'sensor':
      case 'binary_sensor':
        return this.parseSensorState(state, baseDevice);
      case 'alarm_control_panel':
        return this.parseAlarmState(state, baseDevice);
      case 'camera':
        return {
          ...baseDevice,
          type: 'camera' as const,
          state: state.state === 'idle' ? 'on' : 'off',
          capabilities: ['view'],
          streamUrl: attrs.stream_url as string | undefined,
          snapshotUrl: `/api/camera_proxy/${state.entity_id}`,
          recording: state.state === 'recording',
          motionDetected: false,
        };
      default:
        return null;
    }
  }

  private parseLightState(state: HAState, base: Partial<LightDevice>): LightDevice {
    const attrs = state.attributes;
    const capabilities: string[] = ['on_off'];

    if (attrs.brightness !== undefined) capabilities.push('brightness');
    if (attrs.color_temp !== undefined) capabilities.push('color_temp');
    if (attrs.hs_color !== undefined || attrs.rgb_color !== undefined) {
      capabilities.push('color');
    }

    const hsColor = attrs.hs_color as [number, number] | undefined;
    const rgbColor = attrs.rgb_color as [number, number, number] | undefined;

    return {
      ...base,
      type: 'light',
      state: state.state === 'on' ? 'on' : 'off',
      capabilities,
      brightness: attrs.brightness ? Math.round((attrs.brightness as number) / 255 * 100) : undefined,
      colorTemp: attrs.color_temp ? this.miredToKelvin(attrs.color_temp as number) : undefined,
      color: hsColor ? { hue: hsColor[0], saturation: hsColor[1] } : undefined,
      rgb: rgbColor ? { r: rgbColor[0], g: rgbColor[1], b: rgbColor[2] } : undefined,
    } as LightDevice;
  }

  private parseSwitchState(state: HAState, base: Partial<PlugDevice>): PlugDevice {
    return {
      ...base,
      type: 'switch',
      state: state.state === 'on' ? 'on' : 'off',
      capabilities: ['on_off'],
    } as PlugDevice;
  }

  private parseThermostatState(state: HAState, base: Partial<ThermostatDevice>): ThermostatDevice {
    const attrs = state.attributes;
    return {
      ...base,
      type: 'thermostat',
      state: state.state !== 'off' ? 'on' : 'off',
      capabilities: ['temperature', 'hvac_mode'],
      currentTemp: attrs.current_temperature as number,
      targetTemp: attrs.temperature as number,
      humidity: attrs.current_humidity as number | undefined,
      mode: this.mapHvacMode(state.state),
      fanMode: attrs.fan_mode as 'auto' | 'on' | 'circulate' | undefined,
      hvacState: attrs.hvac_action as 'heating' | 'cooling' | 'idle' | 'off' | undefined,
    } as ThermostatDevice;
  }

  private parseLockState(state: HAState, base: Partial<LockDevice>): LockDevice {
    return {
      ...base,
      type: 'lock',
      state: state.state === 'locked' ? 'on' : 'off',
      capabilities: ['lock'],
      locked: state.state === 'locked',
      batteryLevel: state.attributes.battery_level as number | undefined,
    } as LockDevice;
  }

  private parseSensorState(state: HAState, base: Partial<SensorDevice>): SensorDevice {
    const attrs = state.attributes;
    const deviceClass = attrs.device_class as string || 'unknown';

    const sensorTypeMap: Record<string, SensorDevice['sensorType']> = {
      temperature: 'temperature',
      humidity: 'humidity',
      motion: 'motion',
      door: 'contact',
      window: 'contact',
      smoke: 'smoke',
      carbon_monoxide: 'co',
      moisture: 'water',
    };

    return {
      ...base,
      type: 'sensor',
      state: state.state === 'on' || state.state === 'detected' ? 'on' : 'off',
      capabilities: ['read'],
      sensorType: sensorTypeMap[deviceClass] || 'temperature',
      value: isNaN(Number(state.state)) ? state.state === 'on' : Number(state.state),
      unit: attrs.unit_of_measurement as string | undefined,
      batteryLevel: attrs.battery_level as number | undefined,
    } as SensorDevice;
  }

  private parseAlarmState(state: HAState, base: Partial<AlarmDevice>): AlarmDevice {
    const armModeMap: Record<string, AlarmDevice['armMode']> = {
      armed_away: 'away',
      armed_home: 'home',
      armed_night: 'night',
      disarmed: 'disarmed',
    };

    return {
      ...base,
      type: 'alarm',
      state: state.state !== 'disarmed' ? 'on' : 'off',
      capabilities: ['arm', 'disarm'],
      armed: state.state !== 'disarmed',
      armMode: armModeMap[state.state] || 'disarmed',
      triggered: state.state === 'triggered',
    } as AlarmDevice;
  }

  private mapHvacMode(mode: string): ThermostatDevice['mode'] {
    const modeMap: Record<string, ThermostatDevice['mode']> = {
      heat: 'heat',
      cool: 'cool',
      heat_cool: 'auto',
      auto: 'auto',
      off: 'off',
    };
    return modeMap[mode] || 'off';
  }

  private miredToKelvin(mired: number): number {
    return Math.round(1000000 / mired);
  }

  /**
   * Get all devices
   */
  getDevices(): SmartDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get device by ID
   */
  getDevice(entityId: string): SmartDevice | undefined {
    return this.devices.get(entityId);
  }

  /**
   * Call a Home Assistant service
   */
  async callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>
  ): Promise<CommandResult> {
    try {
      await this.api(`/api/services/${domain}/${service}`, 'POST', data);
      return {
        success: true,
        deviceId: data?.entity_id as string || 'all',
        command: `${domain}.${service}`,
      };
    } catch (error) {
      return {
        success: false,
        deviceId: data?.entity_id as string || 'all',
        command: `${domain}.${service}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Turn device on
   */
  async turnOn(entityId: string): Promise<CommandResult> {
    const [domain] = entityId.split('.');
    return this.callService(domain, 'turn_on', { entity_id: entityId });
  }

  /**
   * Turn device off
   */
  async turnOff(entityId: string): Promise<CommandResult> {
    const [domain] = entityId.split('.');
    return this.callService(domain, 'turn_off', { entity_id: entityId });
  }

  /**
   * Toggle device
   */
  async toggle(entityId: string): Promise<CommandResult> {
    const [domain] = entityId.split('.');
    return this.callService(domain, 'toggle', { entity_id: entityId });
  }

  /**
   * Set light brightness
   */
  async setLightBrightness(entityId: string, brightness: number): Promise<CommandResult> {
    return this.callService('light', 'turn_on', {
      entity_id: entityId,
      brightness_pct: Math.max(0, Math.min(100, brightness)),
    });
  }

  /**
   * Set light color
   */
  async setLightColor(entityId: string, hue: number, saturation: number): Promise<CommandResult> {
    return this.callService('light', 'turn_on', {
      entity_id: entityId,
      hs_color: [hue, saturation],
    });
  }

  /**
   * Set light RGB
   */
  async setLightRGB(entityId: string, r: number, g: number, b: number): Promise<CommandResult> {
    return this.callService('light', 'turn_on', {
      entity_id: entityId,
      rgb_color: [r, g, b],
    });
  }

  /**
   * Set thermostat temperature
   */
  async setTemperature(entityId: string, temperature: number): Promise<CommandResult> {
    return this.callService('climate', 'set_temperature', {
      entity_id: entityId,
      temperature,
    });
  }

  /**
   * Set thermostat mode
   */
  async setHvacMode(entityId: string, mode: string): Promise<CommandResult> {
    return this.callService('climate', 'set_hvac_mode', {
      entity_id: entityId,
      hvac_mode: mode,
    });
  }

  /**
   * Lock a lock
   */
  async lock(entityId: string): Promise<CommandResult> {
    return this.callService('lock', 'lock', { entity_id: entityId });
  }

  /**
   * Unlock a lock
   */
  async unlock(entityId: string): Promise<CommandResult> {
    return this.callService('lock', 'unlock', { entity_id: entityId });
  }

  /**
   * Arm alarm
   */
  async armAlarm(entityId: string, mode: 'away' | 'home' | 'night'): Promise<CommandResult> {
    const serviceMap: Record<string, string> = {
      away: 'alarm_arm_away',
      home: 'alarm_arm_home',
      night: 'alarm_arm_night',
    };
    return this.callService('alarm_control_panel', serviceMap[mode], { entity_id: entityId });
  }

  /**
   * Disarm alarm
   */
  async disarmAlarm(entityId: string, code?: string): Promise<CommandResult> {
    return this.callService('alarm_control_panel', 'alarm_disarm', {
      entity_id: entityId,
      code,
    });
  }

  /**
   * Run an automation
   */
  async runAutomation(automationId: string): Promise<CommandResult> {
    return this.callService('automation', 'trigger', {
      entity_id: automationId,
    });
  }

  /**
   * Run a script
   */
  async runScript(scriptId: string): Promise<CommandResult> {
    return this.callService('script', 'turn_on', {
      entity_id: scriptId,
    });
  }

  /**
   * Get available services
   */
  async getServices(): Promise<HAService[]> {
    return this.api<HAService[]>('/api/services');
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
