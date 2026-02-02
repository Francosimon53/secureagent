'use client';

import { useState, useEffect } from 'react';

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug' | 'success';
  source: string;
  message: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Simulated logs - in production, fetch from API
  useEffect(() => {
    const generateLog = (): LogEntry => {
      const levels: LogEntry['level'][] = ['info', 'info', 'success', 'success', 'warn', 'error', 'debug'];
      const sources = ['telegram', 'discord', 'slack', 'whatsapp', 'agent', 'api'];
      const messages: Record<LogEntry['level'], string[]> = {
        info: [
          'Message received from user',
          'Processing request',
          'API call to Claude',
          'Webhook received',
          'Session created',
        ],
        success: [
          'Response sent successfully',
          'Connection established',
          'Tool execution completed',
          'Authentication successful',
          'Task completed',
        ],
        warn: [
          'Rate limit applied',
          'Session expiring soon',
          'High latency detected',
          'Retry attempt initiated',
        ],
        error: [
          'Connection failed',
          'Authentication error',
          'API timeout',
          'Invalid request',
        ],
        debug: [
          'Session expired',
          'Cache cleared',
          'Memory usage: 45%',
          'Request logged',
        ],
      };
      const level = levels[Math.floor(Math.random() * levels.length)];
      const levelMessages = messages[level];

      return {
        id: Math.random().toString(36).slice(2),
        timestamp: new Date(),
        level,
        source: sources[Math.floor(Math.random() * sources.length)],
        message: levelMessages[Math.floor(Math.random() * levelMessages.length)],
      };
    };

    // Initial logs
    setLogs(Array.from({ length: 20 }, generateLog));

    // Auto-refresh
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(() => {
        setLogs(prev => [generateLog(), ...prev.slice(0, 99)]);
      }, 3000);
    }

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'info': return 'text-blue-400 bg-blue-400/10';
      case 'success': return 'text-green-400 bg-green-400/10';
      case 'warn': return 'text-yellow-400 bg-yellow-400/10';
      case 'error': return 'text-red-400 bg-red-400/10';
      case 'debug': return 'text-gray-400 bg-gray-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'telegram': return '📱';
      case 'discord': return '🎮';
      case 'slack': return '💼';
      case 'whatsapp': return '💬';
      case 'agent': return '🤖';
      case 'api': return '🔌';
      default: return '📋';
    }
  };

  const filteredLogs = logs.filter(log => {
    if (filter !== 'all' && log.level !== filter) return false;
    if (search && !log.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const clearLogs = () => setLogs([]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Logs</h1>
          <p className="text-gray-400 mt-1">Monitor system activity in real-time</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 rounded-lg border transition-colors ${
              autoRefresh
                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                : 'bg-gray-800 border-gray-700 text-gray-400'
            }`}
          >
            {autoRefresh ? '● Live' : '○ Paused'}
          </button>
          <button
            onClick={clearLogs}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-300"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex gap-2">
          {['all', 'info', 'success', 'warn', 'error', 'debug'].map((level) => (
            <button
              key={level}
              onClick={() => setFilter(level)}
              className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                filter === level
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search logs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Logs Table */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Level</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm text-gray-400 font-mono">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-medium uppercase ${getLevelColor(log.level)}`}>
                      {log.level}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span>{getSourceIcon(log.source)}</span>
                      <span className="text-sm text-gray-300 capitalize">{log.source}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-200">{log.message}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredLogs.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No logs match your filters
          </div>
        )}
      </div>
    </div>
  );
}
