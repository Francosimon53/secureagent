'use client';

import { useState, useEffect } from 'react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  tier: 'free' | 'pro' | 'business' | 'enterprise';
  status: 'active' | 'suspended' | 'pending';
  userCount: number;
  createdAt: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'developer' | 'analyst' | 'member';
  status: 'active' | 'invited' | 'suspended';
  lastLoginAt?: string;
}

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  apiCallsToday: number;
  apiCallsMonth: number;
  storageUsedMB: number;
  storageLimit: number;
}

interface TierInfo {
  name: string;
  price: number;
  features: string[];
  limits: {
    users: number;
    bots: number;
    apiCallsPerDay: number;
    apiCallsPerMinute: number;
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://secureagent.vercel.app';

// Demo data for initial display
const demoTenant: Tenant = {
  id: 'demo-tenant-1',
  name: 'My Organization',
  slug: 'my-org',
  tier: 'pro',
  status: 'active',
  userCount: 5,
  createdAt: new Date().toISOString(),
};

const demoUsers: User[] = [
  { id: '1', email: 'admin@example.com', name: 'Admin User', role: 'owner', status: 'active', lastLoginAt: new Date().toISOString() },
  { id: '2', email: 'dev@example.com', name: 'Developer', role: 'developer', status: 'active', lastLoginAt: new Date(Date.now() - 86400000).toISOString() },
  { id: '3', email: 'analyst@example.com', name: 'Analyst', role: 'analyst', status: 'active' },
  { id: '4', email: 'invited@example.com', name: 'New User', role: 'member', status: 'invited' },
];

const demoStats: DashboardStats = {
  totalUsers: 5,
  activeUsers: 3,
  apiCallsToday: 1247,
  apiCallsMonth: 28453,
  storageUsedMB: 128,
  storageLimit: 1024,
};

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'billing' | 'settings'>('overview');
  const [tenant, setTenant] = useState<Tenant>(demoTenant);
  const [users, setUsers] = useState<User[]>(demoUsers);
  const [stats, setStats] = useState<DashboardStats>(demoStats);
  const [tiers, setTiers] = useState<TierInfo[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<User['role']>('member');
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    // Fetch tiers info
    fetch(`${API_BASE}/api/enterprise?resource=tiers`)
      .then(res => res.json())
      .then(data => {
        if (data.tiers) {
          setTiers(data.tiers);
        }
      })
      .catch(console.error);
  }, []);

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'free': return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
      case 'pro': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'business': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'enterprise': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-red-500/10 text-red-400';
      case 'admin': return 'bg-orange-500/10 text-orange-400';
      case 'developer': return 'bg-blue-500/10 text-blue-400';
      case 'analyst': return 'bg-green-500/10 text-green-400';
      default: return 'bg-gray-500/10 text-gray-400';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400';
      case 'invited': return 'text-yellow-400';
      case 'suspended': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const handleInviteUser = async () => {
    if (!inviteEmail.trim()) return;
    setIsInviting(true);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    const newUser: User = {
      id: `user-${Date.now()}`,
      email: inviteEmail,
      name: inviteEmail.split('@')[0],
      role: inviteRole,
      status: 'invited',
    };

    setUsers(prev => [...prev, newUser]);
    setInviteEmail('');
    setIsInviting(false);
  };

  const handleRemoveUser = (userId: string) => {
    setUsers(prev => prev.filter(u => u.id !== userId));
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'billing', label: 'Billing', icon: '💳' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-gray-400 mt-1">Manage your organization and team</p>
        </div>
        <div className={`px-4 py-2 rounded-lg border ${getTierColor(tenant.tier)}`}>
          <span className="font-medium capitalize">{tenant.tier} Plan</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-800 pb-4">
        {tabs.map((tab) => (
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
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Users', value: stats.totalUsers, icon: '👥', color: 'blue' },
              { label: 'Active Today', value: stats.activeUsers, icon: '✅', color: 'green' },
              { label: 'API Calls Today', value: stats.apiCallsToday.toLocaleString(), icon: '📡', color: 'purple' },
              { label: 'API Calls (Month)', value: stats.apiCallsMonth.toLocaleString(), icon: '📈', color: 'orange' },
            ].map((stat, i) => (
              <div key={i} className="p-4 bg-gray-900/50 border border-gray-800 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{stat.icon}</span>
                  <span className={`text-2xl font-bold text-${stat.color}-400`}>{stat.value}</span>
                </div>
                <p className="text-gray-400 text-sm mt-2">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Usage Bar */}
          <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
            <h3 className="text-lg font-semibold text-white mb-4">Storage Usage</h3>
            <div className="w-full bg-gray-800 rounded-full h-4">
              <div
                className="bg-blue-600 h-4 rounded-full transition-all"
                style={{ width: `${(stats.storageUsedMB / stats.storageLimit) * 100}%` }}
              />
            </div>
            <p className="text-gray-400 text-sm mt-2">
              {stats.storageUsedMB} MB / {stats.storageLimit} MB used
            </p>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Invite User', action: () => setActiveTab('users'), icon: '➕' },
              { label: 'View Analytics', action: () => {}, icon: '📊' },
              { label: 'Upgrade Plan', action: () => setActiveTab('billing'), icon: '⬆️' },
              { label: 'API Keys', action: () => setActiveTab('settings'), icon: '🔑' },
            ].map((item, i) => (
              <button
                key={i}
                onClick={item.action}
                className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg hover:border-gray-600 hover:bg-gray-800 transition-colors text-left"
              >
                <span className="text-2xl">{item.icon}</span>
                <p className="text-gray-300 mt-2">{item.label}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Invite User Form */}
          <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
            <h3 className="text-lg font-semibold text-white mb-4">Invite Team Member</h3>
            <div className="flex gap-4">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email address"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as User['role'])}
                className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="member">Member</option>
                <option value="analyst">Analyst</option>
                <option value="developer">Developer</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={handleInviteUser}
                disabled={!inviteEmail.trim() || isInviting}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 rounded-lg text-white font-medium transition-colors"
              >
                {isInviting ? 'Inviting...' : 'Invite'}
              </button>
            </div>
          </div>

          {/* Users List */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Last Login</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-white font-medium">{user.name}</p>
                        <p className="text-gray-400 text-sm">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${getRoleColor(user.role)}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm capitalize ${getStatusColor(user.status)}`}>
                        {user.status === 'active' ? '● ' : user.status === 'invited' ? '○ ' : '⊘ '}
                        {user.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {user.role !== 'owner' && (
                        <button
                          onClick={() => handleRemoveUser(user.id)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Billing Tab */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          {/* Current Plan */}
          <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Current Plan</h3>
              <span className={`px-3 py-1 rounded-full border ${getTierColor(tenant.tier)}`}>
                {tenant.tier.charAt(0).toUpperCase() + tenant.tier.slice(1)}
              </span>
            </div>
            <p className="text-gray-400">Your plan renews on the 1st of each month.</p>
          </div>

          {/* Plan Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { name: 'Free', price: 0, users: 3, bots: 1, apiCalls: '1K/day', current: tenant.tier === 'free' },
              { name: 'Pro', price: 49, users: 10, bots: 5, apiCalls: '50K/day', current: tenant.tier === 'pro', recommended: true },
              { name: 'Business', price: 199, users: 50, bots: 20, apiCalls: '500K/day', current: tenant.tier === 'business' },
              { name: 'Enterprise', price: null, users: 'Unlimited', bots: 'Unlimited', apiCalls: 'Unlimited', current: tenant.tier === 'enterprise' },
            ].map((plan, i) => (
              <div
                key={i}
                className={`p-6 rounded-xl border transition-colors ${
                  plan.current
                    ? 'bg-blue-600/10 border-blue-500'
                    : plan.recommended
                    ? 'bg-gray-900/50 border-purple-500/50'
                    : 'bg-gray-900/50 border-gray-800 hover:border-gray-700'
                }`}
              >
                {plan.recommended && !plan.current && (
                  <span className="text-xs text-purple-400 font-medium">RECOMMENDED</span>
                )}
                <h4 className="text-xl font-bold text-white mt-1">{plan.name}</h4>
                <p className="text-3xl font-bold text-white mt-2">
                  {plan.price !== null ? `$${plan.price}` : 'Custom'}
                  {plan.price !== null && <span className="text-sm text-gray-400">/mo</span>}
                </p>
                <ul className="mt-4 space-y-2 text-sm text-gray-400">
                  <li>✓ {plan.users} users</li>
                  <li>✓ {plan.bots} bots</li>
                  <li>✓ {plan.apiCalls} API calls</li>
                </ul>
                <button
                  className={`w-full mt-4 py-2 rounded-lg font-medium transition-colors ${
                    plan.current
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                  disabled={plan.current}
                >
                  {plan.current ? 'Current Plan' : plan.price === null ? 'Contact Sales' : 'Upgrade'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          {/* Organization Settings */}
          <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
            <h3 className="text-lg font-semibold text-white mb-4">Organization Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Organization Name</label>
                <input
                  type="text"
                  value={tenant.name}
                  onChange={(e) => setTenant({ ...tenant, name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Slug (URL identifier)</label>
                <input
                  type="text"
                  value={tenant.slug}
                  onChange={(e) => setTenant({ ...tenant, slug: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* API Keys */}
          <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">API Keys</h3>
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-medium transition-colors">
                Generate New Key
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                <div>
                  <p className="text-white font-medium">Production Key</p>
                  <p className="text-gray-400 text-sm font-mono">sk_prod_****************************1234</p>
                </div>
                <button className="text-red-400 hover:text-red-300 text-sm">Revoke</button>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                <div>
                  <p className="text-white font-medium">Development Key</p>
                  <p className="text-gray-400 text-sm font-mono">sk_dev_****************************5678</p>
                </div>
                <button className="text-red-400 hover:text-red-300 text-sm">Revoke</button>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="p-6 bg-red-900/10 border border-red-800/50 rounded-xl">
            <h3 className="text-lg font-semibold text-red-400 mb-4">Danger Zone</h3>
            <p className="text-gray-400 mb-4">Once you delete your organization, there is no going back.</p>
            <button className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-white font-medium transition-colors">
              Delete Organization
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
