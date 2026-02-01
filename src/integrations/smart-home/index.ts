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
} from './types';

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
} from './config';

export type {
  HueConfig,
  HomeAssistantConfig,
  KasaConfig,
  TapoConfig,
  NestConfig,
  EcobeeConfig,
  RingConfig,
  SmartHomeConfig,
} from './config';

// Integrations
export { PhilipsHueIntegration } from './hue';
export { HomeAssistantIntegration } from './home-assistant';
export { KasaIntegration, TapoIntegration } from './smart-plugs';
export { NestIntegration, EcobeeIntegration } from './thermostat';
export { RingIntegration, IPCameraIntegration } from './security';

// Manager
export { SmartHomeManager } from './manager';

// Tools
export {
  createSmartHomeTools,
  executeSmartHomeTool,
} from './tools';

export type {
  ToolDefinition,
  ToolResult,
} from './tools';
