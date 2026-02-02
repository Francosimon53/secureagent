import { NextRequest, NextResponse } from 'next/server';

/**
 * Music API - Device Management
 *
 * GET /api/music/devices - List available playback devices
 * POST /api/music/devices - Set active device
 */

// Mock devices (in production, these would come from actual providers)
const mockDevices = [
  {
    id: 'device-1',
    name: 'MacBook Pro',
    type: 'computer' as const,
    isActive: true,
    volume: 50,
    provider: 'spotify' as const,
  },
  {
    id: 'device-2',
    name: 'Living Room',
    type: 'speaker' as const,
    isActive: false,
    volume: 40,
    provider: 'sonos' as const,
    ip: '192.168.1.100',
    model: 'Sonos One',
    roomName: 'Living Room',
    isCoordinator: true,
  },
  {
    id: 'device-3',
    name: 'Kitchen',
    type: 'speaker' as const,
    isActive: false,
    volume: 35,
    provider: 'sonos' as const,
    ip: '192.168.1.101',
    model: 'Sonos Play:1',
    roomName: 'Kitchen',
    isCoordinator: true,
  },
  {
    id: 'device-4',
    name: 'iPhone',
    type: 'phone' as const,
    isActive: false,
    volume: 70,
    provider: 'spotify' as const,
  },
];

let activeDeviceId = 'device-1';

/**
 * GET /api/music/devices
 *
 * List available playback devices
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const provider = searchParams.get('provider');

    let devices = mockDevices.map((d) => ({
      ...d,
      isActive: d.id === activeDeviceId,
    }));

    // Filter by provider if specified
    if (provider) {
      devices = devices.filter((d) => d.provider === provider);
    }

    // Group devices by provider
    const byProvider = {
      spotify: devices.filter((d) => d.provider === 'spotify'),
      sonos: devices.filter((d) => d.provider === 'sonos'),
      apple_music: [] as typeof devices,
      system: [] as typeof devices,
    };

    return NextResponse.json({
      success: true,
      devices,
      byProvider,
      activeDevice: devices.find((d) => d.isActive) || null,
    });
  } catch (error) {
    console.error('Failed to get devices:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get devices',
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/music/devices
 *
 * Set active device or transfer playback
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, action } = body;

    if (!deviceId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Device ID is required',
        },
        { status: 400 },
      );
    }

    const device = mockDevices.find((d) => d.id === deviceId);
    if (!device) {
      return NextResponse.json(
        {
          success: false,
          error: 'Device not found',
        },
        { status: 404 },
      );
    }

    // Handle different actions
    switch (action) {
      case 'transfer':
      case 'set_active':
      default:
        // Transfer playback to this device
        activeDeviceId = deviceId;

        return NextResponse.json({
          success: true,
          message: `Playback transferred to ${device.name}`,
          activeDevice: {
            ...device,
            isActive: true,
          },
        });
    }
  } catch (error) {
    console.error('Device operation failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Device operation failed',
      },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/music/devices
 *
 * Update device settings (e.g., volume for a specific device)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, volume } = body;

    if (!deviceId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Device ID is required',
        },
        { status: 400 },
      );
    }

    const device = mockDevices.find((d) => d.id === deviceId);
    if (!device) {
      return NextResponse.json(
        {
          success: false,
          error: 'Device not found',
        },
        { status: 404 },
      );
    }

    // Update device volume
    if (typeof volume === 'number') {
      device.volume = Math.max(0, Math.min(100, Math.round(volume)));
    }

    return NextResponse.json({
      success: true,
      message: `Device ${device.name} updated`,
      device,
    });
  } catch (error) {
    console.error('Device update failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Device update failed',
      },
      { status: 500 },
    );
  }
}
