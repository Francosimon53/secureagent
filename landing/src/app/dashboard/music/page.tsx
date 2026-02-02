'use client';

import { useState, useEffect, useCallback } from 'react';

interface Track {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration: number;
  artworkUrl?: string;
  uri?: string;
  provider: string;
}

interface PlaybackState {
  track: Track | null;
  position: number;
  state: 'playing' | 'paused' | 'stopped' | 'buffering';
  volume: number;
  shuffle: boolean;
  repeat: 'off' | 'track' | 'context';
  device: {
    id: string;
    name: string;
    type: string;
    isActive: boolean;
  } | null;
}

interface MusicProvider {
  name: string;
  displayName: string;
  connected: boolean;
  deviceCount?: number;
  icon: string;
}

interface PlaybackDevice {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  volume?: number;
  provider: string;
}

interface Playlist {
  id: string;
  name: string;
  description?: string;
  owner?: string;
  trackCount?: number;
  artworkUrl?: string;
  isPublic?: boolean;
  provider: string;
}

export default function MusicDashboard() {
  // State
  const [providers, setProviders] = useState<MusicProvider[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>('spotify');
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [devices, setDevices] = useState<PlaybackDevice[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activeTab, setActiveTab] = useState<'playlists' | 'queue' | 'recent' | 'settings'>('playlists');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  // Fetch music status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/music');
      const data = await response.json();
      if (data.success) {
        setProviders(data.providers);
        setActiveProvider(data.activeProvider);
      }
    } catch (err) {
      console.error('Failed to fetch music status:', err);
    }
  }, []);

  // Fetch playback state
  const fetchPlayback = useCallback(async () => {
    try {
      const response = await fetch('/api/music/playback');
      const data = await response.json();
      if (data.success) {
        setPlayback(data.playback);
      }
    } catch (err) {
      console.error('Failed to fetch playback:', err);
    }
  }, []);

  // Fetch devices
  const fetchDevices = useCallback(async () => {
    try {
      const response = await fetch('/api/music/devices');
      const data = await response.json();
      if (data.success) {
        setDevices(data.devices);
      }
    } catch (err) {
      console.error('Failed to fetch devices:', err);
    }
  }, []);

  // Fetch playlists
  const fetchPlaylists = useCallback(async () => {
    try {
      const response = await fetch('/api/music/playlists');
      const data = await response.json();
      if (data.success) {
        setPlaylists(data.playlists);
      }
    } catch (err) {
      console.error('Failed to fetch playlists:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([
        fetchStatus(),
        fetchPlayback(),
        fetchDevices(),
        fetchPlaylists(),
      ]);
      setLoading(false);
    };
    loadAll();

    // Check for URL params
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'spotify') {
      setError(null);
      fetchStatus();
    } else if (params.get('error')) {
      setError(`Connection failed: ${params.get('error')}`);
    }

    // Poll for updates
    const interval = setInterval(() => {
      fetchPlayback();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchStatus, fetchPlayback, fetchDevices, fetchPlaylists]);

  // Playback control
  const playbackAction = async (action: string, params: Record<string, unknown> = {}) => {
    try {
      const response = await fetch('/api/music/playback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params }),
      });
      const data = await response.json();
      if (data.success && data.playback) {
        setPlayback(data.playback);
      }
    } catch (err) {
      console.error('Playback action failed:', err);
    }
  };

  // Connect to provider
  const connectProvider = async (providerName: string) => {
    setConnecting(providerName);
    setError(null);

    try {
      if (providerName === 'spotify') {
        // Redirect to Spotify OAuth
        const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
        if (!clientId) {
          setError('Spotify is not configured. Please add SPOTIFY_CLIENT_ID to environment.');
          setConnecting(null);
          return;
        }

        const redirectUri = `${window.location.origin}/api/music/spotify/callback`;
        const scopes = [
          'user-read-playback-state',
          'user-modify-playback-state',
          'user-read-currently-playing',
          'playlist-read-private',
          'playlist-modify-public',
          'playlist-modify-private',
          'user-library-read',
          'user-library-modify',
        ].join(' ');

        const state = Math.random().toString(36).substring(7);
        const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
          client_id: clientId,
          response_type: 'code',
          redirect_uri: redirectUri,
          scope: scopes,
          state,
          show_dialog: 'true',
        })}`;

        window.location.href = authUrl;
      } else if (providerName === 'sonos') {
        // Sonos uses local network discovery
        await fetchDevices();
        setConnecting(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setConnecting(null);
    }
  };

  // Transfer playback to device
  const transferToDevice = async (deviceId: string) => {
    try {
      const response = await fetch('/api/music/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, action: 'transfer' }),
      });
      const data = await response.json();
      if (data.success) {
        fetchDevices();
      }
    } catch (err) {
      console.error('Transfer failed:', err);
    }
  };

  // Format time
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Progress percentage
  const progressPercent = playback?.track
    ? (playback.position / playback.track.duration) * 100
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  const hasConnectedProviders = providers.some(p => p.connected);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Music Control</h1>
          <p className="text-gray-400 mt-1">
            Control your music across Spotify, Sonos, and more
          </p>
        </div>
        <button
          onClick={() => connectProvider('spotify')}
          disabled={connecting === 'spotify'}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          {connecting === 'spotify' ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
          ) : (
            <span>+</span>
          )}
          Connect Spotify
        </button>
      </div>

      {/* Setup Required Banner */}
      {!hasConnectedProviders && (
        <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center text-2xl shrink-0">
              🎵
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-white">Connect a Music Service</h3>
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-medium rounded-full">Setup Required</span>
              </div>
              <p className="text-gray-400 text-sm mb-4">
                Click "Connect Spotify" above to link your Spotify account. Requires SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables to be configured.
              </p>
              <p className="text-gray-500 text-xs">
                Supported services: Spotify (OAuth), Sonos (local network), Apple Music (coming soon)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Now Playing Card */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Now Playing</h2>

        <div className="flex items-start gap-6">
          {/* Album Art */}
          <div className="w-32 h-32 bg-gray-800 rounded-lg flex items-center justify-center shrink-0">
            {playback?.track?.artworkUrl ? (
              <img
                src={playback.track.artworkUrl}
                alt={playback.track.album}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <span className="text-4xl">🎵</span>
            )}
          </div>

          {/* Track Info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-semibold text-white truncate">
              {playback?.track?.name || 'No track playing'}
            </h3>
            <p className="text-gray-400 truncate">
              {playback?.track?.artist || 'Connect a service to start'}
            </p>
            <p className="text-gray-500 text-sm truncate">
              {playback?.track?.album || ''}
            </p>

            {/* Progress Bar */}
            <div className="mt-4">
              <div
                className="h-1 bg-gray-700 rounded-full cursor-pointer"
                onClick={(e) => {
                  if (!playback?.track) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const percent = (e.clientX - rect.left) / rect.width;
                  const position = Math.round(percent * playback.track.duration);
                  playbackAction('seek', { position });
                }}
              >
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{formatTime(playback?.position || 0)}</span>
                <span>{formatTime(playback?.track?.duration || 0)}</span>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center gap-4 mt-4">
              <button
                onClick={() => playbackAction('shuffle', { state: !playback?.shuffle })}
                className={`p-2 rounded-lg transition-colors ${
                  playback?.shuffle
                    ? 'text-green-500 bg-green-500/10'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
                title="Shuffle"
              >
                🔀
              </button>

              <button
                onClick={() => playbackAction('previous')}
                className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
                title="Previous"
              >
                ⏮
              </button>

              <button
                onClick={() =>
                  playbackAction(playback?.state === 'playing' ? 'pause' : 'play')
                }
                className="p-4 bg-white text-black rounded-full hover:scale-105 transition-transform"
                title={playback?.state === 'playing' ? 'Pause' : 'Play'}
              >
                {playback?.state === 'playing' ? '⏸️' : '▶️'}
              </button>

              <button
                onClick={() => playbackAction('next')}
                className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
                title="Next"
              >
                ⏭
              </button>

              <button
                onClick={() => {
                  const modes: ('off' | 'track' | 'context')[] = ['off', 'track', 'context'];
                  const currentIndex = modes.indexOf(playback?.repeat || 'off');
                  const nextMode = modes[(currentIndex + 1) % modes.length];
                  playbackAction('repeat', { mode: nextMode });
                }}
                className={`p-2 rounded-lg transition-colors ${
                  playback?.repeat !== 'off'
                    ? 'text-green-500 bg-green-500/10'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
                title={`Repeat: ${playback?.repeat || 'off'}`}
              >
                {playback?.repeat === 'track' ? '🔂' : '🔁'}
              </button>

              {/* Volume Slider */}
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-gray-400">🔊</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={playback?.volume || 50}
                  onChange={(e) =>
                    playbackAction('volume', { level: parseInt(e.target.value) })
                  }
                  className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-gray-500 text-sm w-8">
                  {playback?.volume || 50}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {providers.map((provider) => (
          <div
            key={provider.name}
            className={`bg-gray-900 rounded-xl border p-4 cursor-pointer transition-colors ${
              activeProvider === provider.name
                ? 'border-blue-500'
                : 'border-gray-800 hover:border-gray-700'
            }`}
            onClick={() => setActiveProvider(provider.name)}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{provider.icon}</span>
              <div>
                <h3 className="font-medium text-white">{provider.displayName}</h3>
                <p className="text-sm text-gray-400">
                  {provider.connected ? (
                    <span className="text-green-400">
                      Connected
                      {provider.deviceCount
                        ? ` • ${provider.deviceCount} speakers`
                        : ''}
                    </span>
                  ) : (
                    'Not connected'
                  )}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Devices */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Devices</h2>
        <div className="space-y-2">
          {devices.length === 0 ? (
            <p className="text-gray-500">No devices available</p>
          ) : (
            devices.map((device) => (
              <button
                key={device.id}
                onClick={() => transferToDevice(device.id)}
                className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                  device.isActive
                    ? 'bg-green-500/10 border border-green-500/50'
                    : 'bg-gray-800 hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">
                    {device.type === 'computer'
                      ? '🖥️'
                      : device.type === 'speaker'
                        ? '🔊'
                        : device.type === 'phone'
                          ? '📱'
                          : '📺'}
                  </span>
                  <div className="text-left">
                    <p className="text-white">{device.name}</p>
                    <p className="text-sm text-gray-400 capitalize">
                      {device.provider} • {device.type}
                    </p>
                  </div>
                </div>
                {device.isActive && (
                  <span className="text-green-400 text-sm">Active</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-gray-900 rounded-xl border border-gray-800">
        <div className="flex border-b border-gray-800">
          {(['playlists', 'queue', 'recent', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium transition-colors capitalize ${
                activeTab === tab
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'playlists' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {playlists.length === 0 ? (
                <p className="text-gray-500 col-span-full">
                  No playlists available. Connect a music service to see your playlists.
                </p>
              ) : (
                playlists.map((playlist) => (
                  <div
                    key={playlist.id}
                    className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-700 cursor-pointer transition-colors"
                  >
                    <div className="w-12 h-12 bg-gray-700 rounded flex items-center justify-center shrink-0">
                      {playlist.artworkUrl ? (
                        <img
                          src={playlist.artworkUrl}
                          alt={playlist.name}
                          className="w-full h-full object-cover rounded"
                        />
                      ) : (
                        <span>🎵</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">{playlist.name}</p>
                      <p className="text-sm text-gray-400 truncate">
                        {playlist.trackCount} tracks • {playlist.owner}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'queue' && (
            <p className="text-gray-500">
              Queue will show upcoming tracks when connected to a music service.
            </p>
          )}

          {activeTab === 'recent' && (
            <p className="text-gray-500">
              Recently played tracks will appear here.
            </p>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Default Provider
                </label>
                <select
                  value={activeProvider}
                  onChange={(e) => setActiveProvider(e.target.value)}
                  className="w-full max-w-xs bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                >
                  {providers.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-2">
                  Connected Services
                </h3>
                <div className="space-y-2">
                  {providers.map((provider) => (
                    <div
                      key={provider.name}
                      className="flex items-center justify-between py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span>{provider.icon}</span>
                        <span className="text-white">{provider.displayName}</span>
                      </div>
                      {provider.connected ? (
                        <button className="text-sm text-red-400 hover:text-red-300">
                          Disconnect
                        </button>
                      ) : (
                        <button
                          onClick={() => connectProvider(provider.name)}
                          className="text-sm text-blue-400 hover:text-blue-300"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
