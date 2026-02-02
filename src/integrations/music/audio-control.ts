/**
 * Music Control Integration - System Audio Control
 *
 * System-level audio control using platform-specific methods (primarily macOS via osascript)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { AudioControlConfig } from './config.js';
import type { AudioDevice } from './types.js';
import { MusicError, MUSIC_ERROR_CODES } from './types.js';

const execAsync = promisify(exec);

/**
 * System Audio Control Integration
 *
 * Provides system-level volume control and output device management.
 * Primary support for macOS using osascript/AppleScript.
 */
export class AudioControlIntegration {
  private config: AudioControlConfig;
  private platform: NodeJS.Platform;

  constructor(config: AudioControlConfig) {
    this.config = config;
    this.platform = process.platform;
  }

  /**
   * Check if audio control is supported on this platform
   */
  isSupported(): boolean {
    return this.platform === 'darwin'; // macOS
  }

  /**
   * Check if enabled and supported
   */
  isEnabled(): boolean {
    return this.config.enabled && this.isSupported();
  }

  // ==================== Volume Control ====================

  /**
   * Get current system volume (0-100)
   */
  async getVolume(): Promise<number> {
    this.requireSupport();

    if (this.platform === 'darwin') {
      const { stdout } = await execAsync(
        `osascript -e 'output volume of (get volume settings)'`,
      );
      return parseInt(stdout.trim(), 10);
    }

    throw new MusicError(
      'Platform not supported',
      MUSIC_ERROR_CODES.PLATFORM_NOT_SUPPORTED,
      'system',
    );
  }

  /**
   * Set system volume (0-100)
   */
  async setVolume(level: number): Promise<void> {
    this.requireSupport();

    const volume = Math.max(0, Math.min(100, Math.round(level)));

    if (this.platform === 'darwin') {
      await execAsync(`osascript -e 'set volume output volume ${volume}'`);
      return;
    }

    throw new MusicError(
      'Platform not supported',
      MUSIC_ERROR_CODES.PLATFORM_NOT_SUPPORTED,
      'system',
    );
  }

  /**
   * Increase volume by amount
   */
  async increaseVolume(amount = 10): Promise<number> {
    const current = await this.getVolume();
    const newLevel = Math.min(100, current + amount);
    await this.setVolume(newLevel);
    return newLevel;
  }

  /**
   * Decrease volume by amount
   */
  async decreaseVolume(amount = 10): Promise<number> {
    const current = await this.getVolume();
    const newLevel = Math.max(0, current - amount);
    await this.setVolume(newLevel);
    return newLevel;
  }

  // ==================== Mute Control ====================

  /**
   * Check if system is muted
   */
  async isMuted(): Promise<boolean> {
    this.requireSupport();

    if (this.platform === 'darwin') {
      const { stdout } = await execAsync(
        `osascript -e 'output muted of (get volume settings)'`,
      );
      return stdout.trim().toLowerCase() === 'true';
    }

    throw new MusicError(
      'Platform not supported',
      MUSIC_ERROR_CODES.PLATFORM_NOT_SUPPORTED,
      'system',
    );
  }

  /**
   * Mute system audio
   */
  async mute(): Promise<void> {
    this.requireSupport();

    if (this.platform === 'darwin') {
      await execAsync(`osascript -e 'set volume output muted true'`);
      return;
    }

    throw new MusicError(
      'Platform not supported',
      MUSIC_ERROR_CODES.PLATFORM_NOT_SUPPORTED,
      'system',
    );
  }

  /**
   * Unmute system audio
   */
  async unmute(): Promise<void> {
    this.requireSupport();

    if (this.platform === 'darwin') {
      await execAsync(`osascript -e 'set volume output muted false'`);
      return;
    }

    throw new MusicError(
      'Platform not supported',
      MUSIC_ERROR_CODES.PLATFORM_NOT_SUPPORTED,
      'system',
    );
  }

  /**
   * Toggle mute state
   */
  async toggleMute(): Promise<boolean> {
    const muted = await this.isMuted();
    if (muted) {
      await this.unmute();
    } else {
      await this.mute();
    }
    return !muted;
  }

  // ==================== Output Device Control ====================

  /**
   * Get available output devices
   */
  async getOutputDevices(): Promise<AudioDevice[]> {
    this.requireSupport();

    if (this.platform === 'darwin') {
      return this.getMacOutputDevices();
    }

    throw new MusicError(
      'Platform not supported',
      MUSIC_ERROR_CODES.PLATFORM_NOT_SUPPORTED,
      'system',
    );
  }

  /**
   * Get current output device
   */
  async getCurrentDevice(): Promise<AudioDevice | null> {
    this.requireSupport();

    if (this.platform === 'darwin') {
      return this.getMacCurrentDevice();
    }

    throw new MusicError(
      'Platform not supported',
      MUSIC_ERROR_CODES.PLATFORM_NOT_SUPPORTED,
      'system',
    );
  }

  /**
   * Set output device by name
   */
  async setOutputDevice(deviceName: string): Promise<void> {
    this.requireSupport();

    if (this.platform === 'darwin') {
      await this.setMacOutputDevice(deviceName);
      return;
    }

    throw new MusicError(
      'Platform not supported',
      MUSIC_ERROR_CODES.PLATFORM_NOT_SUPPORTED,
      'system',
    );
  }

  // ==================== Media Key Control (macOS) ====================

  /**
   * Send media key press (play/pause)
   */
  async playPause(): Promise<void> {
    this.requireSupport();

    if (this.platform === 'darwin') {
      // Using AppleScript to send media key
      await execAsync(`osascript -e 'tell application "System Events" to key code 16 using {command down, option down}'`);
      // Alternative: Use media key directly if available
      try {
        await execAsync(
          `osascript -e 'tell application "Music" to playpause'`,
        );
      } catch {
        // Music app might not be running, that's OK
      }
      return;
    }

    throw new MusicError(
      'Platform not supported',
      MUSIC_ERROR_CODES.PLATFORM_NOT_SUPPORTED,
      'system',
    );
  }

  /**
   * Send next track command
   */
  async nextTrack(): Promise<void> {
    this.requireSupport();

    if (this.platform === 'darwin') {
      try {
        await execAsync(
          `osascript -e 'tell application "Music" to next track'`,
        );
      } catch {
        // Try Spotify as fallback
        try {
          await execAsync(
            `osascript -e 'tell application "Spotify" to next track'`,
          );
        } catch {
          // No player responding
        }
      }
      return;
    }

    throw new MusicError(
      'Platform not supported',
      MUSIC_ERROR_CODES.PLATFORM_NOT_SUPPORTED,
      'system',
    );
  }

  /**
   * Send previous track command
   */
  async previousTrack(): Promise<void> {
    this.requireSupport();

    if (this.platform === 'darwin') {
      try {
        await execAsync(
          `osascript -e 'tell application "Music" to previous track'`,
        );
      } catch {
        // Try Spotify as fallback
        try {
          await execAsync(
            `osascript -e 'tell application "Spotify" to previous track'`,
          );
        } catch {
          // No player responding
        }
      }
      return;
    }

    throw new MusicError(
      'Platform not supported',
      MUSIC_ERROR_CODES.PLATFORM_NOT_SUPPORTED,
      'system',
    );
  }

  // ==================== macOS Specific Methods ====================

  /**
   * Get output devices on macOS using system_profiler
   */
  private async getMacOutputDevices(): Promise<AudioDevice[]> {
    try {
      // Use system_profiler to get audio devices
      const { stdout } = await execAsync(
        `system_profiler SPAudioDataType -json`,
      );
      const data = JSON.parse(stdout);
      const devices: AudioDevice[] = [];

      const audioData = data?.SPAudioDataType?.[0];
      if (audioData?._items) {
        for (const item of audioData._items) {
          if (item._name && item.coreaudio_output_source) {
            devices.push({
              id: item._name,
              name: item._name,
              type: 'output',
              isDefault: item.coreaudio_default_audio_output_device === 'yes',
            });
          }
        }
      }

      // If system_profiler didn't work well, fall back to common devices
      if (devices.length === 0) {
        devices.push({
          id: 'built-in',
          name: 'Built-in Output',
          type: 'output',
          isDefault: true,
        });
      }

      return devices;
    } catch {
      // Return a minimal list if parsing fails
      return [
        {
          id: 'built-in',
          name: 'Built-in Output',
          type: 'output',
          isDefault: true,
        },
      ];
    }
  }

  /**
   * Get current output device on macOS
   */
  private async getMacCurrentDevice(): Promise<AudioDevice | null> {
    try {
      const devices = await this.getMacOutputDevices();
      return devices.find((d) => d.isDefault) || devices[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Set output device on macOS
   *
   * Note: This requires a tool like `SwitchAudioSource` to be installed.
   * Install with: brew install switchaudio-osx
   */
  private async setMacOutputDevice(deviceName: string): Promise<void> {
    try {
      // Try using SwitchAudioSource if available
      await execAsync(`SwitchAudioSource -s "${deviceName}"`);
    } catch {
      // SwitchAudioSource not installed, try alternative methods
      try {
        // Use AppleScript to open Sound preferences
        // This is a fallback that at least shows the user the right place
        await execAsync(
          `osascript -e 'tell application "System Preferences"
            activate
            set current pane to pane "com.apple.preference.sound"
          end tell'`,
        );
        throw new MusicError(
          'Please install switchaudio-osx to programmatically change audio devices: brew install switchaudio-osx',
          MUSIC_ERROR_CODES.PLATFORM_NOT_SUPPORTED,
          'system',
        );
      } catch (e) {
        if (e instanceof MusicError) throw e;
        throw new MusicError(
          'Failed to set output device. Install switchaudio-osx: brew install switchaudio-osx',
          MUSIC_ERROR_CODES.PLATFORM_NOT_SUPPORTED,
          'system',
        );
      }
    }
  }

  // ==================== Helper Methods ====================

  /**
   * Require platform support
   */
  private requireSupport(): void {
    if (!this.isSupported()) {
      throw new MusicError(
        `Audio control not supported on ${this.platform}`,
        MUSIC_ERROR_CODES.PLATFORM_NOT_SUPPORTED,
        'system',
      );
    }

    if (!this.config.enabled) {
      throw new MusicError(
        'Audio control is disabled',
        MUSIC_ERROR_CODES.NOT_CONNECTED,
        'system',
      );
    }
  }

  /**
   * Get current state summary
   */
  async getState(): Promise<{
    volume: number;
    muted: boolean;
    device: AudioDevice | null;
  }> {
    if (!this.isEnabled()) {
      return { volume: 0, muted: false, device: null };
    }

    const [volume, muted, device] = await Promise.all([
      this.getVolume().catch(() => 0),
      this.isMuted().catch(() => false),
      this.getCurrentDevice().catch(() => null),
    ]);

    return { volume, muted, device };
  }
}

/**
 * Create audio control integration with default config
 */
export function createAudioControl(
  config?: Partial<AudioControlConfig>,
): AudioControlIntegration {
  return new AudioControlIntegration({
    enabled: true,
    ...config,
  });
}
