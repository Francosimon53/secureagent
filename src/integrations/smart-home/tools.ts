/**
 * Smart Home Tools
 *
 * AI agent tools for controlling smart home devices.
 */

import type { SmartHomeManager } from './manager';
import type {
  SmartDevice,
  LightDevice,
  ThermostatDevice,
  CameraDevice,
  AlarmDevice,
  DeviceType,
} from './types';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Create smart home tools for the AI agent
 */
export function createSmartHomeTools(manager: SmartHomeManager): ToolDefinition[] {
  return [
    // Device listing
    {
      name: 'smart_home_list_devices',
      description: 'List all smart home devices. Can filter by type (light, thermostat, camera, lock, alarm, plug, sensor).',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Filter by device type',
            enum: ['light', 'thermostat', 'camera', 'lock', 'alarm', 'plug', 'sensor'],
          },
          room: {
            type: 'string',
            description: 'Filter by room name',
          },
        },
        required: [],
      },
      riskLevel: 'low',
    },

    // Get device status
    {
      name: 'smart_home_get_device',
      description: 'Get detailed status of a specific smart home device by ID or name.',
      parameters: {
        type: 'object',
        properties: {
          device: {
            type: 'string',
            description: 'Device ID or name',
          },
        },
        required: ['device'],
      },
      riskLevel: 'low',
    },

    // Turn on device
    {
      name: 'smart_home_turn_on',
      description: 'Turn on a smart home device (light, switch, plug).',
      parameters: {
        type: 'object',
        properties: {
          device: {
            type: 'string',
            description: 'Device ID or name to turn on',
          },
        },
        required: ['device'],
      },
      riskLevel: 'medium',
    },

    // Turn off device
    {
      name: 'smart_home_turn_off',
      description: 'Turn off a smart home device (light, switch, plug).',
      parameters: {
        type: 'object',
        properties: {
          device: {
            type: 'string',
            description: 'Device ID or name to turn off',
          },
        },
        required: ['device'],
      },
      riskLevel: 'medium',
    },

    // Set brightness
    {
      name: 'smart_home_set_brightness',
      description: 'Set the brightness of a light (0-100%).',
      parameters: {
        type: 'object',
        properties: {
          device: {
            type: 'string',
            description: 'Light device ID or name',
          },
          brightness: {
            type: 'number',
            description: 'Brightness level (0-100)',
          },
        },
        required: ['device', 'brightness'],
      },
      riskLevel: 'medium',
    },

    // Set light color
    {
      name: 'smart_home_set_color',
      description: 'Set the color of a smart light. Provide either RGB values or color name.',
      parameters: {
        type: 'object',
        properties: {
          device: {
            type: 'string',
            description: 'Light device ID or name',
          },
          color: {
            type: 'string',
            description: 'Color name (red, blue, green, warm, cool, etc.) or hex code',
          },
        },
        required: ['device', 'color'],
      },
      riskLevel: 'medium',
    },

    // Set thermostat
    {
      name: 'smart_home_set_temperature',
      description: 'Set the target temperature on a thermostat.',
      parameters: {
        type: 'object',
        properties: {
          device: {
            type: 'string',
            description: 'Thermostat device ID or name (optional if only one thermostat)',
          },
          temperature: {
            type: 'number',
            description: 'Target temperature in Fahrenheit',
          },
          mode: {
            type: 'string',
            description: 'HVAC mode',
            enum: ['heat', 'cool', 'auto', 'off'],
          },
        },
        required: ['temperature'],
      },
      riskLevel: 'medium',
    },

    // Get temperature
    {
      name: 'smart_home_get_temperature',
      description: 'Get the current temperature from a thermostat or temperature sensor.',
      parameters: {
        type: 'object',
        properties: {
          device: {
            type: 'string',
            description: 'Thermostat or sensor device ID or name (optional)',
          },
        },
        required: [],
      },
      riskLevel: 'low',
    },

    // Lock/Unlock
    {
      name: 'smart_home_lock',
      description: 'Lock or unlock a smart lock.',
      parameters: {
        type: 'object',
        properties: {
          device: {
            type: 'string',
            description: 'Lock device ID or name',
          },
          action: {
            type: 'string',
            description: 'Lock or unlock',
            enum: ['lock', 'unlock'],
          },
        },
        required: ['action'],
      },
      riskLevel: 'high',
    },

    // Alarm control
    {
      name: 'smart_home_alarm',
      description: 'Arm or disarm a security alarm.',
      parameters: {
        type: 'object',
        properties: {
          device: {
            type: 'string',
            description: 'Alarm device ID or name',
          },
          action: {
            type: 'string',
            description: 'Arm mode or disarm',
            enum: ['arm_away', 'arm_home', 'arm_night', 'disarm'],
          },
        },
        required: ['action'],
      },
      riskLevel: 'high',
    },

    // Camera snapshot
    {
      name: 'smart_home_camera_snapshot',
      description: 'Get a snapshot image from a security camera.',
      parameters: {
        type: 'object',
        properties: {
          device: {
            type: 'string',
            description: 'Camera device ID or name',
          },
        },
        required: ['device'],
      },
      riskLevel: 'low',
    },

    // Activate scene
    {
      name: 'smart_home_activate_scene',
      description: 'Activate a predefined smart home scene (e.g., "Movie Night", "Good Morning").',
      parameters: {
        type: 'object',
        properties: {
          scene: {
            type: 'string',
            description: 'Scene ID or name',
          },
        },
        required: ['scene'],
      },
      riskLevel: 'medium',
    },

    // Execute routine
    {
      name: 'smart_home_run_routine',
      description: 'Execute a smart home routine.',
      parameters: {
        type: 'object',
        properties: {
          routine: {
            type: 'string',
            description: 'Routine ID or name',
          },
        },
        required: ['routine'],
      },
      riskLevel: 'medium',
    },

    // Natural language command
    {
      name: 'smart_home_command',
      description: 'Execute a natural language smart home command. Use this for complex or multi-device commands.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Natural language command (e.g., "turn off all lights", "set living room to 50% warm white")',
          },
        },
        required: ['command'],
      },
      riskLevel: 'medium',
    },
  ];
}

/**
 * Execute a smart home tool
 */
export async function executeSmartHomeTool(
  manager: SmartHomeManager,
  toolName: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'smart_home_list_devices': {
        let devices = manager.getDevices();

        if (params.type) {
          devices = devices.filter((d) => d.type === params.type);
        }
        if (params.room) {
          devices = devices.filter((d) =>
            d.room?.toLowerCase().includes((params.room as string).toLowerCase())
          );
        }

        return {
          success: true,
          data: devices.map((d) => ({
            id: d.id,
            name: d.name,
            type: d.type,
            state: d.state,
            room: d.room,
            reachable: d.reachable,
          })),
        };
      }

      case 'smart_home_get_device': {
        const device = manager.findDevice(params.device as string) ||
                       manager.getDevice(params.device as string);

        if (!device) {
          return { success: false, error: `Device "${params.device}" not found` };
        }

        return {
          success: true,
          data: formatDeviceDetails(device),
        };
      }

      case 'smart_home_turn_on': {
        const device = manager.findDevice(params.device as string) ||
                       manager.getDevice(params.device as string);

        if (!device) {
          return { success: false, error: `Device "${params.device}" not found` };
        }

        const result = await manager.turnOn(device.id);
        return {
          success: result.success,
          data: result.success ? `Turned on ${device.name}` : undefined,
          error: result.error,
        };
      }

      case 'smart_home_turn_off': {
        const device = manager.findDevice(params.device as string) ||
                       manager.getDevice(params.device as string);

        if (!device) {
          return { success: false, error: `Device "${params.device}" not found` };
        }

        const result = await manager.turnOff(device.id);
        return {
          success: result.success,
          data: result.success ? `Turned off ${device.name}` : undefined,
          error: result.error,
        };
      }

      case 'smart_home_set_brightness': {
        const device = manager.findDevice(params.device as string) ||
                       manager.getDevice(params.device as string);

        if (!device) {
          return { success: false, error: `Device "${params.device}" not found` };
        }

        const result = await manager.setBrightness(device.id, params.brightness as number);
        return {
          success: result.success,
          data: result.success ? `Set ${device.name} to ${params.brightness}%` : undefined,
          error: result.error,
        };
      }

      case 'smart_home_set_color': {
        const device = manager.findDevice(params.device as string) ||
                       manager.getDevice(params.device as string);

        if (!device) {
          return { success: false, error: `Device "${params.device}" not found` };
        }

        const color = parseColor(params.color as string);
        if (!color) {
          return { success: false, error: `Unknown color "${params.color}"` };
        }

        const result = await manager.setColor(device.id, color.hue, color.saturation);
        return {
          success: result.success,
          data: result.success ? `Set ${device.name} to ${params.color}` : undefined,
          error: result.error,
        };
      }

      case 'smart_home_set_temperature': {
        let device: SmartDevice | undefined;

        if (params.device) {
          device = manager.findDevice(params.device as string) ||
                   manager.getDevice(params.device as string);
        } else {
          const thermostats = manager.getDevicesByType('thermostat');
          device = thermostats[0];
        }

        if (!device) {
          return { success: false, error: 'No thermostat found' };
        }

        const results: string[] = [];

        if (params.mode) {
          const modeResult = await manager.setThermostatMode(
            device.id,
            params.mode as 'heat' | 'cool' | 'auto' | 'off'
          );
          if (!modeResult.success) {
            return { success: false, error: modeResult.error };
          }
          results.push(`Set mode to ${params.mode}`);
        }

        const tempResult = await manager.setTemperature(device.id, params.temperature as number);
        if (!tempResult.success) {
          return { success: false, error: tempResult.error };
        }
        results.push(`Set temperature to ${params.temperature}°`);

        return {
          success: true,
          data: results.join('. '),
        };
      }

      case 'smart_home_get_temperature': {
        let device: SmartDevice | undefined;

        if (params.device) {
          device = manager.findDevice(params.device as string) ||
                   manager.getDevice(params.device as string);
        } else {
          const thermostats = manager.getDevicesByType('thermostat');
          device = thermostats[0];
        }

        if (!device || device.type !== 'thermostat') {
          return { success: false, error: 'No thermostat found' };
        }

        const t = device as ThermostatDevice;
        return {
          success: true,
          data: {
            currentTemperature: t.currentTemp,
            targetTemperature: t.targetTemp,
            mode: t.mode,
            humidity: t.humidity,
            hvacState: t.hvacState,
          },
        };
      }

      case 'smart_home_lock': {
        let device: SmartDevice | undefined;

        if (params.device) {
          device = manager.findDevice(params.device as string) ||
                   manager.getDevice(params.device as string);
        } else {
          const locks = manager.getDevicesByType('lock');
          device = locks[0];
        }

        if (!device) {
          return { success: false, error: 'No lock found' };
        }

        const result = params.action === 'lock'
          ? await manager.lock(device.id)
          : await manager.unlock(device.id);

        return {
          success: result.success,
          data: result.success ? `${params.action === 'lock' ? 'Locked' : 'Unlocked'} ${device.name}` : undefined,
          error: result.error,
        };
      }

      case 'smart_home_alarm': {
        let device: SmartDevice | undefined;

        if (params.device) {
          device = manager.findDevice(params.device as string) ||
                   manager.getDevice(params.device as string);
        } else {
          const alarms = manager.getDevicesByType('alarm');
          device = alarms[0];
        }

        if (!device) {
          return { success: false, error: 'No alarm found' };
        }

        let result;
        switch (params.action) {
          case 'arm_away':
            result = await manager.armAlarm(device.id, 'away');
            break;
          case 'arm_home':
            result = await manager.armAlarm(device.id, 'home');
            break;
          case 'arm_night':
            result = await manager.armAlarm(device.id, 'night');
            break;
          case 'disarm':
            result = await manager.disarmAlarm(device.id);
            break;
          default:
            return { success: false, error: `Unknown action: ${params.action}` };
        }

        return {
          success: result.success,
          data: result.success ? `${params.action.replace('_', ' ')} ${device.name}` : undefined,
          error: result.error,
        };
      }

      case 'smart_home_camera_snapshot': {
        const device = manager.findDevice(params.device as string) ||
                       manager.getDevice(params.device as string);

        if (!device || device.type !== 'camera') {
          return { success: false, error: `Camera "${params.device}" not found` };
        }

        const snapshotUrl = await manager.getCameraSnapshot(device.id);
        if (!snapshotUrl) {
          return { success: false, error: 'Failed to get camera snapshot' };
        }

        return {
          success: true,
          data: { snapshotUrl },
        };
      }

      case 'smart_home_activate_scene': {
        const scenes = manager.getScenes();
        const scene = scenes.find((s) =>
          s.name.toLowerCase() === (params.scene as string).toLowerCase() ||
          s.id === params.scene
        );

        if (!scene) {
          return { success: false, error: `Scene "${params.scene}" not found` };
        }

        const results = await manager.activateScene(scene.id);
        const failed = results.filter((r) => !r.success);

        if (failed.length > 0) {
          return {
            success: false,
            error: `Some actions failed: ${failed.map((f) => f.error).join(', ')}`,
          };
        }

        return {
          success: true,
          data: `Activated scene: ${scene.name}`,
        };
      }

      case 'smart_home_run_routine': {
        const routines = manager.getRoutines();
        const routine = routines.find((r) =>
          r.name.toLowerCase() === (params.routine as string).toLowerCase() ||
          r.id === params.routine
        );

        if (!routine) {
          return { success: false, error: `Routine "${params.routine}" not found` };
        }

        const results = await manager.executeRoutine(routine.id);
        const failed = results.filter((r) => !r.success);

        if (failed.length > 0) {
          return {
            success: false,
            error: `Some actions failed: ${failed.map((f) => f.error).join(', ')}`,
          };
        }

        return {
          success: true,
          data: `Executed routine: ${routine.name}`,
        };
      }

      case 'smart_home_command': {
        const result = await manager.processCommand(params.command as string);
        return {
          success: result.understood,
          data: result.message,
          error: result.understood ? undefined : result.message,
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Format device details for display
 */
function formatDeviceDetails(device: SmartDevice): Record<string, unknown> {
  const base = {
    id: device.id,
    name: device.name,
    type: device.type,
    state: device.state,
    room: device.room,
    reachable: device.reachable,
    capabilities: device.capabilities,
  };

  switch (device.type) {
    case 'light': {
      const light = device as LightDevice;
      return {
        ...base,
        brightness: light.brightness,
        colorTemp: light.colorTemp,
        color: light.color,
      };
    }
    case 'thermostat': {
      const t = device as ThermostatDevice;
      return {
        ...base,
        currentTemperature: t.currentTemp,
        targetTemperature: t.targetTemp,
        humidity: t.humidity,
        mode: t.mode,
        hvacState: t.hvacState,
      };
    }
    case 'camera': {
      const cam = device as CameraDevice;
      return {
        ...base,
        recording: cam.recording,
        motionDetected: cam.motionDetected,
      };
    }
    case 'alarm': {
      const alarm = device as AlarmDevice;
      return {
        ...base,
        armed: alarm.armed,
        armMode: alarm.armMode,
        triggered: alarm.triggered,
      };
    }
    default:
      return base;
  }
}

/**
 * Parse color name to hue/saturation
 */
function parseColor(color: string): { hue: number; saturation: number } | null {
  const colorMap: Record<string, { hue: number; saturation: number }> = {
    red: { hue: 0, saturation: 100 },
    orange: { hue: 30, saturation: 100 },
    yellow: { hue: 60, saturation: 100 },
    green: { hue: 120, saturation: 100 },
    cyan: { hue: 180, saturation: 100 },
    blue: { hue: 240, saturation: 100 },
    purple: { hue: 280, saturation: 100 },
    pink: { hue: 320, saturation: 80 },
    white: { hue: 0, saturation: 0 },
    warm: { hue: 30, saturation: 50 },
    'warm white': { hue: 30, saturation: 30 },
    cool: { hue: 220, saturation: 20 },
    'cool white': { hue: 220, saturation: 10 },
    daylight: { hue: 200, saturation: 10 },
  };

  const normalized = color.toLowerCase().trim();

  if (colorMap[normalized]) {
    return colorMap[normalized];
  }

  // Try hex color
  const hexMatch = normalized.match(/^#?([0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h = 0;
    const s = max === 0 ? 0 : d / max;

    if (d !== 0) {
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return { hue: Math.round(h * 360), saturation: Math.round(s * 100) };
  }

  return null;
}
