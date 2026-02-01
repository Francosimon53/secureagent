/**
 * Smart Home Integration Module
 *
 * Provides unified control for smart home devices including:
 * - Philips Hue lights
 * - Home Assistant devices
 * - TP-Link Kasa/Tapo smart plugs
 * - Nest/Ecobee thermostats
 * - Ring security cameras and alarms
 */

// Types
export type {
  DeviceType,
  DeviceState,
  BaseDevice,
  LightDevice,
  ThermostatDevice,
  CameraDevice,
  LockDevice,
  SensorDevice,
  AlarmDevice,
  PlugDevice,
  SmartDevice,
  Room,
  Scene,
  SceneAction,
  Routine,
  RoutineTrigger,
  RoutineCondition,
  IntegrationConfig,
  SmartHomeIntegrationType,
  DeviceCommand,
  CommandResult,
  DeviceEvent,
  DiscoveredDevice,
} from './types.js';

// Configuration
export {
  HueConfigSchema,
  HomeAssistantConfigSchema,
  KasaConfigSchema,
  TapoConfigSchema,
  NestConfigSchema,
  EcobeeConfigSchema,
  RingConfigSchema,
  SmartHomeConfigSchema,
  defaultSmartHomeConfig,
} from './config.js';

export type {
  HueConfig,
  HomeAssistantConfig,
  KasaConfig,
  TapoConfig,
  NestConfig,
  EcobeeConfig,
  RingConfig,
  SmartHomeConfig,
} from './config.js';

// Integrations
export { PhilipsHueIntegration } from './hue.js';
export { HomeAssistantIntegration } from './home-assistant.js';
export { KasaIntegration, TapoIntegration } from './smart-plugs.js';
export { NestIntegration, EcobeeIntegration } from './thermostat.js';
export { RingIntegration, IPCameraIntegration } from './security.js';

// Manager
export { SmartHomeManager } from './manager.js';

// Tools
export {
  createSmartHomeTools,
  executeSmartHomeTool,
} from './tools.js';

export type {
  ToolDefinition,
  ToolResult,
} from './tools.js';
