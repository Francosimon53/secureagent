'use client';

import { useState, useEffect } from 'react';

interface Session {
  id: string;
  userId: string;
  channel: 'telegram' | 'discord' | 'whatsapp' | 'slack' | 'web';
  startedAt: Date;
  lastActivity: Date;
  messageCount: number;
  status: 'active' | 'idle' | 'ended';
  metadata: {
    username?: string;
    chatTitle?: string;
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://secureagent.vercel.app';

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulated sessions - in production, fetch from API
    const generateSessions = (): Session[] => {
      const channels: Session['channel'][] = ['telegram', 'discord', 'whatsapp', 'slack', 'web'];
      const usernames = ['alice', 'bob', 'charlie', 'diana', 'eve', 'frank'];

      return Array.from({ length: 15 }, (_, i) => {
        const channel = channels[Math.floor(Math.random() * channels.length)];
        const startedAt = new Date(Date.now() - Math.random() * 86400000 * 3);
        const lastActivity = new Date(startedAt.getTime() + Math.random() * (Date.now() - startedAt.getTime()));
        const timeSinceActivity = Date.now() - lastActivity.getTime();
        const status: Session['status'] = timeSinceActivity < 300000 ? 'active' : timeSinceActivity < 1800000 ? 'idle' : 'ended';

        return {
          id: `session-${i + 1}`,
          userId: `user-${Math.floor(Math.random() * 100)}`,
          channel,
          startedAt,
          lastActivity,
          messageCount: Math.floor(Math.random() * 50) + 1,
          status,
          metadata: {
            username: usernames[Math.floor(Math.random() * usernames.length)],
            chatTitle: channel === 'telegram' ? 'Private Chat' : undefined,
          },
        };
      }).sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
    };

    setSessions(generateSessions());
    setLoading(false);
  }, []);

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'telegram': return '📱';
      case 'discord': return '🎮';
      case 'whatsapp': return '💬';
      case 'slack': return '💼';
      case 'web': return '🌐';
      default: return '📋';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400 bg-green-400/10';
      case 'idle': return 'text-yellow-400 bg-yellow-400/10';
      case 'ended': return 'text-gray-400 bg-gray-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  const formatDuration = (start: Date, end: Date) => {
    const ms = end.getTime() - start.getTime();
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const filteredSessions = sessions.filter(session => {
    if (filter === 'all') return true;
    if (filter === 'active') return session.status === 'active';
    if (filter === 'idle') return session.status === 'idle';
    return session.channel === filter;
  });

  const endSession = async (sessionId: string) => {
    // In production, call API to end session
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, status: 'ended' as const } : s
    ));
  };

  const stats = {
    active: sessions.filter(s => s.status === 'active').length,
    idle: sessions.filter(s => s.status === 'idle').length,
    total: sessions.length,
    totalMessages: sessions.reduce((sum, s) => sum + s.messageCount, 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sessions</h1>
          <p className="text-gray-400 mt-1">Manage active conversations across all channels</p>
        </div>
        <button
          onClick={() => setSessions([])}
          className="px-4 py-2 bg-red-600/10 hover:bg-red-600/20 border border-red-600/20 rounded-lg text-red-400 transition-colors"
        >
          End All Sessions
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active', value: stats.active, color: 'green' },
          { label: 'Idle', value: stats.idle, color: 'yellow' },
          { label: 'Total Sessions', value: stats.total, color: 'blue' },
          { label: 'Total Messages', value: stats.totalMessages, color: 'purple' },
        ].map((stat, i) => (
          <div key={i} className="p-4 bg-gray-900/50 border border-gray-800 rounded-xl">
            <p className={`text-2xl font-bold text-${stat.color}-400`}>{stat.value}</p>
            <p className="text-gray-400 text-sm">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {['all', 'active', 'idle', 'telegram', 'discord', 'whatsapp', 'slack', 'web'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {f === 'all' ? 'All Sessions' : f}
          </button>
        ))}
      </div>

      {/* Sessions List */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading sessions...</div>
        ) : filteredSessions.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No sessions match your filter</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {filteredSessions.map((session) => (
              <div key={session.id} className="p-4 hover:bg-gray-800/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{getChannelIcon(session.channel)}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">
                          {session.metadata.username || session.userId}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(session.status)}`}>
                          {session.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-400 mt-1">
                        <span className="capitalize">{session.channel}</span>
                        <span>•</span>
                        <span>{session.messageCount} messages</span>
                        <span>•</span>
                        <span>Duration: {formatDuration(session.startedAt, session.lastActivity)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">
                      {formatTimeAgo(session.lastActivity)}
                    </span>
                    {session.status !== 'ended' && (
                      <button
                        onClick={() => endSession(session.id)}
                        className="px-3 py-1 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-300 transition-colors"
                      >
                        End
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
