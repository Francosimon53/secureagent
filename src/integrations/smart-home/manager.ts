/**
 * Smart Home Manager
 *
 * Unified interface for all smart home integrations.
 * Provides device discovery, natural language control, and routine management.
 */

import type {
  SmartDevice,
  LightDevice,
  ThermostatDevice,
  CameraDevice,
  AlarmDevice,
  PlugDevice,
  Room,
  Scene,
  Routine,
  CommandResult,
  DeviceEvent,
  DiscoveredDevice,
  DeviceType,
} from './types.js';
import type { SmartHomeConfig } from './config.js';
import { PhilipsHueIntegration } from './hue.js';
import { HomeAssistantIntegration } from './home-assistant.js';
import { KasaIntegration, TapoIntegration } from './smart-plugs.js';
import { NestIntegration, EcobeeIntegration } from './thermostat.js';
import { RingIntegration } from './security.js';

type EventCallback = (event: DeviceEvent) => void;

export class SmartHomeManager {
  private config: SmartHomeConfig;

  // Integrations
  private hue: PhilipsHueIntegration | null = null;
  private homeAssistant: HomeAssistantIntegration | null = null;
  private kasa: KasaIntegration | null = null;
  private tapo: TapoIntegration | null = null;
  private nest: NestIntegration | null = null;
  private ecobee: EcobeeIntegration | null = null;
  private ring: RingIntegration | null = null;

  // State
  private devices: Map<string, SmartDevice> = new Map();
  private rooms: Map<string, Room> = new Map();
  private scenes: Map<string, Scene> = new Map();
  private routines: Map<string, Routine> = new Map();
  private eventCallbacks: EventCallback[] = [];
  private initialized = false;

  constructor(config: SmartHomeConfig) {
    this.config = config;
  }

  /**
   * Initialize all configured integrations
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) return;

    const initPromises: Promise<boolean>[] = [];

    // Initialize Philips Hue
    if (this.config.hue) {
      this.hue = new PhilipsHueIntegration(this.config.hue);
      initPromises.push(this.hue.initialize());
    }

    // Initialize Home Assistant
    if (this.config.homeAssistant) {
      this.homeAssistant = new HomeAssistantIntegration(this.config.homeAssistant);
      initPromises.push(this.homeAssistant.initialize());
    }

    // Initialize Kasa
    if (this.config.kasa) {
      this.kasa = new KasaIntegration(this.config.kasa);
      initPromises.push(this.kasa.initialize());
    }

    // Initialize Tapo
    if (this.config.tapo) {
      this.tapo = new TapoIntegration(this.config.tapo);
      initPromises.push(this.tapo.initialize());
    }

    // Initialize Nest
    if (this.config.nest) {
      this.nest = new NestIntegration(this.config.nest);
      initPromises.push(this.nest.initialize());
    }

    // Initialize Ecobee
    if (this.config.ecobee) {
      this.ecobee = new EcobeeIntegration(this.config.ecobee);
      initPromises.push(this.ecobee.initialize());
    }

    // Initialize Ring
    if (this.config.ring) {
      this.ring = new RingIntegration(this.config.ring);
      initPromises.push(this.ring.initialize());

      // Subscribe to Ring events
      this.ring.onEvent((event) => this.handleEvent(event));
    }

    await Promise.allSettled(initPromises);
    await this.syncDevices();
    this.initialized = true;
  }

  /**
   * Sync all devices from integrations
   */
  async syncDevices(): Promise<void> {
    this.devices.clear();

    // Hue lights
    if (this.hue) {
      for (const light of this.hue.getLights()) {
        this.devices.set(light.id, light);
      }
      for (const room of this.hue.getRooms()) {
        this.rooms.set(room.id, room);
      }
      for (const scene of this.hue.getScenes()) {
        this.scenes.set(scene.id, scene);
      }
    }

    // Home Assistant devices
    if (this.homeAssistant) {
      for (const device of this.homeAssistant.getDevices()) {
        this.devices.set(device.id, device);
      }
    }

    // Kasa plugs
    if (this.kasa) {
      for (const plug of this.kasa.getDevices()) {
        this.devices.set(plug.id, plug);
      }
    }

    // Tapo plugs
    if (this.tapo) {
      for (const plug of this.tapo.getDevices()) {
        this.devices.set(plug.id, plug);
      }
    }

    // Nest thermostats
    if (this.nest) {
      for (const thermostat of this.nest.getDevices()) {
        this.devices.set(thermostat.id, thermostat);
      }
    }

    // Ecobee thermostats
    if (this.ecobee) {
      for (const thermostat of this.ecobee.getDevices()) {
        this.devices.set(thermostat.id, thermostat);
      }
    }

    // Ring cameras and alarms
    if (this.ring) {
      for (const camera of this.ring.getCameras()) {
        this.devices.set(camera.id, camera);
      }
      for (const alarm of this.ring.getAlarms()) {
        this.devices.set(alarm.id, alarm);
      }
    }
  }

  /**
   * Handle device event
   */
  private handleEvent(event: DeviceEvent): void {
    for (const callback of this.eventCallbacks) {
      callback(event);
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
   * Get all devices
   */
  getDevices(): SmartDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get devices by type
   */
  getDevicesByType(type: DeviceType): SmartDevice[] {
    return Array.from(this.devices.values()).filter((d) => d.type === type);
  }

  /**
   * Get device by ID
   */
  getDevice(id: string): SmartDevice | undefined {
    return this.devices.get(id);
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
   * Get all routines
   */
  getRoutines(): Routine[] {
    return Array.from(this.routines.values());
  }

  /**
   * Find device by natural language name
   */
  findDevice(query: string): SmartDevice | undefined {
    const normalized = query.toLowerCase().trim();
    const deviceList = Array.from(this.devices.values());

    // Check device aliases first
    for (const [deviceId, aliases] of Object.entries(this.config.deviceAliases)) {
      if (aliases.some((a) => a.toLowerCase() === normalized)) {
        return this.devices.get(deviceId);
      }
    }

    // Check device names
    for (const device of deviceList) {
      if (device.name.toLowerCase() === normalized) {
        return device;
      }
    }

    // Partial match
    for (const device of deviceList) {
      if (device.name.toLowerCase().includes(normalized)) {
        return device;
      }
    }

    return undefined;
  }

  /**
   * Find devices in a room
   */
  findDevicesInRoom(roomQuery: string): SmartDevice[] {
    const normalized = roomQuery.toLowerCase().trim();

    // Check room aliases
    for (const [roomName, aliases] of Object.entries(this.config.roomAliases)) {
      if (aliases.some((a) => a.toLowerCase() === normalized) ||
          roomName.toLowerCase() === normalized) {
        return this.getDevices().filter((d) =>
          d.room?.toLowerCase() === roomName.toLowerCase()
        );
      }
    }

    // Direct room name match
    return this.getDevices().filter((d) =>
      d.room?.toLowerCase().includes(normalized)
    );
  }

  /**
   * Auto-discover devices on network
   */
  async discoverDevices(): Promise<DiscoveredDevice[]> {
    if (!this.config.enableAutoDiscovery) return [];

    const discovered: DiscoveredDevice[] = [];

    // Discover Hue bridges
    if (this.hue) {
      const hueBridges = await this.hue.discover();
      discovered.push(...hueBridges);
    }

    // Discover Kasa devices
    if (this.kasa) {
      const kasaDevices = await this.kasa.discover();
      discovered.push(...kasaDevices);
    }

    return discovered;
  }

  // ==================== Device Control ====================

  /**
   * Turn device on
   */
  async turnOn(deviceId: string): Promise<CommandResult> {
    const device = this.devices.get(deviceId);
    if (!device) {
      return { success: false, deviceId, command: 'turn_on', error: 'Device not found' };
    }

    // Route to appropriate integration
    if (deviceId.startsWith('hue_') && this.hue) {
      return this.hue.turnOn(deviceId);
    }
    if (deviceId.startsWith('kasa_') && this.kasa) {
      return this.kasa.turnOn(deviceId);
    }
    if (deviceId.startsWith('tapo_') && this.tapo) {
      return this.tapo.turnOn(deviceId);
    }
    if (this.homeAssistant && !deviceId.includes('_')) {
      return this.homeAssistant.turnOn(deviceId);
    }

    return { success: false, deviceId, command: 'turn_on', error: 'Unknown device type' };
  }

  /**
   * Turn device off
   */
  async turnOff(deviceId: string): Promise<CommandResult> {
    const device = this.devices.get(deviceId);
    if (!device) {
      return { success: false, deviceId, command: 'turn_off', error: 'Device not found' };
    }

    if (deviceId.startsWith('hue_') && this.hue) {
      return this.hue.turnOff(deviceId);
    }
    if (deviceId.startsWith('kasa_') && this.kasa) {
      return this.kasa.turnOff(deviceId);
    }
    if (deviceId.startsWith('tapo_') && this.tapo) {
      return this.tapo.turnOff(deviceId);
    }
    if (this.homeAssistant && !deviceId.includes('_')) {
      return this.homeAssistant.turnOff(deviceId);
    }

    return { success: false, deviceId, command: 'turn_off', error: 'Unknown device type' };
  }

  /**
   * Toggle device
   */
  async toggle(deviceId: string): Promise<CommandResult> {
    const device = this.devices.get(deviceId);
    if (!device) {
      return { success: false, deviceId, command: 'toggle', error: 'Device not found' };
    }

    if (device.state === 'on') {
      return this.turnOff(deviceId);
    } else {
      return this.turnOn(deviceId);
    }
  }

  /**
   * Set light brightness
   */
  async setBrightness(deviceId: string, brightness: number): Promise<CommandResult> {
    const device = this.devices.get(deviceId);
    if (!device || device.type !== 'light') {
      return { success: false, deviceId, command: 'set_brightness', error: 'Light not found' };
    }

    if (deviceId.startsWith('hue_') && this.hue) {
      return this.hue.setBrightness(deviceId, brightness);
    }
    if (this.homeAssistant && !deviceId.includes('_')) {
      return this.homeAssistant.setLightBrightness(deviceId, brightness);
    }

    return { success: false, deviceId, command: 'set_brightness', error: 'Unknown device type' };
  }

  /**
   * Set light color
   */
  async setColor(deviceId: string, hue: number, saturation: number): Promise<CommandResult> {
    const device = this.devices.get(deviceId);
    if (!device || device.type !== 'light') {
      return { success: false, deviceId, command: 'set_color', error: 'Light not found' };
    }

    if (deviceId.startsWith('hue_') && this.hue) {
      return this.hue.setColor(deviceId, hue, saturation);
    }
    if (this.homeAssistant && !deviceId.includes('_')) {
      return this.homeAssistant.setLightColor(deviceId, hue, saturation);
    }

    return { success: false, deviceId, command: 'set_color', error: 'Unknown device type' };
  }

  /**
   * Set light color temperature
   */
  async setColorTemp(deviceId: string, kelvin: number): Promise<CommandResult> {
    if (deviceId.startsWith('hue_') && this.hue) {
      return this.hue.setColorTemp(deviceId, kelvin);
    }

    return { success: false, deviceId, command: 'set_color_temp', error: 'Unsupported' };
  }

  /**
   * Set thermostat temperature
   */
  async setTemperature(deviceId: string, temp: number): Promise<CommandResult> {
    const device = this.devices.get(deviceId);
    if (!device || device.type !== 'thermostat') {
      return { success: false, deviceId, command: 'set_temperature', error: 'Thermostat not found' };
    }

    if (deviceId.startsWith('nest_') && this.nest) {
      return this.nest.setTemperature(deviceId, temp);
    }
    if (deviceId.startsWith('ecobee_') && this.ecobee) {
      return this.ecobee.setTemperature(deviceId, temp);
    }
    if (this.homeAssistant && deviceId.startsWith('climate.')) {
      return this.homeAssistant.setTemperature(deviceId, temp);
    }

    return { success: false, deviceId, command: 'set_temperature', error: 'Unknown thermostat' };
  }

  /**
   * Set thermostat mode
   */
  async setThermostatMode(
    deviceId: string,
    mode: ThermostatDevice['mode']
  ): Promise<CommandResult> {
    // Map eco mode to auto for integrations that don't support it
    const effectiveMode = mode === 'eco' ? 'auto' : mode;

    if (deviceId.startsWith('nest_') && this.nest) {
      return this.nest.setMode(deviceId, effectiveMode);
    }
    if (deviceId.startsWith('ecobee_') && this.ecobee) {
      return this.ecobee.setMode(deviceId, effectiveMode);
    }
    if (this.homeAssistant && deviceId.startsWith('climate.')) {
      return this.homeAssistant.setHvacMode(deviceId, effectiveMode);
    }

    return { success: false, deviceId, command: 'set_mode', error: 'Unknown thermostat' };
  }

  /**
   * Lock a lock
   */
  async lock(deviceId: string): Promise<CommandResult> {
    if (this.homeAssistant && deviceId.startsWith('lock.')) {
      return this.homeAssistant.lock(deviceId);
    }

    return { success: false, deviceId, command: 'lock', error: 'Unknown lock' };
  }

  /**
   * Unlock a lock
   */
  async unlock(deviceId: string): Promise<CommandResult> {
    if (this.homeAssistant && deviceId.startsWith('lock.')) {
      return this.homeAssistant.unlock(deviceId);
    }

    return { success: false, deviceId, command: 'unlock', error: 'Unknown lock' };
  }

  /**
   * Arm alarm
   */
  async armAlarm(deviceId: string, mode: 'away' | 'home' | 'night'): Promise<CommandResult> {
    if (deviceId.startsWith('ring_alarm_') && this.ring) {
      return this.ring.armAlarm(deviceId, mode === 'night' ? 'home' : mode);
    }
    if (this.homeAssistant && deviceId.startsWith('alarm_control_panel.')) {
      return this.homeAssistant.armAlarm(deviceId, mode);
    }

    return { success: false, deviceId, command: 'arm_alarm', error: 'Unknown alarm' };
  }

  /**
   * Disarm alarm
   */
  async disarmAlarm(deviceId: string, code?: string): Promise<CommandResult> {
    if (deviceId.startsWith('ring_alarm_') && this.ring) {
      return this.ring.disarmAlarm(deviceId);
    }
    if (this.homeAssistant && deviceId.startsWith('alarm_control_panel.')) {
      return this.homeAssistant.disarmAlarm(deviceId, code);
    }

    return { success: false, deviceId, command: 'disarm_alarm', error: 'Unknown alarm' };
  }

  /**
   * Get camera snapshot
   */
  async getCameraSnapshot(deviceId: string): Promise<string | null> {
    if (deviceId.startsWith('ring_') && this.ring) {
      return this.ring.getSnapshot(deviceId);
    }

    return null;
  }

  /**
   * Get camera live stream URL
   */
  async getCameraStream(deviceId: string): Promise<string | null> {
    if (deviceId.startsWith('ring_') && this.ring) {
      return this.ring.getLiveStream(deviceId);
    }

    return null;
  }

  // ==================== Scenes & Routines ====================

  /**
   * Activate a scene
   */
  async activateScene(sceneId: string): Promise<CommandResult[]> {
    const scene = this.scenes.get(sceneId);
    if (!scene) {
      return [{ success: false, deviceId: sceneId, command: 'activate_scene', error: 'Scene not found' }];
    }

    if (sceneId.startsWith('hue_scene_') && this.hue) {
      const result = await this.hue.activateScene(sceneId);
      return [result];
    }

    // Execute scene actions
    const results: CommandResult[] = [];
    for (const action of scene.actions) {
      const result = await this.executeAction(action.deviceId, action.action, action.params);
      results.push(result);
    }

    return results;
  }

  /**
   * Execute a routine
   */
  async executeRoutine(routineId: string): Promise<CommandResult[]> {
    const routine = this.routines.get(routineId);
    if (!routine || !routine.enabled) {
      return [{ success: false, deviceId: routineId, command: 'execute_routine', error: 'Routine not found or disabled' }];
    }

    const results: CommandResult[] = [];
    for (const action of routine.actions) {
      const result = await this.executeAction(action.deviceId, action.action, action.params);
      results.push(result);
    }

    return results;
  }

  /**
   * Execute a single action
   */
  private async executeAction(
    deviceId: string,
    action: string,
    params?: Record<string, unknown>
  ): Promise<CommandResult> {
    switch (action) {
      case 'turn_on':
        return this.turnOn(deviceId);
      case 'turn_off':
        return this.turnOff(deviceId);
      case 'toggle':
        return this.toggle(deviceId);
      case 'set_brightness':
        return this.setBrightness(deviceId, params?.brightness as number);
      case 'set_color':
        return this.setColor(deviceId, params?.hue as number, params?.saturation as number);
      case 'set_temperature':
        return this.setTemperature(deviceId, params?.temperature as number);
      case 'set_mode':
        return this.setThermostatMode(deviceId, params?.mode as ThermostatDevice['mode']);
      case 'lock':
        return this.lock(deviceId);
      case 'unlock':
        return this.unlock(deviceId);
      default:
        return { success: false, deviceId, command: action, error: 'Unknown action' };
    }
  }

  /**
   * Create a new routine
   */
  createRoutine(routine: Omit<Routine, 'id' | 'createdAt'>): Routine {
    const newRoutine: Routine = {
      ...routine,
      id: `routine_${Date.now()}`,
      createdAt: Date.now(),
    };
    this.routines.set(newRoutine.id, newRoutine);
    return newRoutine;
  }

  /**
   * Delete a routine
   */
  deleteRoutine(routineId: string): boolean {
    return this.routines.delete(routineId);
  }

  // ==================== Natural Language Control ====================

  /**
   * Process natural language command
   */
  async processCommand(command: string): Promise<{
    understood: boolean;
    action?: string;
    target?: string;
    results?: CommandResult[];
    message: string;
  }> {
    const normalized = command.toLowerCase().trim();

    // Turn off all lights
    if (normalized.includes('turn off all lights') || normalized.includes('all lights off')) {
      if (this.hue) {
        const results = await this.hue.allOff();
        return {
          understood: true,
          action: 'turn_off_all',
          target: 'lights',
          results,
          message: 'Turned off all lights',
        };
      }
    }

    // Turn on/off specific device
    const onOffMatch = normalized.match(/turn\s+(on|off)\s+(?:the\s+)?(.+)/);
    if (onOffMatch) {
      const [, action, deviceName] = onOffMatch;
      const device = this.findDevice(deviceName);

      if (device) {
        const result = action === 'on'
          ? await this.turnOn(device.id)
          : await this.turnOff(device.id);

        return {
          understood: true,
          action: `turn_${action}`,
          target: device.name,
          results: [result],
          message: result.success
            ? `Turned ${action} ${device.name}`
            : `Failed to turn ${action} ${device.name}: ${result.error}`,
        };
      }
    }

    // Set brightness
    const brightnessMatch = normalized.match(/set\s+(?:the\s+)?(.+?)\s+(?:to\s+)?(\d+)(?:\s*%|\s+percent)?/);
    if (brightnessMatch) {
      const [, deviceName, brightness] = brightnessMatch;
      const device = this.findDevice(deviceName);

      if (device && device.type === 'light') {
        const result = await this.setBrightness(device.id, parseInt(brightness, 10));
        return {
          understood: true,
          action: 'set_brightness',
          target: device.name,
          results: [result],
          message: result.success
            ? `Set ${device.name} to ${brightness}%`
            : `Failed to set brightness: ${result.error}`,
        };
      }
    }

    // Set temperature
    const tempMatch = normalized.match(/set\s+(?:the\s+)?(?:thermostat|temperature)\s+(?:to\s+)?(\d+)/);
    if (tempMatch) {
      const [, temp] = tempMatch;
      const thermostats = this.getDevicesByType('thermostat') as ThermostatDevice[];

      if (thermostats.length > 0) {
        const result = await this.setTemperature(thermostats[0].id, parseInt(temp, 10));
        return {
          understood: true,
          action: 'set_temperature',
          target: thermostats[0].name,
          results: [result],
          message: result.success
            ? `Set temperature to ${temp}°`
            : `Failed to set temperature: ${result.error}`,
        };
      }
    }

    // What's the temperature
    if (normalized.includes("what's the temperature") || normalized.includes('what is the temperature')) {
      const thermostats = this.getDevicesByType('thermostat') as ThermostatDevice[];
      if (thermostats.length > 0) {
        const t = thermostats[0];
        return {
          understood: true,
          action: 'get_temperature',
          target: t.name,
          message: `The current temperature is ${t.currentTemp}°. Target is ${t.targetTemp}°.`,
        };
      }
    }

    // Lock/unlock
    if (normalized.includes('lock') || normalized.includes('unlock')) {
      const locks = this.getDevicesByType('lock');
      if (locks.length > 0) {
        const lock = locks[0];
        const isLock = normalized.includes('lock the') || normalized.includes('lock door');
        const result = isLock ? await this.lock(lock.id) : await this.unlock(lock.id);

        return {
          understood: true,
          action: isLock ? 'lock' : 'unlock',
          target: lock.name,
          results: [result],
          message: result.success
            ? `${isLock ? 'Locked' : 'Unlocked'} ${lock.name}`
            : `Failed: ${result.error}`,
        };
      }
    }

    // Arm/disarm alarm
    if (normalized.includes('arm') || normalized.includes('disarm')) {
      const alarms = this.getDevicesByType('alarm');
      if (alarms.length > 0) {
        const alarm = alarms[0];
        const isArm = normalized.includes('arm') && !normalized.includes('disarm');

        let result: CommandResult;
        if (isArm) {
          const mode = normalized.includes('away') ? 'away' : 'home';
          result = await this.armAlarm(alarm.id, mode);
        } else {
          result = await this.disarmAlarm(alarm.id);
        }

        return {
          understood: true,
          action: isArm ? 'arm' : 'disarm',
          target: alarm.name,
          results: [result],
          message: result.success
            ? `${isArm ? 'Armed' : 'Disarmed'} ${alarm.name}`
            : `Failed: ${result.error}`,
        };
      }
    }

    return {
      understood: false,
      message: "I didn't understand that command. Try 'turn on the living room lights' or 'set the temperature to 72'.",
    };
  }

  /**
   * Disconnect all integrations
   */
  disconnect(): void {
    this.homeAssistant?.disconnect();
    this.ring?.disconnect();
  }
}
