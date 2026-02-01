/**
 * Smart Home Integration - Shared Types
 */

// Device types
export type DeviceType =
  | 'light'
  | 'switch'
  | 'plug'
  | 'thermostat'
  | 'camera'
  | 'lock'
  | 'sensor'
  | 'alarm'
  | 'speaker'
  | 'fan'
  | 'blind'
  | 'garage'
  | 'unknown';

export type DeviceState = 'on' | 'off' | 'unknown';

export interface BaseDevice {
  id: string;
  name: string;
  type: DeviceType;
  room?: string;
  manufacturer?: string;
  model?: string;
  state: DeviceState;
  reachable: boolean;
  lastSeen?: number;
  capabilities: string[];
  metadata?: Record<string, unknown>;
}

// Light specific
export interface LightDevice extends BaseDevice {
  type: 'light';
  brightness?: number; // 0-100
  colorTemp?: number; // Kelvin (2000-6500)
  color?: {
    hue: number; // 0-360
    saturation: number; // 0-100
  };
  rgb?: {
    r: number;
    g: number;
    b: number;
  };
  effect?: string;
}

// Thermostat specific
export interface ThermostatDevice extends BaseDevice {
  type: 'thermostat';
  currentTemp: number;
  targetTemp: number;
  humidity?: number;
  mode: 'heat' | 'cool' | 'auto' | 'off' | 'eco';
  fanMode?: 'auto' | 'on' | 'circulate';
  hvacState?: 'heating' | 'cooling' | 'idle' | 'off';
}

// Camera specific
export interface CameraDevice extends BaseDevice {
  type: 'camera';
  streamUrl?: string;
  snapshotUrl?: string;
  recording: boolean;
  motionDetected: boolean;
  audioEnabled?: boolean;
  nightVision?: boolean;
}

// Lock specific
export interface LockDevice extends BaseDevice {
  type: 'lock';
  locked: boolean;
  batteryLevel?: number;
  autoLock?: boolean;
}

// Sensor specific
export interface SensorDevice extends BaseDevice {
  type: 'sensor';
  sensorType: 'motion' | 'contact' | 'temperature' | 'humidity' | 'smoke' | 'co' | 'water' | 'vibration';
  value: number | boolean | string;
  unit?: string;
  batteryLevel?: number;
}

// Alarm specific
export interface AlarmDevice extends BaseDevice {
  type: 'alarm';
  armed: boolean;
  armMode: 'away' | 'home' | 'night' | 'disarmed';
  triggered: boolean;
  entryDelay?: number;
  exitDelay?: number;
}

// Plug/Switch specific
export interface PlugDevice extends BaseDevice {
  type: 'plug' | 'switch';
  powerUsage?: number; // Watts
  energyToday?: number; // kWh
  energyTotal?: number; // kWh
  voltage?: number;
  current?: number;
}

export type SmartDevice =
  | LightDevice
  | ThermostatDevice
  | CameraDevice
  | LockDevice
  | SensorDevice
  | AlarmDevice
  | PlugDevice
  | BaseDevice;

// Room grouping
export interface Room {
  id: string;
  name: string;
  devices: string[]; // Device IDs
  icon?: string;
}

// Scenes/Routines
export interface Scene {
  id: string;
  name: string;
  description?: string;
  actions: SceneAction[];
  icon?: string;
  createdAt: number;
}

export interface SceneAction {
  deviceId: string;
  action: string;
  params?: Record<string, unknown>;
}

// Routines (time-based or trigger-based)
export interface Routine {
  id: string;
  name: string;
  enabled: boolean;
  trigger: RoutineTrigger;
  conditions?: RoutineCondition[];
  actions: SceneAction[];
  createdAt: number;
}

export type RoutineTrigger =
  | { type: 'time'; time: string; days?: number[] } // "07:00", days 0-6
  | { type: 'sunrise' | 'sunset'; offset?: number } // offset in minutes
  | { type: 'device'; deviceId: string; state: string }
  | { type: 'voice'; phrase: string };

export interface RoutineCondition {
  type: 'time' | 'device' | 'weather';
  operator: 'equals' | 'greater' | 'less' | 'between';
  value: unknown;
}

// Integration connection
export interface IntegrationConfig {
  id: string;
  type: SmartHomeIntegrationType;
  name: string;
  enabled: boolean;
  credentials: Record<string, string>;
  settings?: Record<string, unknown>;
  lastSync?: number;
  error?: string;
}

export type SmartHomeIntegrationType =
  | 'hue'
  | 'home-assistant'
  | 'kasa'
  | 'tapo'
  | 'nest'
  | 'ecobee'
  | 'ring'
  | 'google-home';

// Commands
export interface DeviceCommand {
  deviceId: string;
  command: string;
  params?: Record<string, unknown>;
}

export interface CommandResult {
  success: boolean;
  deviceId: string;
  command: string;
  error?: string;
  newState?: Partial<SmartDevice>;
}

// Events
export interface DeviceEvent {
  type: 'state_changed' | 'motion_detected' | 'door_opened' | 'alarm_triggered' | 'device_offline';
  deviceId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

// Discovery
export interface DiscoveredDevice {
  id: string;
  type: SmartHomeIntegrationType;
  name: string;
  ip?: string;
  mac?: string;
  metadata?: Record<string, unknown>;
}
