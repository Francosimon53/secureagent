/**
 * Music Control Integration - Sonos
 *
 * Sonos speaker control using SSDP discovery and UPnP/SOAP API
 */

import type { SonosConfig } from './config.js';
import type {
  SonosSpeaker,
  SonosGroup,
  Track,
  PlaybackContext,
  PlaybackState,
  RepeatMode,
} from './types.js';
import { MusicError, MUSIC_ERROR_CODES } from './types.js';

const SONOS_UPNP_PORT = 1400;

/**
 * Sonos Integration
 */
export class SonosIntegration {
  private config: SonosConfig;
  private speakers: Map<string, SonosSpeaker> = new Map();
  private groups: Map<string, SonosGroup> = new Map();
  private discoveryInterval?: NodeJS.Timeout;

  constructor(config: SonosConfig) {
    this.config = config;
  }

  /**
   * Initialize and discover speakers
   */
  async initialize(): Promise<void> {
    if (this.config.speakerIps && this.config.speakerIps.length > 0) {
      // Use provided IPs
      await this.connectToSpeakers(this.config.speakerIps);
    } else if (this.config.autoDiscover) {
      // Auto-discover speakers on network
      await this.discover();
    }

    // Set up periodic refresh if configured
    if (this.config.refreshInterval && this.config.refreshInterval > 0) {
      this.discoveryInterval = setInterval(
        () => this.refreshTopology(),
        this.config.refreshInterval,
      );
    }
  }

  /**
   * Stop discovery and clean up
   */
  async disconnect(): Promise<void> {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = undefined;
    }
    this.speakers.clear();
    this.groups.clear();
  }

  /**
   * Check if any speakers are connected
   */
  isConnected(): boolean {
    return this.speakers.size > 0;
  }

  /**
   * Discover Sonos speakers using SSDP
   */
  async discover(): Promise<SonosSpeaker[]> {
    try {
      // Use SSDP to discover Sonos devices
      const speakers = await this.ssdpDiscover();

      for (const speaker of speakers) {
        this.speakers.set(speaker.id, speaker);
      }

      // Build group topology
      await this.refreshTopology();

      return Array.from(this.speakers.values());
    } catch (error) {
      throw new MusicError(
        'Failed to discover Sonos speakers',
        MUSIC_ERROR_CODES.SONOS_DISCOVERY_FAILED,
        'sonos',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Connect to specific speaker IPs
   */
  private async connectToSpeakers(ips: string[]): Promise<void> {
    for (const ip of ips) {
      try {
        const speaker = await this.getSpeakerInfo(ip);
        if (speaker) {
          this.speakers.set(speaker.id, speaker);
        }
      } catch (error) {
        console.warn(`Failed to connect to Sonos at ${ip}:`, error);
      }
    }
    await this.refreshTopology();
  }

  /**
   * SSDP discovery for Sonos devices
   */
  private async ssdpDiscover(): Promise<SonosSpeaker[]> {
    // Simple SSDP M-SEARCH for Sonos devices
    const dgram = await import('dgram');

    return new Promise((resolve) => {
      const speakers: SonosSpeaker[] = [];
      const discoveredIps = new Set<string>();

      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      const searchMessage = Buffer.from(
        'M-SEARCH * HTTP/1.1\r\n' +
        'HOST: 239.255.255.250:1900\r\n' +
        'MAN: "ssdp:discover"\r\n' +
        'MX: 3\r\n' +
        'ST: urn:schemas-upnp-org:device:ZonePlayer:1\r\n' +
        '\r\n'
      );

      socket.on('message', async (msg, rinfo) => {
        const response = msg.toString();
        if (response.includes('Sonos') && !discoveredIps.has(rinfo.address)) {
          discoveredIps.add(rinfo.address);
          try {
            const speaker = await this.getSpeakerInfo(rinfo.address);
            if (speaker) {
              speakers.push(speaker);
            }
          } catch {
            // Ignore individual speaker errors during discovery
          }
        }
      });

      socket.on('error', () => {
        socket.close();
        resolve(speakers);
      });

      socket.bind(() => {
        socket.addMembership('239.255.255.250');
        socket.send(searchMessage, 0, searchMessage.length, 1900, '239.255.255.250');
      });

      // Complete discovery after timeout
      setTimeout(() => {
        socket.close();
        resolve(speakers);
      }, 5000);
    });
  }

  /**
   * Get speaker information from IP
   */
  private async getSpeakerInfo(ip: string): Promise<SonosSpeaker | null> {
    try {
      const response = await fetch(
        `http://${ip}:${SONOS_UPNP_PORT}/xml/device_description.xml`,
        { signal: AbortSignal.timeout(5000) },
      );

      if (!response.ok) {
        return null;
      }

      const xml = await response.text();

      // Parse basic device info from XML
      const udn = this.extractXmlValue(xml, 'UDN') || `uuid:${ip}`;
      const roomName = this.extractXmlValue(xml, 'roomName') ||
                       this.extractXmlValue(xml, 'friendlyName') ||
                       `Sonos (${ip})`;
      const modelName = this.extractXmlValue(xml, 'modelName') || 'Sonos Speaker';

      return {
        id: udn.replace('uuid:', ''),
        name: roomName,
        type: 'speaker',
        isActive: false,
        provider: 'sonos',
        ip,
        model: modelName,
        roomName,
        isCoordinator: true, // Will be updated by topology
      };
    } catch {
      return null;
    }
  }

  /**
   * Refresh group topology
   */
  private async refreshTopology(): Promise<void> {
    this.groups.clear();

    for (const speaker of this.speakers.values()) {
      try {
        const topology = await this.getZoneGroupState(speaker.ip);
        if (topology) {
          this.processTopology(topology);
        }
        break; // Only need topology from one speaker
      } catch {
        continue;
      }
    }
  }

  /**
   * Get zone group state from speaker
   */
  private async getZoneGroupState(ip: string): Promise<string | null> {
    const soapAction = 'urn:schemas-upnp-org:service:ZoneGroupTopology:1#GetZoneGroupState';
    const soapBody = `
      <u:GetZoneGroupState xmlns:u="urn:schemas-upnp-org:service:ZoneGroupTopology:1">
      </u:GetZoneGroupState>
    `;

    try {
      const response = await this.soapRequest(
        ip,
        '/ZoneGroupTopology/Control',
        soapAction,
        soapBody,
      );
      return response;
    } catch {
      return null;
    }
  }

  /**
   * Process topology XML into groups
   */
  private processTopology(xml: string): void {
    // Simple XML parsing for group information
    const groupMatches = xml.matchAll(/<ZoneGroup[^>]*Coordinator="([^"]+)"[^>]*>/g);

    for (const match of groupMatches) {
      const coordinatorId = match[1];
      const coordinator = this.findSpeakerByUuid(coordinatorId);

      if (coordinator) {
        coordinator.isCoordinator = true;
        const group: SonosGroup = {
          id: coordinatorId,
          name: coordinator.roomName,
          coordinator,
          members: [coordinator],
        };
        this.groups.set(coordinatorId, group);
      }
    }
  }

  /**
   * Find speaker by UUID
   */
  private findSpeakerByUuid(uuid: string): SonosSpeaker | undefined {
    for (const speaker of this.speakers.values()) {
      if (speaker.id === uuid || speaker.id.includes(uuid)) {
        return speaker;
      }
    }
    return undefined;
  }

  // ==================== Playback Control ====================

  /**
   * Get speaker or group coordinator by room name
   */
  private getSpeakerByRoom(room?: string): SonosSpeaker | null {
    if (!room) {
      room = this.config.defaultRoom;
    }

    if (room) {
      for (const speaker of this.speakers.values()) {
        if (
          speaker.roomName.toLowerCase() === room.toLowerCase() ||
          speaker.name.toLowerCase() === room.toLowerCase()
        ) {
          return speaker;
        }
      }
    }

    // Return first available coordinator
    for (const speaker of this.speakers.values()) {
      if (speaker.isCoordinator) {
        return speaker;
      }
    }

    // Return any speaker
    const firstSpeaker = this.speakers.values().next();
    return firstSpeaker.done ? null : firstSpeaker.value;
  }

  /**
   * Play on specified room
   */
  async play(room?: string): Promise<void> {
    const speaker = this.getSpeakerByRoom(room);
    if (!speaker) {
      throw new MusicError(
        'No Sonos speaker found',
        MUSIC_ERROR_CODES.DEVICE_NOT_FOUND,
        'sonos',
      );
    }

    await this.avTransportAction(speaker.ip, 'Play', { Speed: '1' });
  }

  /**
   * Pause on specified room
   */
  async pause(room?: string): Promise<void> {
    const speaker = this.getSpeakerByRoom(room);
    if (!speaker) {
      throw new MusicError(
        'No Sonos speaker found',
        MUSIC_ERROR_CODES.DEVICE_NOT_FOUND,
        'sonos',
      );
    }

    await this.avTransportAction(speaker.ip, 'Pause');
  }

  /**
   * Stop playback
   */
  async stop(room?: string): Promise<void> {
    const speaker = this.getSpeakerByRoom(room);
    if (!speaker) {
      throw new MusicError(
        'No Sonos speaker found',
        MUSIC_ERROR_CODES.DEVICE_NOT_FOUND,
        'sonos',
      );
    }

    await this.avTransportAction(speaker.ip, 'Stop');
  }

  /**
   * Skip to next track
   */
  async next(room?: string): Promise<void> {
    const speaker = this.getSpeakerByRoom(room);
    if (!speaker) {
      throw new MusicError(
        'No Sonos speaker found',
        MUSIC_ERROR_CODES.DEVICE_NOT_FOUND,
        'sonos',
      );
    }

    await this.avTransportAction(speaker.ip, 'Next');
  }

  /**
   * Go to previous track
   */
  async previous(room?: string): Promise<void> {
    const speaker = this.getSpeakerByRoom(room);
    if (!speaker) {
      throw new MusicError(
        'No Sonos speaker found',
        MUSIC_ERROR_CODES.DEVICE_NOT_FOUND,
        'sonos',
      );
    }

    await this.avTransportAction(speaker.ip, 'Previous');
  }

  /**
   * Seek to position
   */
  async seek(position: number, room?: string): Promise<void> {
    const speaker = this.getSpeakerByRoom(room);
    if (!speaker) {
      throw new MusicError(
        'No Sonos speaker found',
        MUSIC_ERROR_CODES.DEVICE_NOT_FOUND,
        'sonos',
      );
    }

    const hours = Math.floor(position / 3600000);
    const minutes = Math.floor((position % 3600000) / 60000);
    const seconds = Math.floor((position % 60000) / 1000);
    const target = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    await this.avTransportAction(speaker.ip, 'Seek', {
      Unit: 'REL_TIME',
      Target: target,
    });
  }

  /**
   * Set volume for room
   */
  async setVolume(level: number, room?: string): Promise<void> {
    const speaker = this.getSpeakerByRoom(room);
    if (!speaker) {
      throw new MusicError(
        'No Sonos speaker found',
        MUSIC_ERROR_CODES.DEVICE_NOT_FOUND,
        'sonos',
      );
    }

    const volume = Math.max(0, Math.min(100, Math.round(level)));
    await this.renderingControlAction(speaker.ip, 'SetVolume', {
      Channel: 'Master',
      DesiredVolume: volume.toString(),
    });
  }

  /**
   * Get volume for room
   */
  async getVolume(room?: string): Promise<number> {
    const speaker = this.getSpeakerByRoom(room);
    if (!speaker) {
      throw new MusicError(
        'No Sonos speaker found',
        MUSIC_ERROR_CODES.DEVICE_NOT_FOUND,
        'sonos',
      );
    }

    const response = await this.renderingControlAction(speaker.ip, 'GetVolume', {
      Channel: 'Master',
    });

    const match = response.match(/<CurrentVolume>(\d+)<\/CurrentVolume>/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Mute/unmute room
   */
  async setMute(muted: boolean, room?: string): Promise<void> {
    const speaker = this.getSpeakerByRoom(room);
    if (!speaker) {
      throw new MusicError(
        'No Sonos speaker found',
        MUSIC_ERROR_CODES.DEVICE_NOT_FOUND,
        'sonos',
      );
    }

    await this.renderingControlAction(speaker.ip, 'SetMute', {
      Channel: 'Master',
      DesiredMute: muted ? '1' : '0',
    });
  }

  // ==================== Playback State ====================

  /**
   * Get current playback state
   */
  async getPlayback(room?: string): Promise<PlaybackContext | null> {
    const speaker = this.getSpeakerByRoom(room);
    if (!speaker) {
      return null;
    }

    try {
      const [transportInfo, positionInfo, volume] = await Promise.all([
        this.getTransportInfo(speaker.ip),
        this.getPositionInfo(speaker.ip),
        this.getVolume(room),
      ]);

      const state = this.mapTransportState(transportInfo);
      const track = this.parseTrackFromPositionInfo(positionInfo);

      return {
        track,
        position: this.parsePosition(positionInfo),
        state,
        volume,
        shuffle: false, // Would need additional query
        repeat: 'off',
        device: speaker,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get now playing track
   */
  async getNowPlaying(room?: string): Promise<Track | null> {
    const speaker = this.getSpeakerByRoom(room);
    if (!speaker) {
      return null;
    }

    const positionInfo = await this.getPositionInfo(speaker.ip);
    return this.parseTrackFromPositionInfo(positionInfo);
  }

  // ==================== Rooms & Groups ====================

  /**
   * Get all discovered rooms/speakers
   */
  getRooms(): SonosSpeaker[] {
    return Array.from(this.speakers.values());
  }

  /**
   * Get all speaker groups
   */
  getGroups(): SonosGroup[] {
    return Array.from(this.groups.values());
  }

  /**
   * Group speakers together
   */
  async groupSpeakers(coordinatorRoom: string, memberRooms: string[]): Promise<void> {
    const coordinator = this.getSpeakerByRoom(coordinatorRoom);
    if (!coordinator) {
      throw new MusicError(
        `Room not found: ${coordinatorRoom}`,
        MUSIC_ERROR_CODES.DEVICE_NOT_FOUND,
        'sonos',
      );
    }

    for (const roomName of memberRooms) {
      const member = this.getSpeakerByRoom(roomName);
      if (member && member.id !== coordinator.id) {
        await this.avTransportAction(member.ip, 'SetAVTransportURI', {
          CurrentURI: `x-rincon:${coordinator.id}`,
          CurrentURIMetaData: '',
        });
      }
    }

    await this.refreshTopology();
  }

  /**
   * Remove speaker from group
   */
  async ungroupSpeaker(room: string): Promise<void> {
    const speaker = this.getSpeakerByRoom(room);
    if (!speaker) {
      throw new MusicError(
        `Room not found: ${room}`,
        MUSIC_ERROR_CODES.DEVICE_NOT_FOUND,
        'sonos',
      );
    }

    await this.avTransportAction(speaker.ip, 'BecomeCoordinatorOfStandaloneGroup');
    await this.refreshTopology();
  }

  // ==================== Favorites & Playlists ====================

  /**
   * Get Sonos favorites
   */
  async getFavorites(): Promise<{ id: string; title: string; uri: string }[]> {
    const speaker = this.getSpeakerByRoom();
    if (!speaker) {
      return [];
    }

    const response = await this.contentDirectoryAction(speaker.ip, 'Browse', {
      ObjectID: 'FV:2',
      BrowseFlag: 'BrowseDirectChildren',
      Filter: '*',
      StartingIndex: '0',
      RequestedCount: '100',
      SortCriteria: '',
    });

    return this.parseFavorites(response);
  }

  /**
   * Play a Sonos favorite
   */
  async playFavorite(name: string, room?: string): Promise<void> {
    const favorites = await this.getFavorites();
    const favorite = favorites.find(
      (f) => f.title.toLowerCase() === name.toLowerCase(),
    );

    if (!favorite) {
      throw new MusicError(
        `Favorite not found: ${name}`,
        MUSIC_ERROR_CODES.NOT_CONNECTED,
        'sonos',
      );
    }

    await this.playUri(favorite.uri, room);
  }

  /**
   * Play a URI
   */
  async playUri(uri: string, room?: string, metadata = ''): Promise<void> {
    const speaker = this.getSpeakerByRoom(room);
    if (!speaker) {
      throw new MusicError(
        'No Sonos speaker found',
        MUSIC_ERROR_CODES.DEVICE_NOT_FOUND,
        'sonos',
      );
    }

    await this.avTransportAction(speaker.ip, 'SetAVTransportURI', {
      CurrentURI: uri,
      CurrentURIMetaData: metadata,
    });

    await this.play(room);
  }

  // ==================== SOAP Helpers ====================

  /**
   * Make a SOAP request
   */
  private async soapRequest(
    ip: string,
    path: string,
    soapAction: string,
    body: string,
  ): Promise<string> {
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
        <s:Body>${body}</s:Body>
      </s:Envelope>`;

    const response = await fetch(`http://${ip}:${SONOS_UPNP_PORT}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        SOAPAction: `"${soapAction}"`,
      },
      body: envelope,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new MusicError(
        `SOAP request failed: ${response.status}`,
        MUSIC_ERROR_CODES.API_ERROR,
        'sonos',
      );
    }

    return response.text();
  }

  /**
   * AVTransport service action
   */
  private async avTransportAction(
    ip: string,
    action: string,
    params: Record<string, string> = {},
  ): Promise<string> {
    const paramXml = Object.entries({ InstanceID: '0', ...params })
      .map(([key, value]) => `<${key}>${this.escapeXml(value)}</${key}>`)
      .join('');

    return this.soapRequest(
      ip,
      '/MediaRenderer/AVTransport/Control',
      `urn:schemas-upnp-org:service:AVTransport:1#${action}`,
      `<u:${action} xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">${paramXml}</u:${action}>`,
    );
  }

  /**
   * RenderingControl service action
   */
  private async renderingControlAction(
    ip: string,
    action: string,
    params: Record<string, string> = {},
  ): Promise<string> {
    const paramXml = Object.entries({ InstanceID: '0', ...params })
      .map(([key, value]) => `<${key}>${this.escapeXml(value)}</${key}>`)
      .join('');

    return this.soapRequest(
      ip,
      '/MediaRenderer/RenderingControl/Control',
      `urn:schemas-upnp-org:service:RenderingControl:1#${action}`,
      `<u:${action} xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1">${paramXml}</u:${action}>`,
    );
  }

  /**
   * ContentDirectory service action
   */
  private async contentDirectoryAction(
    ip: string,
    action: string,
    params: Record<string, string> = {},
  ): Promise<string> {
    const paramXml = Object.entries(params)
      .map(([key, value]) => `<${key}>${this.escapeXml(value)}</${key}>`)
      .join('');

    return this.soapRequest(
      ip,
      '/MediaServer/ContentDirectory/Control',
      `urn:schemas-upnp-org:service:ContentDirectory:1#${action}`,
      `<u:${action} xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">${paramXml}</u:${action}>`,
    );
  }

  /**
   * Get transport info
   */
  private async getTransportInfo(ip: string): Promise<string> {
    return this.avTransportAction(ip, 'GetTransportInfo');
  }

  /**
   * Get position info
   */
  private async getPositionInfo(ip: string): Promise<string> {
    return this.avTransportAction(ip, 'GetPositionInfo');
  }

  // ==================== Parsing Helpers ====================

  private extractXmlValue(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1] : null;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private mapTransportState(xml: string): PlaybackState {
    const state = this.extractXmlValue(xml, 'CurrentTransportState');
    const stateMap: Record<string, PlaybackState> = {
      PLAYING: 'playing',
      PAUSED_PLAYBACK: 'paused',
      STOPPED: 'stopped',
      TRANSITIONING: 'buffering',
    };
    return stateMap[state || ''] || 'stopped';
  }

  private parseTrackFromPositionInfo(xml: string): Track | null {
    const title = this.extractXmlValue(xml, 'dc:title') ||
                  this.extractXmlValue(xml, 'TrackURI')?.split('/').pop() ||
                  'Unknown';
    const artist = this.extractXmlValue(xml, 'dc:creator') || 'Unknown Artist';
    const album = this.extractXmlValue(xml, 'upnp:album') || '';
    const duration = this.parseDuration(
      this.extractXmlValue(xml, 'TrackDuration') || '0:00:00',
    );
    const artworkUrl = this.extractXmlValue(xml, 'upnp:albumArtURI') || undefined;

    if (title === 'Unknown' && artist === 'Unknown Artist') {
      return null;
    }

    return {
      id: this.extractXmlValue(xml, 'TrackURI') || '',
      name: title,
      artist,
      album,
      duration,
      artworkUrl,
      uri: this.extractXmlValue(xml, 'TrackURI') || undefined,
      provider: 'sonos',
    };
  }

  private parsePosition(xml: string): number {
    const relTime = this.extractXmlValue(xml, 'RelTime');
    return relTime ? this.parseDuration(relTime) : 0;
  }

  private parseDuration(timeStr: string): number {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) {
      return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    }
    return 0;
  }

  private parseFavorites(
    xml: string,
  ): { id: string; title: string; uri: string }[] {
    const favorites: { id: string; title: string; uri: string }[] = [];

    // Simple parsing of DIDL-Lite results
    const itemRegex = /<item[^>]*id="([^"]*)"[^>]*>[\s\S]*?<dc:title>([^<]*)<\/dc:title>[\s\S]*?<res[^>]*>([^<]*)<\/res>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      favorites.push({
        id: match[1],
        title: match[2],
        uri: match[3],
      });
    }

    return favorites;
  }
}
