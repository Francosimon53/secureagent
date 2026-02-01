/**
 * Philips Hue Integration
 *
 * Control Philips Hue lights via the Hue Bridge.
 */

import type {
  LightDevice,
  Room,
  Scene,
  CommandResult,
  DiscoveredDevice,
} from './types';
import type { HueConfig } from './config';

// Hue API types
interface HueBridge {
  id: string;
  internalipaddress: string;
  name?: string;
}

interface HueLight {
  state: {
    on: boolean;
    bri: number;
    hue?: number;
    sat?: number;
    ct?: number;
    effect?: string;
    reachable: boolean;
  };
  type: string;
  name: string;
  modelid: string;
  manufacturername: string;
  uniqueid: string;
}

interface HueGroup {
  name: string;
  lights: string[];
  type: string;
  action: {
    on: boolean;
    bri: number;
  };
}

interface HueScene {
  name: string;
  lights: string[];
  type: string;
}

export class PhilipsHueIntegration {
  private config: HueConfig;
  private bridgeIp: string | null = null;
  private username: string | null = null;
  private lights: Map<string, LightDevice> = new Map();
  private rooms: Map<string, Room> = new Map();
  private scenes: Map<string, Scene> = new Map();

  constructor(config: HueConfig) {
    this.config = config;
    this.bridgeIp = config.bridgeIp || null;
    this.username = config.username || null;
  }

  /**
   * Initialize and connect to Hue Bridge
   */
  async initialize(): Promise<boolean> {
    try {
      // Discover bridge if not configured
      if (!this.bridgeIp && this.config.autoDiscover) {
        const bridges = await this.discoverBridges();
        if (bridges.length > 0) {
          this.bridgeIp = bridges[0].internalipaddress;
        }
      }

      if (!this.bridgeIp) {
        throw new Error('No Hue Bridge found. Please configure bridge IP manually.');
      }

      // Check if we need to pair
      if (!this.username) {
        throw new Error('Hue Bridge not paired. Call pairBridge() to create a new user.');
      }

      // Verify connection
      await this.refreshDevices();
      return true;
    } catch (error) {
      console.error('Failed to initialize Hue:', error);
      return false;
    }
  }

  /**
   * Discover Hue bridges on the network
   */
  async discoverBridges(): Promise<HueBridge[]> {
    try {
      const response = await fetch('https://discovery.meethue.com/');
      if (!response.ok) throw new Error('Discovery failed');
      return await response.json();
    } catch (error) {
      console.error('Bridge discovery failed:', error);
      return [];
    }
  }

  /**
   * Pair with Hue Bridge (requires pressing bridge button)
   */
  async pairBridge(): Promise<{ username: string; clientKey?: string } | null> {
    if (!this.bridgeIp) {
      throw new Error('Bridge IP not set');
    }

    try {
      const response = await fetch(`http://${this.bridgeIp}/api`, {
        method: 'POST',
        body: JSON.stringify({
          devicetype: 'secureagent#device',
          generateclientkey: true,
        }),
      });

      const result = await response.json();

      if (result[0]?.error) {
        if (result[0].error.type === 101) {
          throw new Error('Press the link button on your Hue Bridge and try again');
        }
        throw new Error(result[0].error.description);
      }

      if (result[0]?.success) {
        this.username = result[0].success.username;
        return {
          username: result[0].success.username,
          clientKey: result[0].success.clientkey,
        };
      }

      return null;
    } catch (error) {
      console.error('Bridge pairing failed:', error);
      throw error;
    }
  }

  /**
   * Make API request to Hue Bridge
   */
  private async api<T>(
    endpoint: string,
    method: 'GET' | 'PUT' | 'POST' | 'DELETE' = 'GET',
    body?: unknown
  ): Promise<T> {
    if (!this.bridgeIp || !this.username) {
      throw new Error('Hue not configured');
    }

    const url = `http://${this.bridgeIp}/api/${this.username}${endpoint}`;
    const options: RequestInit = { method };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const result = await response.json();

    // Check for errors in response
    if (Array.isArray(result) && result[0]?.error) {
      throw new Error(result[0].error.description);
    }

    return result;
  }

  /**
   * Refresh all devices from bridge
   */
  async refreshDevices(): Promise<void> {
    const [lightsData, groupsData, scenesData] = await Promise.all([
      this.api<Record<string, HueLight>>('/lights'),
      this.api<Record<string, HueGroup>>('/groups'),
      this.api<Record<string, HueScene>>('/scenes'),
    ]);

    // Parse lights
    this.lights.clear();
    for (const [id, light] of Object.entries(lightsData)) {
      this.lights.set(id, this.parseLight(id, light));
    }

    // Parse rooms/groups
    this.rooms.clear();
    for (const [id, group] of Object.entries(groupsData)) {
      if (group.type === 'Room') {
        this.rooms.set(id, {
          id: `hue_room_${id}`,
          name: group.name,
          devices: group.lights.map((l) => `hue_${l}`),
        });
      }
    }

    // Parse scenes
    this.scenes.clear();
    for (const [id, scene] of Object.entries(scenesData)) {
      this.scenes.set(id, {
        id: `hue_scene_${id}`,
        name: scene.name,
        actions: scene.lights.map((lightId) => ({
          deviceId: `hue_${lightId}`,
          action: 'scene',
          params: { sceneId: id },
        })),
        createdAt: Date.now(),
      });
    }
  }

  /**
   * Parse Hue light to our format
   */
  private parseLight(id: string, light: HueLight): LightDevice {
    const capabilities: string[] = ['on_off', 'brightness'];

    if (light.state.hue !== undefined) {
      capabilities.push('color');
    }
    if (light.state.ct !== undefined) {
      capabilities.push('color_temp');
    }
    if (light.state.effect !== undefined) {
      capabilities.push('effects');
    }

    return {
      id: `hue_${id}`,
      name: light.name,
      type: 'light',
      state: light.state.on ? 'on' : 'off',
      reachable: light.state.reachable,
      manufacturer: light.manufacturername,
      model: light.modelid,
      capabilities,
      brightness: Math.round((light.state.bri / 254) * 100),
      colorTemp: light.state.ct ? this.miredToKelvin(light.state.ct) : undefined,
      color: light.state.hue !== undefined ? {
        hue: Math.round((light.state.hue / 65535) * 360),
        saturation: Math.round((light.state.sat! / 254) * 100),
      } : undefined,
      effect: light.state.effect,
      metadata: { hueId: id },
    };
  }

  /**
   * Convert mired to Kelvin
   */
  private miredToKelvin(mired: number): number {
    return Math.round(1000000 / mired);
  }

  /**
   * Convert Kelvin to mired
   */
  private kelvinToMired(kelvin: number): number {
    return Math.round(1000000 / kelvin);
  }

  /**
   * Get all lights
   */
  getLights(): LightDevice[] {
    return Array.from(this.lights.values());
  }

  /**
   * Get all rooms
   */
  getRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Get all scenes
   */
  getScenes(): Scene[] {
    return Array.from(this.scenes.values());
  }

  /**
   * Turn light on
   */
  async turnOn(lightId: string): Promise<CommandResult> {
    const hueId = lightId.replace('hue_', '');
    try {
      await this.api(`/lights/${hueId}/state`, 'PUT', { on: true });
      const light = this.lights.get(hueId);
      if (light) {
        light.state = 'on';
      }
      return { success: true, deviceId: lightId, command: 'turn_on' };
    } catch (error) {
      return {
        success: false,
        deviceId: lightId,
        command: 'turn_on',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Turn light off
   */
  async turnOff(lightId: string): Promise<CommandResult> {
    const hueId = lightId.replace('hue_', '');
    try {
      await this.api(`/lights/${hueId}/state`, 'PUT', { on: false });
      const light = this.lights.get(hueId);
      if (light) {
        light.state = 'off';
      }
      return { success: true, deviceId: lightId, command: 'turn_off' };
    } catch (error) {
      return {
        success: false,
        deviceId: lightId,
        command: 'turn_off',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Set light brightness (0-100)
   */
  async setBrightness(lightId: string, brightness: number): Promise<CommandResult> {
    const hueId = lightId.replace('hue_', '');
    const bri = Math.round((Math.max(0, Math.min(100, brightness)) / 100) * 254);

    try {
      await this.api(`/lights/${hueId}/state`, 'PUT', { on: true, bri });
      const light = this.lights.get(hueId);
      if (light) {
        light.brightness = brightness;
        light.state = 'on';
      }
      return { success: true, deviceId: lightId, command: 'set_brightness' };
    } catch (error) {
      return {
        success: false,
        deviceId: lightId,
        command: 'set_brightness',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Set light color temperature (2000-6500K)
   */
  async setColorTemp(lightId: string, kelvin: number): Promise<CommandResult> {
    const hueId = lightId.replace('hue_', '');
    const ct = this.kelvinToMired(Math.max(2000, Math.min(6500, kelvin)));

    try {
      await this.api(`/lights/${hueId}/state`, 'PUT', { on: true, ct });
      const light = this.lights.get(hueId);
      if (light) {
        light.colorTemp = kelvin;
        light.state = 'on';
      }
      return { success: true, deviceId: lightId, command: 'set_color_temp' };
    } catch (error) {
      return {
        success: false,
        deviceId: lightId,
        command: 'set_color_temp',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Set light color (hue 0-360, saturation 0-100)
   */
  async setColor(lightId: string, hue: number, saturation: number): Promise<CommandResult> {
    const hueId = lightId.replace('hue_', '');
    const hueValue = Math.round((hue / 360) * 65535);
    const sat = Math.round((saturation / 100) * 254);

    try {
      await this.api(`/lights/${hueId}/state`, 'PUT', { on: true, hue: hueValue, sat });
      const light = this.lights.get(hueId);
      if (light) {
        light.color = { hue, saturation };
        light.state = 'on';
      }
      return { success: true, deviceId: lightId, command: 'set_color' };
    } catch (error) {
      return {
        success: false,
        deviceId: lightId,
        command: 'set_color',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Set light RGB color
   */
  async setRGB(lightId: string, r: number, g: number, b: number): Promise<CommandResult> {
    // Convert RGB to HSV for Hue API
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max / 255;

    if (d !== 0) {
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return this.setColor(lightId, h * 360, s * 100);
  }

  /**
   * Activate a scene
   */
  async activateScene(sceneId: string): Promise<CommandResult> {
    const hueSceneId = sceneId.replace('hue_scene_', '');

    try {
      // Find the group for this scene and apply
      await this.api('/groups/0/action', 'PUT', { scene: hueSceneId });
      return { success: true, deviceId: sceneId, command: 'activate_scene' };
    } catch (error) {
      return {
        success: false,
        deviceId: sceneId,
        command: 'activate_scene',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Control all lights in a room
   */
  async setRoomState(roomId: string, on: boolean, brightness?: number): Promise<CommandResult[]> {
    const room = this.rooms.get(roomId.replace('hue_room_', ''));
    if (!room) {
      return [{ success: false, deviceId: roomId, command: 'set_room_state', error: 'Room not found' }];
    }

    const results: CommandResult[] = [];
    for (const deviceId of room.devices) {
      if (on) {
        if (brightness !== undefined) {
          results.push(await this.setBrightness(deviceId, brightness));
        } else {
          results.push(await this.turnOn(deviceId));
        }
      } else {
        results.push(await this.turnOff(deviceId));
      }
    }

    return results;
  }

  /**
   * Turn off all lights
   */
  async allOff(): Promise<CommandResult[]> {
    const results: CommandResult[] = [];
    for (const lightId of Array.from(this.lights.keys())) {
      results.push(await this.turnOff(`hue_${lightId}`));
    }
    return results;
  }

  /**
   * Get discovered devices for setup
   */
  async discover(): Promise<DiscoveredDevice[]> {
    const bridges = await this.discoverBridges();
    return bridges.map((bridge) => ({
      id: bridge.id,
      type: 'hue' as const,
      name: bridge.name || 'Philips Hue Bridge',
      ip: bridge.internalipaddress,
    }));
  }
}
