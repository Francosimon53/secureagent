'use client';

import { useState, useEffect } from 'react';

// Types
interface SmartDevice {
  id: string;
  name: string;
  type: 'light' | 'thermostat' | 'camera' | 'lock' | 'alarm' | 'plug' | 'sensor';
  state: 'on' | 'off' | 'unknown';
  room?: string;
  reachable: boolean;
  brightness?: number;
  currentTemp?: number;
  targetTemp?: number;
  locked?: boolean;
  armed?: boolean;
  motionDetected?: boolean;
}

interface Room {
  id: string;
  name: string;
  devices: string[];
}

interface Scene {
  id: string;
  name: string;
  icon?: string;
}

interface Integration {
  id: string;
  name: string;
  type: 'hue' | 'home-assistant' | 'kasa' | 'nest' | 'ring';
  connected: boolean;
  deviceCount: number;
  icon: string;
}

// Device type icons
const deviceIcons: Record<string, string> = {
  light: '💡',
  thermostat: '🌡️',
  camera: '📹',
  lock: '🔐',
  alarm: '🚨',
  plug: '🔌',
  sensor: '📊',
};

// Integration icons
const integrationIcons: Record<string, string> = {
  hue: '🟠',
  'home-assistant': '🏠',
  kasa: '🔵',
  nest: '🪺',
  ring: '⭕',
};

export default function SmartHomePage() {
  const [devices, setDevices] = useState<SmartDevice[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddIntegration, setShowAddIntegration] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // In production, these would be API calls
      // Mock data for demonstration
      setDevices([
        { id: '1', name: 'Living Room Light', type: 'light', state: 'on', room: 'Living Room', reachable: true, brightness: 75 },
        { id: '2', name: 'Bedroom Light', type: 'light', state: 'off', room: 'Bedroom', reachable: true, brightness: 0 },
        { id: '3', name: 'Kitchen Light', type: 'light', state: 'on', room: 'Kitchen', reachable: true, brightness: 100 },
        { id: '4', name: 'Main Thermostat', type: 'thermostat', state: 'on', room: 'Living Room', reachable: true, currentTemp: 72, targetTemp: 70 },
        { id: '5', name: 'Front Door', type: 'lock', state: 'on', room: 'Entryway', reachable: true, locked: true },
        { id: '6', name: 'Front Door Camera', type: 'camera', state: 'on', room: 'Entryway', reachable: true, motionDetected: false },
        { id: '7', name: 'Home Alarm', type: 'alarm', state: 'off', reachable: true, armed: false },
        { id: '8', name: 'Coffee Maker', type: 'plug', state: 'off', room: 'Kitchen', reachable: true },
      ]);

      setRooms([
        { id: 'all', name: 'All Rooms', devices: ['1', '2', '3', '4', '5', '6', '7', '8'] },
        { id: 'living', name: 'Living Room', devices: ['1', '4'] },
        { id: 'bedroom', name: 'Bedroom', devices: ['2'] },
        { id: 'kitchen', name: 'Kitchen', devices: ['3', '8'] },
        { id: 'entryway', name: 'Entryway', devices: ['5', '6'] },
      ]);

      setScenes([
        { id: '1', name: 'Good Morning', icon: '🌅' },
        { id: '2', name: 'Good Night', icon: '🌙' },
        { id: '3', name: 'Movie Time', icon: '🎬' },
        { id: '4', name: 'Away Mode', icon: '🏃' },
        { id: '5', name: 'Party Mode', icon: '🎉' },
      ]);

      setIntegrations([
        { id: 'hue', name: 'Philips Hue', type: 'hue', connected: false, deviceCount: 0, icon: '🟠' },
        { id: 'nest', name: 'Google Nest', type: 'nest', connected: false, deviceCount: 0, icon: '🪺' },
        { id: 'ring', name: 'Ring', type: 'ring', connected: false, deviceCount: 0, icon: '⭕' },
        { id: 'kasa', name: 'TP-Link Kasa', type: 'kasa', connected: false, deviceCount: 0, icon: '🔵' },
        { id: 'ha', name: 'Home Assistant', type: 'home-assistant', connected: false, deviceCount: 0, icon: '🏠' },
      ]);
    } catch (error) {
      console.error('Failed to load smart home data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDevice = async (deviceId: string) => {
    setDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId
          ? { ...d, state: d.state === 'on' ? 'off' : 'on' }
          : d
      )
    );
    // API call would go here
  };

  const setBrightness = async (deviceId: string, brightness: number) => {
    setDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId
          ? { ...d, brightness, state: brightness > 0 ? 'on' : 'off' }
          : d
      )
    );
  };

  const setTemperature = async (deviceId: string, temp: number) => {
    setDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId && d.type === 'thermostat'
          ? { ...d, targetTemp: temp }
          : d
      )
    );
  };

  const toggleLock = async (deviceId: string) => {
    setDevices((prev) =>
      prev.map((d) =>
        d.id === deviceId && d.type === 'lock'
          ? { ...d, locked: !d.locked }
          : d
      )
    );
  };

  const activateScene = async (sceneId: string) => {
    // API call to activate scene
    console.log('Activating scene:', sceneId);
  };

  const filteredDevices = selectedRoom && selectedRoom !== 'all'
    ? devices.filter((d) => {
        const room = rooms.find((r) => r.id === selectedRoom);
        return room?.devices.includes(d.id);
      })
    : devices;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const hasConnectedIntegrations = integrations.some(i => i.connected);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Smart Home</h1>
          <p className="text-gray-400 mt-1">Control your connected devices</p>
        </div>
        <button
          onClick={() => setShowAddIntegration(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <span>+</span>
          <span>Add Integration</span>
        </button>
      </div>

      {/* Setup Required Banner */}
      {!hasConnectedIntegrations && (
        <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center text-2xl shrink-0">
              🏠
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-white">Setup Required</h3>
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-medium rounded-full">Coming Soon</span>
              </div>
              <p className="text-gray-400 text-sm mb-4">
                Smart home control requires connecting to your home automation platforms. The demo below shows mock data. Real integrations require local network access or API configuration.
              </p>
              <p className="text-gray-500 text-xs">
                Supported platforms: Philips Hue, Home Assistant, TP-Link Kasa, Google Nest, Ring • Integrations in development
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-3xl mb-2">💡</div>
          <div className="text-2xl font-bold text-white">
            {devices.filter((d) => d.type === 'light' && d.state === 'on').length}
          </div>
          <div className="text-gray-400 text-sm">Lights On</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-3xl mb-2">🌡️</div>
          <div className="text-2xl font-bold text-white">
            {devices.find((d) => d.type === 'thermostat')?.currentTemp || '--'}°
          </div>
          <div className="text-gray-400 text-sm">Inside Temp</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-3xl mb-2">🔐</div>
          <div className="text-2xl font-bold text-white">
            {devices.filter((d) => d.type === 'lock' && d.locked).length}/
            {devices.filter((d) => d.type === 'lock').length}
          </div>
          <div className="text-gray-400 text-sm">Locks Secured</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="text-3xl mb-2">📹</div>
          <div className="text-2xl font-bold text-white">
            {devices.filter((d) => d.type === 'camera' && d.reachable).length}
          </div>
          <div className="text-gray-400 text-sm">Cameras Active</div>
        </div>
      </div>

      {/* Scenes */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Scenes</h2>
        <div className="flex flex-wrap gap-3">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              onClick={() => activateScene(scene.id)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors"
            >
              <span className="text-xl">{scene.icon}</span>
              <span className="text-white">{scene.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Room Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => setSelectedRoom(room.id)}
            className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              selectedRoom === room.id || (!selectedRoom && room.id === 'all')
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {room.name}
            <span className="ml-2 text-sm opacity-60">({room.devices.length})</span>
          </button>
        ))}
      </div>

      {/* Devices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDevices.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            onToggle={() => toggleDevice(device.id)}
            onBrightnessChange={(b) => setBrightness(device.id, b)}
            onTemperatureChange={(t) => setTemperature(device.id, t)}
            onLockToggle={() => toggleLock(device.id)}
          />
        ))}
      </div>

      {/* Integrations */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-4">Connected Integrations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {integrations.map((integration) => (
            <div
              key={integration.id}
              onClick={() => setSelectedIntegration(integration.id)}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                integration.connected
                  ? 'bg-gray-700/30 border-gray-600 hover:border-gray-500'
                  : 'bg-gray-800/30 border-gray-700 hover:border-gray-600 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{integration.icon}</span>
                  <div>
                    <div className="font-medium text-white">{integration.name}</div>
                    <div className="text-sm text-gray-400">
                      {integration.connected
                        ? `${integration.deviceCount} devices`
                        : 'Not connected'}
                    </div>
                  </div>
                </div>
                <div
                  className={`w-3 h-3 rounded-full ${
                    integration.connected ? 'bg-green-500' : 'bg-gray-500'
                  }`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Integration Modal */}
      {showAddIntegration && (
        <AddIntegrationModal
          onClose={() => setShowAddIntegration(false)}
          onAdd={(type) => {
            console.log('Adding integration:', type);
            setShowAddIntegration(false);
          }}
        />
      )}

      {/* Integration Settings Modal */}
      {selectedIntegration && (
        <IntegrationSettingsModal
          integration={integrations.find((i) => i.id === selectedIntegration)!}
          onClose={() => setSelectedIntegration(null)}
          onDisconnect={() => {
            setIntegrations((prev) =>
              prev.map((i) =>
                i.id === selectedIntegration
                  ? { ...i, connected: false, deviceCount: 0 }
                  : i
              )
            );
            setSelectedIntegration(null);
          }}
        />
      )}
    </div>
  );
}

// Device Card Component
function DeviceCard({
  device,
  onToggle,
  onBrightnessChange,
  onTemperatureChange,
  onLockToggle,
}: {
  device: SmartDevice;
  onToggle: () => void;
  onBrightnessChange: (brightness: number) => void;
  onTemperatureChange: (temp: number) => void;
  onLockToggle: () => void;
}) {
  const isOn = device.state === 'on';

  return (
    <div
      className={`p-4 rounded-lg border transition-all ${
        isOn
          ? 'bg-gray-700/50 border-gray-600'
          : 'bg-gray-800/50 border-gray-700'
      } ${!device.reachable ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{deviceIcons[device.type]}</span>
          <div>
            <div className="font-medium text-white">{device.name}</div>
            {device.room && (
              <div className="text-sm text-gray-400">{device.room}</div>
            )}
          </div>
        </div>

        {/* Toggle for lights, plugs */}
        {(device.type === 'light' || device.type === 'plug') && (
          <button
            onClick={onToggle}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              isOn ? 'bg-blue-600' : 'bg-gray-600'
            }`}
          >
            <div
              className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                isOn ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        )}

        {/* Lock toggle */}
        {device.type === 'lock' && (
          <button
            onClick={onLockToggle}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              device.locked
                ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                : 'bg-red-600/20 text-red-400 border border-red-600/30'
            }`}
          >
            {device.locked ? 'Locked' : 'Unlocked'}
          </button>
        )}
      </div>

      {/* Brightness slider for lights */}
      {device.type === 'light' && device.brightness !== undefined && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm text-gray-400 mb-1">
            <span>Brightness</span>
            <span>{device.brightness}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={device.brightness}
            onChange={(e) => onBrightnessChange(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>
      )}

      {/* Temperature controls for thermostat */}
      {device.type === 'thermostat' && (
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-white">
                {device.currentTemp}°
              </div>
              <div className="text-sm text-gray-400">Current</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onTemperatureChange((device.targetTemp || 70) - 1)}
                className="w-8 h-8 rounded-full bg-gray-700 text-white hover:bg-gray-600"
              >
                -
              </button>
              <div className="text-center">
                <div className="text-xl font-bold text-blue-400">
                  {device.targetTemp}°
                </div>
                <div className="text-xs text-gray-400">Target</div>
              </div>
              <button
                onClick={() => onTemperatureChange((device.targetTemp || 70) + 1)}
                className="w-8 h-8 rounded-full bg-gray-700 text-white hover:bg-gray-600"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera status */}
      {device.type === 'camera' && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-gray-400">
            {device.motionDetected ? '🔴 Motion detected' : '🟢 All clear'}
          </span>
          <button className="text-sm text-blue-400 hover:text-blue-300">
            View Feed
          </button>
        </div>
      )}

      {/* Alarm status */}
      {device.type === 'alarm' && (
        <div className="mt-3">
          <div
            className={`text-center py-2 rounded ${
              device.armed
                ? 'bg-red-600/20 text-red-400'
                : 'bg-green-600/20 text-green-400'
            }`}
          >
            {device.armed ? '🔴 Armed' : '🟢 Disarmed'}
          </div>
        </div>
      )}

      {!device.reachable && (
        <div className="mt-2 text-sm text-yellow-500">⚠️ Device offline</div>
      )}
    </div>
  );
}

// Add Integration Modal
function AddIntegrationModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (type: string) => void;
}) {
  const availableIntegrations = [
    { type: 'hue', name: 'Philips Hue', icon: '🟠', description: 'Smart lights and accessories' },
    { type: 'home-assistant', name: 'Home Assistant', icon: '🏠', description: 'Open-source home automation' },
    { type: 'kasa', name: 'TP-Link Kasa', icon: '🔵', description: 'Smart plugs and switches' },
    { type: 'tapo', name: 'TP-Link Tapo', icon: '🔵', description: 'Smart home devices' },
    { type: 'nest', name: 'Google Nest', icon: '🪺', description: 'Thermostats and cameras' },
    { type: 'ecobee', name: 'Ecobee', icon: '🌱', description: 'Smart thermostats' },
    { type: 'ring', name: 'Ring', icon: '⭕', description: 'Doorbells and security' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Add Integration</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {availableIntegrations.map((integration) => (
            <button
              key={integration.type}
              onClick={() => onAdd(integration.type)}
              className="w-full p-4 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-lg text-left transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{integration.icon}</span>
                <div>
                  <div className="font-medium text-white">{integration.name}</div>
                  <div className="text-sm text-gray-400">{integration.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Integration Settings Modal
function IntegrationSettingsModal({
  integration,
  onClose,
  onDisconnect,
}: {
  integration: Integration;
  onClose: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{integration.icon}</span>
            <h2 className="text-xl font-bold text-white">{integration.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
            <span className="text-gray-300">Status</span>
            <span className={integration.connected ? 'text-green-400' : 'text-gray-400'}>
              {integration.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {integration.connected && (
            <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
              <span className="text-gray-300">Devices</span>
              <span className="text-white">{integration.deviceCount}</span>
            </div>
          )}

          <div className="pt-4 border-t border-gray-700">
            {integration.connected ? (
              <button
                onClick={onDisconnect}
                className="w-full py-2 bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition-colors"
              >
                Disconnect
              </button>
            ) : (
              <button className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                Connect
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
