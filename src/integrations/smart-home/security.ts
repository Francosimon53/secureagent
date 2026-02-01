/**
 * Security Integration
 *
 * Support for Ring and Nest security cameras and alarms.
 */

import type {
  CameraDevice,
  AlarmDevice,
  CommandResult,
  DeviceEvent,
} from './types.js';
import type { RingConfig } from './config.js';

// Ring API types
interface RingDevice {
  id: number;
  description: string;
  device_id: string;
  time_zone: string;
  firmware_version: string;
  kind: string;
  latitude: number;
  longitude: number;
  address: string;
  settings: {
    doorbell_volume: number;
    motion_settings: {
      motion_detection_enabled: boolean;
    };
  };
  features: {
    motions_enabled: boolean;
    show_recordings: boolean;
  };
  owned: boolean;
  alerts: {
    connection: string;
    battery: string;
  };
  battery_life: number | string;
  location_id: string;
}

interface RingLocation {
  location_id: string;
  name: string;
  devices: {
    doorbots?: RingDevice[];
    stickup_cams?: RingDevice[];
    base_stations?: RingAlarmDevice[];
  };
}

interface RingAlarmDevice {
  id: number;
  location_id: string;
  kind: string;
  name: string;
  mode: string;
  device_id: string;
  firmware_version: string;
}

interface RingSnapshot {
  timestamp: number;
  image: string; // Base64
}

type EventCallback = (event: DeviceEvent) => void;

/**
 * Ring Integration
 */
export class RingIntegration {
  private config: RingConfig;
  private cameras: Map<string, CameraDevice> = new Map();
  private alarms: Map<string, AlarmDevice> = new Map();
  private accessToken: string | null = null;
  private refreshToken: string;
  private eventCallbacks: EventCallback[] = [];
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: RingConfig) {
    this.config = config;
    this.refreshToken = config.refreshToken;
  }

  /**
   * Initialize Ring integration
   */
  async initialize(): Promise<boolean> {
    try {
      await this.authenticate();
      await this.refreshDevices();
      this.startPolling();
      return true;
    } catch (error) {
      console.error('Failed to initialize Ring:', error);
      return false;
    }
  }

  /**
   * Authenticate with Ring
   */
  private async authenticate(): Promise<void> {
    const response = await fetch('https://oauth.ring.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: 'ring_official_android',
        scope: 'client',
      }),
    });

    if (!response.ok) {
      throw new Error('Ring authentication failed');
    }

    const tokens = (await response.json()) as { access_token: string; refresh_token: string };
    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token;
  }

  /**
   * Make API request
   */
  private async api<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' = 'GET',
    body?: unknown
  ): Promise<T> {
    if (!this.accessToken) {
      await this.authenticate();
    }

    const url = `https://api.ring.com/clients_api${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': this.config.controlCenterDisplayName,
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (response.status === 401) {
      await this.authenticate();
      return this.api(endpoint, method, body);
    }

    if (!response.ok) {
      throw new Error(`Ring API error: ${response.status}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Refresh all devices
   */
  async refreshDevices(): Promise<void> {
    const locations = await this.api<RingLocation[]>('/ring_devices/v2');

    this.cameras.clear();
    this.alarms.clear();

    for (const location of locations) {
      // Parse doorbells
      if (location.devices.doorbots) {
        for (const device of location.devices.doorbots) {
          this.cameras.set(`ring_${device.id}`, this.parseCamera(device, 'doorbell'));
        }
      }

      // Parse stickup cams
      if (location.devices.stickup_cams) {
        for (const device of location.devices.stickup_cams) {
          this.cameras.set(`ring_${device.id}`, this.parseCamera(device, 'camera'));
        }
      }

      // Parse alarm base stations
      if (location.devices.base_stations) {
        for (const device of location.devices.base_stations) {
          this.alarms.set(`ring_alarm_${device.id}`, this.parseAlarm(device));
        }
      }
    }
  }

  /**
   * Parse Ring camera to our format
   */
  private parseCamera(device: RingDevice, type: 'doorbell' | 'camera'): CameraDevice {
    const batteryLife = typeof device.battery_life === 'string'
      ? parseInt(device.battery_life, 10)
      : device.battery_life;

    return {
      id: `ring_${device.id}`,
      name: device.description,
      type: 'camera',
      state: 'on',
      reachable: device.alerts.connection !== 'offline',
      manufacturer: 'Ring',
      model: device.kind,
      capabilities: ['view', 'snapshot', 'motion_detection', 'two_way_audio'],
      recording: device.features.show_recordings,
      motionDetected: false,
      audioEnabled: true,
      nightVision: true,
      metadata: {
        ringId: device.id,
        deviceId: device.device_id,
        type,
        batteryLevel: batteryLife,
        locationId: device.location_id,
      },
    };
  }

  /**
   * Parse Ring alarm to our format
   */
  private parseAlarm(device: RingAlarmDevice): AlarmDevice {
    const armModeMap: Record<string, AlarmDevice['armMode']> = {
      all: 'away',
      some: 'home',
      none: 'disarmed',
    };

    return {
      id: `ring_alarm_${device.id}`,
      name: device.name || 'Ring Alarm',
      type: 'alarm',
      state: device.mode !== 'none' ? 'on' : 'off',
      reachable: true,
      manufacturer: 'Ring',
      model: device.kind,
      capabilities: ['arm', 'disarm'],
      armed: device.mode !== 'none',
      armMode: armModeMap[device.mode] || 'disarmed',
      triggered: false,
      entryDelay: 30,
      exitDelay: 60,
      metadata: {
        ringId: device.id,
        locationId: device.location_id,
      },
    };
  }

  /**
   * Start polling for events
   */
  private startPolling(): void {
    if (this.pollingInterval) return;

    this.pollingInterval = setInterval(async () => {
      try {
        await this.checkForEvents();
      } catch (error) {
        console.error('Ring polling error:', error);
      }
    }, 10000); // Poll every 10 seconds
  }

  /**
   * Check for new events
   */
  private async checkForEvents(): Promise<void> {
    const events = await this.api<Array<{
      id: number;
      created_at: string;
      answered: boolean;
      events: Array<{ event_type: string }>;
      favorite: boolean;
      snapshot_url: string;
      doorbot: { id: number; description: string };
    }>>('/dings/active');

    for (const event of events) {
      const deviceId = `ring_${event.doorbot.id}`;
      const camera = this.cameras.get(deviceId);

      if (camera) {
        camera.motionDetected = true;

        // Notify callbacks
        this.eventCallbacks.forEach((cb) => cb({
          type: 'motion_detected',
          deviceId,
          timestamp: new Date(event.created_at).getTime(),
          data: { snapshotUrl: event.snapshot_url },
        }));

        // Reset motion after 30 seconds
        setTimeout(() => {
          if (camera) camera.motionDetected = false;
        }, 30000);
      }
    }
  }

  /**
   * Subscribe to events
   */
  onEvent(callback: EventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      const idx = this.eventCallbacks.indexOf(callback);
      if (idx !== -1) this.eventCallbacks.splice(idx, 1);
    };
  }

  /**
   * Get all cameras
   */
  getCameras(): CameraDevice[] {
    return Array.from(this.cameras.values());
  }

  /**
   * Get all alarms
   */
  getAlarms(): AlarmDevice[] {
    return Array.from(this.alarms.values());
  }

  /**
   * Get camera snapshot
   */
  async getSnapshot(cameraId: string): Promise<string | null> {
    const ringId = cameraId.replace('ring_', '');

    try {
      // Request new snapshot
      await this.api(`/snapshots/next/${ringId}`, 'PUT');

      // Wait for snapshot to be available
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get snapshot URL
      const result = await this.api<{ url: string }>(`/snapshots/image/${ringId}`);
      return result.url;
    } catch (error) {
      console.error('Failed to get snapshot:', error);
      return null;
    }
  }

  /**
   * Get live stream URL
   */
  async getLiveStream(cameraId: string): Promise<string | null> {
    const ringId = cameraId.replace('ring_', '');

    try {
      const result = await this.api<{ url: string }>(
        `/doorbots/${ringId}/vod`,
        'POST'
      );
      return result.url;
    } catch (error) {
      console.error('Failed to get live stream:', error);
      return null;
    }
  }

  /**
   * Enable/disable motion detection
   */
  async setMotionDetection(cameraId: string, enabled: boolean): Promise<CommandResult> {
    const ringId = cameraId.replace('ring_', '');

    try {
      await this.api(`/doorbots/${ringId}`, 'PATCH', {
        doorbot: {
          settings: {
            motion_settings: {
              motion_detection_enabled: enabled,
            },
          },
        },
      });

      return { success: true, deviceId: cameraId, command: 'set_motion_detection' };
    } catch (error) {
      return {
        success: false,
        deviceId: cameraId,
        command: 'set_motion_detection',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Arm alarm
   */
  async armAlarm(alarmId: string, mode: 'away' | 'home'): Promise<CommandResult> {
    const alarm = this.alarms.get(alarmId);
    if (!alarm) {
      return { success: false, deviceId: alarmId, command: 'arm_alarm', error: 'Alarm not found' };
    }

    const locationId = alarm.metadata?.locationId as string;
    const armMode = mode === 'away' ? 'all' : 'some';

    try {
      await this.api(`/locations/${locationId}/security-controls`, 'POST', {
        mode: armMode,
      });

      alarm.armed = true;
      alarm.armMode = mode;
      alarm.state = 'on';

      return { success: true, deviceId: alarmId, command: 'arm_alarm' };
    } catch (error) {
      return {
        success: false,
        deviceId: alarmId,
        command: 'arm_alarm',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Disarm alarm
   */
  async disarmAlarm(alarmId: string): Promise<CommandResult> {
    const alarm = this.alarms.get(alarmId);
    if (!alarm) {
      return { success: false, deviceId: alarmId, command: 'disarm_alarm', error: 'Alarm not found' };
    }

    const locationId = alarm.metadata?.locationId as string;

    try {
      await this.api(`/locations/${locationId}/security-controls`, 'POST', {
        mode: 'none',
      });

      alarm.armed = false;
      alarm.armMode = 'disarmed';
      alarm.state = 'off';

      return { success: true, deviceId: alarmId, command: 'disarm_alarm' };
    } catch (error) {
      return {
        success: false,
        deviceId: alarmId,
        command: 'disarm_alarm',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Trigger alarm siren (panic)
   */
  async triggerSiren(alarmId: string): Promise<CommandResult> {
    const alarm = this.alarms.get(alarmId);
    if (!alarm) {
      return { success: false, deviceId: alarmId, command: 'trigger_siren', error: 'Alarm not found' };
    }

    const locationId = alarm.metadata?.locationId as string;

    try {
      await this.api(`/locations/${locationId}/devices/alarm-base-station/panic`, 'POST');
      alarm.triggered = true;

      return { success: true, deviceId: alarmId, command: 'trigger_siren' };
    } catch (error) {
      return {
        success: false,
        deviceId: alarmId,
        command: 'trigger_siren',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get recent motion events
   */
  async getRecentEvents(cameraId: string, limit = 20): Promise<Array<{
    id: string;
    timestamp: number;
    type: string;
    snapshotUrl?: string;
  }>> {
    const ringId = cameraId.replace('ring_', '');

    try {
      const history = await this.api<Array<{
        id: number;
        created_at: string;
        kind: string;
        answered: boolean;
        snapshot_url?: string;
      }>>(`/doorbots/${ringId}/history?limit=${limit}`);

      return history.map((event) => ({
        id: String(event.id),
        timestamp: new Date(event.created_at).getTime(),
        type: event.kind,
        snapshotUrl: event.snapshot_url,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Stop polling and cleanup
   */
  disconnect(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.eventCallbacks = [];
  }
}

/**
 * Generic IP Camera Integration
 * For cameras that support RTSP/ONVIF
 */
export class IPCameraIntegration {
  private cameras: Map<string, CameraDevice & { rtspUrl: string }> = new Map();

  /**
   * Add an IP camera
   */
  addCamera(config: {
    id: string;
    name: string;
    rtspUrl: string;
    snapshotUrl?: string;
    username?: string;
    password?: string;
  }): void {
    const { id, name, rtspUrl, snapshotUrl } = config;

    this.cameras.set(id, {
      id: `ipcam_${id}`,
      name,
      type: 'camera',
      state: 'on',
      reachable: true,
      capabilities: ['view', 'snapshot'],
      recording: false,
      motionDetected: false,
      rtspUrl,
      streamUrl: rtspUrl,
      snapshotUrl,
    });
  }

  /**
   * Get all cameras
   */
  getCameras(): CameraDevice[] {
    return Array.from(this.cameras.values());
  }

  /**
   * Get camera stream URL
   */
  getStreamUrl(cameraId: string): string | null {
    const camera = this.cameras.get(cameraId.replace('ipcam_', ''));
    return camera?.rtspUrl || null;
  }

  /**
   * Get camera snapshot
   */
  async getSnapshot(cameraId: string): Promise<string | null> {
    const camera = this.cameras.get(cameraId.replace('ipcam_', ''));
    return camera?.snapshotUrl || null;
  }

  /**
   * Remove a camera
   */
  removeCamera(cameraId: string): void {
    this.cameras.delete(cameraId.replace('ipcam_', ''));
  }
}
