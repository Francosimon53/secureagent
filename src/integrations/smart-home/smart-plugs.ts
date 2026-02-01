/**
 * Smart Plugs Integration
 *
 * Support for TP-Link Kasa and Tapo smart plugs.
 */

import type {
  PlugDevice,
  CommandResult,
  DiscoveredDevice,
} from './types';
import type { KasaConfig, TapoConfig } from './config';

// Kasa device info structure
interface KasaDeviceInfo {
  sw_ver: string;
  hw_ver: string;
  model: string;
  deviceId: string;
  oemId: string;
  hwId: string;
  alias: string;
  dev_name: string;
  icon_hash: string;
  relay_state: number;
  on_time: number;
  active_mode: string;
  feature: string;
  updating: number;
  led_off: number;
  mac: string;
}

interface KasaEnergyUsage {
  current_ma?: number;
  voltage_mv?: number;
  power_mw?: number;
  total_wh?: number;
}

// Tapo device structure
interface TapoDeviceInfo {
  device_id: string;
  fw_ver: string;
  hw_ver: string;
  model: string;
  nickname: string;
  mac: string;
  device_on: boolean;
  on_time: number;
  default_states: {
    state: { on: boolean };
  };
}

/**
 * TP-Link Kasa Integration
 */
export class KasaIntegration {
  private config: KasaConfig;
  private devices: Map<string, PlugDevice> = new Map();
  private discoveredIps: Set<string> = new Set();

  constructor(config: KasaConfig) {
    this.config = config;
  }

  /**
   * Initialize Kasa integration
   */
  async initialize(): Promise<boolean> {
    try {
      if (this.config.autoDiscover) {
        await this.discover();
      }
      return true;
    } catch (error) {
      console.error('Failed to initialize Kasa:', error);
      return false;
    }
  }

  /**
   * Discover Kasa devices on the network
   */
  async discover(): Promise<DiscoveredDevice[]> {
    const discovered: DiscoveredDevice[] = [];

    // Kasa devices respond to UDP broadcast on port 9999
    // In a real implementation, this would use UDP broadcast
    // For now, we'll scan common local IP ranges

    const localIp = await this.getLocalIp();
    if (!localIp) return discovered;

    const subnet = localIp.substring(0, localIp.lastIndexOf('.'));
    const scanPromises: Promise<void>[] = [];

    for (let i = 1; i <= 254; i++) {
      const ip = `${subnet}.${i}`;
      scanPromises.push(this.probeDevice(ip, discovered));
    }

    await Promise.allSettled(scanPromises);
    return discovered;
  }

  private async getLocalIp(): Promise<string | null> {
    // This would normally use network interfaces
    // Simplified for this implementation
    return '192.168.1.1';
  }

  private async probeDevice(ip: string, discovered: DiscoveredDevice[]): Promise<void> {
    try {
      const info = await this.sendCommand(ip, {
        system: { get_sysinfo: {} },
      }, 1000) as { system?: { get_sysinfo?: KasaDeviceInfo } };

      if (info?.system?.get_sysinfo) {
        const device = info.system.get_sysinfo;
        this.discoveredIps.add(ip);

        discovered.push({
          id: device.deviceId,
          type: 'kasa',
          name: device.alias || device.dev_name,
          ip,
          mac: device.mac,
          metadata: { model: device.model },
        });

        // Add to devices
        this.devices.set(device.deviceId, this.parseDevice(device, ip));
      }
    } catch {
      // Device not responding or not a Kasa device
    }
  }

  /**
   * Send command to Kasa device
   */
  private async sendCommand(
    ip: string,
    command: Record<string, unknown>,
    timeout = 5000
  ): Promise<Record<string, unknown>> {
    // Kasa devices use TCP on port 9999 with XOR encryption
    // The command is JSON, encrypted with a simple XOR cipher

    const encrypted = this.encrypt(JSON.stringify(command));

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('Timeout')), timeout);

      // In a real implementation, this would use TCP sockets
      // For browser/Node.js compatibility, we'd use a backend proxy
      fetch(`http://${ip}:9999/kasa`, {
        method: 'POST',
        body: encrypted.buffer as BodyInit,
        signal: AbortSignal.timeout(timeout),
      })
        .then((res) => res.arrayBuffer())
        .then((buffer) => {
          clearTimeout(timeoutId);
          const decrypted = this.decrypt(new Uint8Array(buffer));
          resolve(JSON.parse(decrypted));
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Encrypt command for Kasa protocol
   */
  private encrypt(data: string): Uint8Array {
    const result = new Uint8Array(data.length + 4);
    // Length prefix (big endian)
    result[0] = (data.length >> 24) & 0xff;
    result[1] = (data.length >> 16) & 0xff;
    result[2] = (data.length >> 8) & 0xff;
    result[3] = data.length & 0xff;

    let key = 171;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      result[i + 4] = char ^ key;
      key = result[i + 4];
    }
    return result;
  }

  /**
   * Decrypt response from Kasa protocol
   */
  private decrypt(data: Uint8Array): string {
    let result = '';
    let key = 171;
    // Skip 4-byte length prefix
    for (let i = 4; i < data.length; i++) {
      const char = data[i] ^ key;
      key = data[i];
      result += String.fromCharCode(char);
    }
    return result;
  }

  /**
   * Parse Kasa device info to our format
   */
  private parseDevice(info: KasaDeviceInfo, ip: string): PlugDevice {
    const capabilities: string[] = ['on_off'];

    // Check for energy monitoring capability
    if (info.feature?.includes('ENE')) {
      capabilities.push('energy_monitoring');
    }

    return {
      id: `kasa_${info.deviceId}`,
      name: info.alias || info.dev_name,
      type: 'plug',
      state: info.relay_state === 1 ? 'on' : 'off',
      reachable: true,
      manufacturer: 'TP-Link',
      model: info.model,
      capabilities,
      metadata: { ip, mac: info.mac },
    };
  }

  /**
   * Get all devices
   */
  getDevices(): PlugDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Refresh device states
   */
  async refreshDevices(): Promise<void> {
    for (const [id, device] of Array.from(this.devices.entries())) {
      const ip = device.metadata?.ip as string;
      if (!ip) continue;

      try {
        const info = await this.sendCommand(ip, {
          system: { get_sysinfo: {} },
        }) as { system?: { get_sysinfo?: KasaDeviceInfo } };

        if (info?.system?.get_sysinfo) {
          const updated = this.parseDevice(info.system.get_sysinfo, ip);
          this.devices.set(id, updated);
        }
      } catch {
        device.reachable = false;
      }
    }
  }

  /**
   * Turn device on
   */
  async turnOn(deviceId: string): Promise<CommandResult> {
    const device = this.devices.get(deviceId.replace('kasa_', ''));
    const ip = device?.metadata?.ip as string;

    if (!ip) {
      return { success: false, deviceId, command: 'turn_on', error: 'Device not found' };
    }

    try {
      await this.sendCommand(ip, {
        system: { set_relay_state: { state: 1 } },
      });
      if (device) device.state = 'on';
      return { success: true, deviceId, command: 'turn_on' };
    } catch (error) {
      return {
        success: false,
        deviceId,
        command: 'turn_on',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Turn device off
   */
  async turnOff(deviceId: string): Promise<CommandResult> {
    const device = this.devices.get(deviceId.replace('kasa_', ''));
    const ip = device?.metadata?.ip as string;

    if (!ip) {
      return { success: false, deviceId, command: 'turn_off', error: 'Device not found' };
    }

    try {
      await this.sendCommand(ip, {
        system: { set_relay_state: { state: 0 } },
      });
      if (device) device.state = 'off';
      return { success: true, deviceId, command: 'turn_off' };
    } catch (error) {
      return {
        success: false,
        deviceId,
        command: 'turn_off',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get energy usage
   */
  async getEnergyUsage(deviceId: string): Promise<{
    power: number;
    voltage: number;
    current: number;
    total: number;
  } | null> {
    const device = this.devices.get(deviceId.replace('kasa_', ''));
    const ip = device?.metadata?.ip as string;

    if (!ip) return null;

    try {
      const result = await this.sendCommand(ip, {
        emeter: { get_realtime: {} },
      }) as { emeter?: { get_realtime?: KasaEnergyUsage } };

      const data = result?.emeter?.get_realtime;
      if (data) {
        return {
          power: (data.power_mw || 0) / 1000,
          voltage: (data.voltage_mv || 0) / 1000,
          current: (data.current_ma || 0) / 1000,
          total: (data.total_wh || 0) / 1000,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Set LED on/off
   */
  async setLED(deviceId: string, on: boolean): Promise<CommandResult> {
    const device = this.devices.get(deviceId.replace('kasa_', ''));
    const ip = device?.metadata?.ip as string;

    if (!ip) {
      return { success: false, deviceId, command: 'set_led', error: 'Device not found' };
    }

    try {
      await this.sendCommand(ip, {
        system: { set_led_off: { off: on ? 0 : 1 } },
      });
      return { success: true, deviceId, command: 'set_led' };
    } catch (error) {
      return {
        success: false,
        deviceId,
        command: 'set_led',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * TP-Link Tapo Integration
 */
export class TapoIntegration {
  private config: TapoConfig;
  private devices: Map<string, PlugDevice> = new Map();
  private token: string | null = null;

  constructor(config: TapoConfig) {
    this.config = config;
  }

  /**
   * Initialize Tapo integration
   */
  async initialize(): Promise<boolean> {
    try {
      // Authenticate with Tapo cloud
      await this.authenticate();

      if (this.config.autoDiscover) {
        await this.discover();
      }
      return true;
    } catch (error) {
      console.error('Failed to initialize Tapo:', error);
      return false;
    }
  }

  /**
   * Authenticate with Tapo cloud
   */
  private async authenticate(): Promise<void> {
    // Tapo uses a cloud-based authentication
    // The actual implementation would use their API
    // This is a placeholder for the authentication flow

    const response = await fetch('https://wap.tplinkcloud.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'login',
        params: {
          appType: 'Tapo_Android',
          cloudUserName: this.config.email,
          cloudPassword: this.config.password,
          terminalUUID: 'secureagent',
        },
      }),
    });

    const result = await response.json();
    if (result.error_code !== 0) {
      throw new Error(`Tapo auth failed: ${result.msg}`);
    }

    this.token = result.result.token;
  }

  /**
   * Discover Tapo devices
   */
  async discover(): Promise<DiscoveredDevice[]> {
    if (!this.token) {
      await this.authenticate();
    }

    const response = await fetch('https://wap.tplinkcloud.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'getDeviceList',
        params: { token: this.token },
      }),
    });

    const result = await response.json();
    const discovered: DiscoveredDevice[] = [];

    if (result.result?.deviceList) {
      for (const device of result.result.deviceList) {
        discovered.push({
          id: device.deviceId,
          type: 'tapo',
          name: device.alias,
          mac: device.deviceMac,
          metadata: { model: device.deviceModel },
        });

        // Add to devices map
        this.devices.set(device.deviceId, {
          id: `tapo_${device.deviceId}`,
          name: device.alias,
          type: 'plug',
          state: device.status === 1 ? 'on' : 'off',
          reachable: true,
          manufacturer: 'TP-Link',
          model: device.deviceModel,
          capabilities: ['on_off'],
          metadata: { cloudDeviceId: device.deviceId },
        });
      }
    }

    return discovered;
  }

  /**
   * Get all devices
   */
  getDevices(): PlugDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Send command to device via cloud
   */
  private async sendCloudCommand(
    deviceId: string,
    command: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!this.token) {
      await this.authenticate();
    }

    const response = await fetch('https://wap.tplinkcloud.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'passthrough',
        params: {
          token: this.token,
          deviceId,
          requestData: JSON.stringify(command),
        },
      }),
    });

    const result = await response.json();
    if (result.error_code !== 0) {
      throw new Error(`Tapo command failed: ${result.msg}`);
    }

    return JSON.parse(result.result.responseData);
  }

  /**
   * Turn device on
   */
  async turnOn(deviceId: string): Promise<CommandResult> {
    const cloudId = deviceId.replace('tapo_', '');

    try {
      await this.sendCloudCommand(cloudId, {
        method: 'set_device_info',
        params: { device_on: true },
      });

      const device = this.devices.get(cloudId);
      if (device) device.state = 'on';

      return { success: true, deviceId, command: 'turn_on' };
    } catch (error) {
      return {
        success: false,
        deviceId,
        command: 'turn_on',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Turn device off
   */
  async turnOff(deviceId: string): Promise<CommandResult> {
    const cloudId = deviceId.replace('tapo_', '');

    try {
      await this.sendCloudCommand(cloudId, {
        method: 'set_device_info',
        params: { device_on: false },
      });

      const device = this.devices.get(cloudId);
      if (device) device.state = 'off';

      return { success: true, deviceId, command: 'turn_off' };
    } catch (error) {
      return {
        success: false,
        deviceId,
        command: 'turn_off',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get device info
   */
  async getDeviceInfo(deviceId: string): Promise<TapoDeviceInfo | null> {
    const cloudId = deviceId.replace('tapo_', '');

    try {
      const result = await this.sendCloudCommand(cloudId, {
        method: 'get_device_info',
      });
      return result as unknown as TapoDeviceInfo;
    } catch {
      return null;
    }
  }
}
