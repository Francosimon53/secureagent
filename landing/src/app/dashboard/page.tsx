'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

interface ChannelStatus {
  name: string;
  status: 'online' | 'offline' | 'error';
  icon: string;
  endpoint: string;
  configured: boolean;
}

interface SystemStats {
  uptime: string;
  totalMessages: number;
  activeSessions: number;
  apiCalls: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://secureagent.vercel.app';

export default function DashboardPage() {
  const { data: session } = useSession();
  const [showOnboardingBanner, setShowOnboardingBanner] = useState(false);

  useEffect(() => {
    // Check if user has completed onboarding
    const hasCompletedOnboarding = document.cookie.includes('onboarding_completed=true');
    setShowOnboardingBanner(!hasCompletedOnboarding);
  }, []);

  const dismissOnboarding = () => {
    document.cookie = 'onboarding_completed=true; path=/; max-age=31536000';
    setShowOnboardingBanner(false);
  };

  const [channels, setChannels] = useState<ChannelStatus[]>([
    { name: 'Telegram', status: 'offline', icon: '📱', endpoint: '/api/telegram', configured: false },
    { name: 'Discord', status: 'offline', icon: '🎮', endpoint: '/api/discord', configured: false },
    { name: 'WhatsApp', status: 'offline', icon: '💬', endpoint: '/api/whatsapp', configured: false },
    { name: 'Slack', status: 'offline', icon: '💼', endpoint: '/api/slack', configured: false },
  ]);

  const [stats, setStats] = useState<SystemStats>({
    uptime: '0h 0m',
    totalMessages: 0,
    activeSessions: 0,
    apiCalls: 0,
  });

  const [healthStatus, setHealthStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [recentActivity, setRecentActivity] = useState<string[]>([]);

  useEffect(() => {
    // Check health status
    fetch(`${API_BASE}/api/health`)
      .then(res => res.json())
      .then(data => {
        setHealthStatus(data.status === 'healthy' ? 'online' : 'offline');
        setRecentActivity(prev => [`System health check: ${data.status}`, ...prev.slice(0, 9)]);
      })
      .catch(() => setHealthStatus('offline'));

    // Check each channel
    channels.forEach(async (channel, index) => {
      try {
        const res = await fetch(`${API_BASE}${channel.endpoint}`);
        const data = await res.json();
        setChannels(prev => {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            status: data.status?.ready ? 'online' : 'offline',
            configured: data.status?.ready || false,
          };
          return updated;
        });
      } catch {
        setChannels(prev => {
          const updated = [...prev];
          updated[index] = { ...updated[index], status: 'error' };
          return updated;
        });
      }
    });

    // Simulated stats (in production, fetch from API)
    setStats({
      uptime: '12h 34m',
      totalMessages: 1247,
      activeSessions: 23,
      apiCalls: 5621,
    });
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'offline': return 'bg-gray-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-400 bg-green-400/10 border-green-400/20';
      case 'offline': return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
      case 'error': return 'text-red-400 bg-red-400/10 border-red-400/20';
      default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Getting Started Banner */}
      {showOnboardingBanner && (
        <div className="relative bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border border-blue-500/30 rounded-xl p-6">
          <button
            onClick={dismissOnboarding}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex items-center gap-4">
            <div className="text-4xl">🚀</div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white">
                Welcome{session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''}! Get started with SecureAgent
              </h3>
              <p className="text-gray-400 mt-1">
                Complete your setup to unlock all features, including Telegram integration.
              </p>
            </div>
            <Link
              href="/onboarding"
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              Getting Started →
            </Link>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard Overview</h1>
          <p className="text-gray-400 mt-1">Monitor your SecureAgent system status</p>
        </div>
        <div className={`px-4 py-2 rounded-lg border ${
          healthStatus === 'online'
            ? 'bg-green-500/10 border-green-500/20 text-green-400'
            : healthStatus === 'offline'
            ? 'bg-red-500/10 border-red-500/20 text-red-400'
            : 'bg-gray-500/10 border-gray-500/20 text-gray-400'
        }`}>
          {healthStatus === 'checking' ? 'Checking...' : healthStatus === 'online' ? '● System Online' : '● System Offline'}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Uptime', value: stats.uptime, icon: '⏱️', color: 'blue' },
          { label: 'Total Messages', value: stats.totalMessages.toLocaleString(), icon: '💬', color: 'green' },
          { label: 'Active Sessions', value: stats.activeSessions.toString(), icon: '👥', color: 'purple' },
          { label: 'API Calls Today', value: stats.apiCalls.toLocaleString(), icon: '🔌', color: 'orange' },
        ].map((stat, i) => (
          <div key={i} className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-3xl">{stat.icon}</span>
              <span className={`text-2xl font-bold text-${stat.color}-400`}>{stat.value}</span>
            </div>
            <p className="text-gray-400 mt-2">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Channels Status */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Channel Status</h2>
          <Link
            href="/dashboard/channels"
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            Manage Channels →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {channels.map((channel) => (
            <div
              key={channel.name}
              className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{channel.icon}</span>
                <span className="font-medium text-white">{channel.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${getStatusColor(channel.status)}`} />
                  <span className="text-sm text-gray-400 capitalize">{channel.status}</span>
                </div>
                <span className={`px-2 py-1 text-xs rounded border ${getStatusBadge(channel.status)}`}>
                  {channel.configured ? 'Configured' : 'Not Setup'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Open Chat', href: '/dashboard/chat', icon: '💬' },
              { label: 'View Sessions', href: '/dashboard/sessions', icon: '👥' },
              { label: 'Check Logs', href: '/dashboard/logs', icon: '📋' },
              { label: 'Settings', href: '/dashboard/settings', icon: '⚙️' },
            ].map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="flex items-center gap-3 p-4 bg-gray-800/50 border border-gray-700 rounded-lg hover:border-gray-600 hover:bg-gray-800 transition-colors"
              >
                <span className="text-xl">{action.icon}</span>
                <span className="text-gray-300">{action.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Recent Activity</h2>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 bg-gray-800/30 rounded-lg text-sm"
                >
                  <span className="text-gray-500">{new Date().toLocaleTimeString()}</span>
                  <span className="text-gray-300">{activity}</span>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8">No recent activity</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
