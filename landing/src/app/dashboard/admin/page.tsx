'use client';

import { useState } from 'react';
import Link from 'next/link';

// Mock data for the admin dashboard
const systemStats = {
  totalUsers: 1247,
  activeSessions: 89,
  messagesProcessed: 45892,
  apiCalls: 128456,
};

const recentActivity = [
  { id: 1, type: 'user', action: 'New user registered', user: 'john@example.com', time: '2 minutes ago', icon: '👤' },
  { id: 2, type: 'api', action: 'API rate limit warning', user: 'System', time: '5 minutes ago', icon: '⚠️' },
  { id: 3, type: 'message', action: 'High volume detected', user: 'Telegram Bot', time: '12 minutes ago', icon: '📨' },
  { id: 4, type: 'billing', action: 'Subscription upgraded to Pro', user: 'sarah@company.com', time: '28 minutes ago', icon: '💳' },
  { id: 5, type: 'security', action: 'Failed login attempt blocked', user: '192.168.1.45', time: '34 minutes ago', icon: '🛡️' },
  { id: 6, type: 'user', action: 'User updated profile', user: 'mike@startup.io', time: '45 minutes ago', icon: '✏️' },
  { id: 7, type: 'api', action: 'New API key generated', user: 'dev@techcorp.com', time: '1 hour ago', icon: '🔑' },
  { id: 8, type: 'system', action: 'Scheduled maintenance completed', user: 'System', time: '2 hours ago', icon: '🔧' },
  { id: 9, type: 'message', action: 'Batch processing completed', user: 'Worker #3', time: '3 hours ago', icon: '✅' },
  { id: 10, type: 'billing', action: 'Invoice generated', user: 'billing@enterprise.co', time: '4 hours ago', icon: '📄' },
];

const mockUsers = [
  { id: '1', name: 'Demo User', email: 'demo@secureagent.ai', role: 'Admin', status: 'active', lastActive: 'Now' },
  { id: '2', name: 'John Smith', email: 'john@example.com', role: 'User', status: 'active', lastActive: '5 min ago' },
  { id: '3', name: 'Sarah Connor', email: 'sarah@company.com', role: 'Pro', status: 'active', lastActive: '1 hour ago' },
  { id: '4', name: 'Mike Chen', email: 'mike@startup.io', role: 'User', status: 'inactive', lastActive: '2 days ago' },
  { id: '5', name: 'Emily Davis', email: 'emily@tech.com', role: 'Power', status: 'active', lastActive: '30 min ago' },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'settings'>('overview');
  const [settings, setSettings] = useState({
    apiRateLimit: 1000,
    defaultModel: 'gpt-4o',
    notifications: true,
    maintenanceMode: false,
  });
  const [healthStatus, setHealthStatus] = useState<'checking' | 'healthy' | 'warning' | null>(null);

  const runHealthCheck = () => {
    setHealthStatus('checking');
    setTimeout(() => {
      setHealthStatus('healthy');
      setTimeout(() => setHealthStatus(null), 3000);
    }, 1500);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-gray-400 mt-1">System overview and management</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <span className="text-green-400 text-sm font-medium">All Systems Operational</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-800 pb-4">
        {[
          { id: 'overview', label: 'Overview', icon: '📊' },
          { id: 'users', label: 'Users', icon: '👥' },
          { id: 'settings', label: 'Settings', icon: '⚙️' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* System Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-3xl">👥</span>
                <span className="text-3xl font-bold text-blue-400">{formatNumber(systemStats.totalUsers)}</span>
              </div>
              <p className="text-gray-400 mt-2">Total Users</p>
              <p className="text-green-400 text-sm mt-1">+12% this week</p>
            </div>
            <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-3xl">🟢</span>
                <span className="text-3xl font-bold text-green-400">{systemStats.activeSessions}</span>
              </div>
              <p className="text-gray-400 mt-2">Active Sessions</p>
              <p className="text-gray-500 text-sm mt-1">Right now</p>
            </div>
            <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-3xl">💬</span>
                <span className="text-3xl font-bold text-purple-400">{formatNumber(systemStats.messagesProcessed)}</span>
              </div>
              <p className="text-gray-400 mt-2">Messages Processed</p>
              <p className="text-green-400 text-sm mt-1">+8% today</p>
            </div>
            <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-3xl">📡</span>
                <span className="text-3xl font-bold text-orange-400">{formatNumber(systemStats.apiCalls)}</span>
              </div>
              <p className="text-gray-400 mt-2">API Calls</p>
              <p className="text-gray-500 text-sm mt-1">This month</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                onClick={() => setActiveTab('users')}
                className="p-4 bg-gray-900/50 border border-gray-800 rounded-xl hover:border-blue-500/50 hover:bg-gray-800/50 transition-all text-left group"
              >
                <span className="text-2xl">👥</span>
                <p className="text-white font-medium mt-2 group-hover:text-blue-400 transition-colors">View All Users</p>
                <p className="text-gray-500 text-sm">Manage user accounts</p>
              </button>
              <button
                onClick={runHealthCheck}
                className="p-4 bg-gray-900/50 border border-gray-800 rounded-xl hover:border-green-500/50 hover:bg-gray-800/50 transition-all text-left group"
              >
                <span className="text-2xl">
                  {healthStatus === 'checking' ? '⏳' : healthStatus === 'healthy' ? '✅' : '🏥'}
                </span>
                <p className="text-white font-medium mt-2 group-hover:text-green-400 transition-colors">
                  {healthStatus === 'checking' ? 'Checking...' : healthStatus === 'healthy' ? 'All Healthy!' : 'Health Check'}
                </p>
                <p className="text-gray-500 text-sm">Run system diagnostics</p>
              </button>
              <Link
                href="/dashboard/logs"
                className="p-4 bg-gray-900/50 border border-gray-800 rounded-xl hover:border-purple-500/50 hover:bg-gray-800/50 transition-all text-left group"
              >
                <span className="text-2xl">📋</span>
                <p className="text-white font-medium mt-2 group-hover:text-purple-400 transition-colors">View Logs</p>
                <p className="text-gray-500 text-sm">System activity logs</p>
              </Link>
              <Link
                href="/dashboard/settings"
                className="p-4 bg-gray-900/50 border border-gray-800 rounded-xl hover:border-orange-500/50 hover:bg-gray-800/50 transition-all text-left group"
              >
                <span className="text-2xl">💳</span>
                <p className="text-white font-medium mt-2 group-hover:text-orange-400 transition-colors">Manage Billing</p>
                <p className="text-gray-500 text-sm">Subscriptions & invoices</p>
              </Link>
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
              <div className="divide-y divide-gray-800">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="p-4 hover:bg-gray-800/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">{activity.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium">{activity.action}</p>
                        <p className="text-gray-500 text-sm truncate">{activity.user}</p>
                      </div>
                      <span className="text-gray-500 text-sm whitespace-nowrap">{activity.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">User Management</h2>
            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium transition-colors">
              + Add User
            </button>
          </div>

          <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-800/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">User</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Last Active</th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {mockUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-white font-medium">{user.name}</p>
                          <p className="text-gray-500 text-sm">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        user.role === 'Admin' ? 'bg-red-500/10 text-red-400' :
                        user.role === 'Pro' ? 'bg-blue-500/10 text-blue-400' :
                        user.role === 'Power' ? 'bg-purple-500/10 text-purple-400' :
                        'bg-gray-500/10 text-gray-400'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`flex items-center gap-2 ${
                        user.status === 'active' ? 'text-green-400' : 'text-gray-500'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${
                          user.status === 'active' ? 'bg-green-400' : 'bg-gray-500'
                        }`}></span>
                        {user.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-sm">{user.lastActive}</td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-gray-400 hover:text-white transition-colors mr-3">Edit</button>
                      <button className="text-red-400 hover:text-red-300 transition-colors">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-white">System Settings</h2>

          {/* API Rate Limits */}
          <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
            <h3 className="text-white font-medium mb-4">API Rate Limits</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Requests per minute (per user)</label>
                <input
                  type="number"
                  value={settings.apiRateLimit}
                  onChange={(e) => setSettings({ ...settings, apiRateLimit: parseInt(e.target.value) || 0 })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <p className="text-gray-500 text-sm">Current limit: {settings.apiRateLimit} requests/minute</p>
            </div>
          </div>

          {/* Default AI Model */}
          <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
            <h3 className="text-white font-medium mb-4">Default AI Model</h3>
            <select
              value={settings.defaultModel}
              onChange={(e) => setSettings({ ...settings, defaultModel: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="gpt-4o">GPT-4o (Recommended)</option>
              <option value="gpt-4o-mini">GPT-4o Mini (Faster)</option>
              <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
              <option value="claude-3-opus">Claude 3 Opus</option>
              <option value="gemini-pro">Gemini Pro</option>
            </select>
            <p className="text-gray-500 text-sm mt-2">This model will be used as the default for all new conversations</p>
          </div>

          {/* Notifications */}
          <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
            <h3 className="text-white font-medium mb-4">System Notifications</h3>
            <div className="space-y-4">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-white">Email Notifications</p>
                  <p className="text-gray-500 text-sm">Receive alerts for critical system events</p>
                </div>
                <div
                  onClick={() => setSettings({ ...settings, notifications: !settings.notifications })}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    settings.notifications ? 'bg-blue-600' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform mt-0.5 ${
                      settings.notifications ? 'translate-x-6 ml-0.5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-white">Maintenance Mode</p>
                  <p className="text-gray-500 text-sm">Temporarily disable user access for maintenance</p>
                </div>
                <div
                  onClick={() => setSettings({ ...settings, maintenanceMode: !settings.maintenanceMode })}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    settings.maintenanceMode ? 'bg-orange-600' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform mt-0.5 ${
                      settings.maintenanceMode ? 'translate-x-6 ml-0.5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </label>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium transition-colors">
              Save Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
