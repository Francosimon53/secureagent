'use client';

import { useState, useEffect, useCallback } from 'react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  tier: 'free' | 'pro' | 'business' | 'enterprise';
  status: 'active' | 'suspended' | 'pending';
  userCount?: number;
  createdAt: number;
}

interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'developer' | 'analyst' | 'member';
  status: 'active' | 'invited' | 'suspended';
  lastLoginAt?: number;
  createdAt: number;
}

interface DashboardSummary {
  totalUsers: number;
  activeUsers: number;
  totalBots: number;
  activeBots: number;
  apiCallsThisPeriod: number;
  storageUsed: number;
  storageLimit: number;
  tier: string;
  subscriptionStatus: string;
  daysUntilRenewal: number;
  usageAlerts: Array<{
    id: string;
    metric: string;
    percentage: number;
    severity: 'info' | 'warning' | 'critical';
    message: string;
  }>;
}

interface TierConfig {
  name: string;
  displayName: string;
  price: { monthly: number; yearly: number };
  limits: {
    maxUsers: number;
    maxBots: number;
    apiCallsPerDay: number;
    apiCallsPerMinute: number;
    storageLimitBytes: number;
  };
  features: string[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://secureagent.vercel.app';
const TENANT_STORAGE_KEY = 'secureagent_tenant_id';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'billing' | 'settings'>('overview');
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [tiers, setTiers] = useState<Record<string, TierConfig>>({});
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<User['role']>('member');
  const [isInviting, setIsInviting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Initialize or get tenant
  const initializeTenant = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check localStorage for existing tenant
      const storedTenantId = localStorage.getItem(TENANT_STORAGE_KEY);

      if (storedTenantId) {
        // Try to fetch existing tenant
        const res = await fetch(`${API_BASE}/api/enterprise?resource=tenant&id=${storedTenantId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.tenant) {
            setTenant(data.tenant);
            setOrgName(data.tenant.name);
            setOrgSlug(data.tenant.slug);
            return data.tenant.id;
          }
        }
        // Tenant not found, clear storage
        localStorage.removeItem(TENANT_STORAGE_KEY);
      }

      // Create new tenant
      const newTenantData = {
        name: 'My Organization',
        slug: `org-${Date.now()}`,
        ownerEmail: 'admin@example.com',
        ownerName: 'Admin',
        tier: 'pro',
      };

      const createRes = await fetch(`${API_BASE}/api/enterprise?resource=tenant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTenantData),
      });

      if (!createRes.ok) {
        throw new Error('Failed to create tenant');
      }

      const createData = await createRes.json();
      if (createData.success && createData.tenant) {
        localStorage.setItem(TENANT_STORAGE_KEY, createData.tenant.id);
        setTenant(createData.tenant);
        setOrgName(createData.tenant.name);
        setOrgSlug(createData.tenant.slug);
        return createData.tenant.id;
      }

      throw new Error('Invalid tenant response');
    } catch (err) {
      console.error('Failed to initialize tenant:', err);
      setError('Failed to initialize organization. Please refresh the page.');
      return null;
    }
  }, []);

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async (tenantId: string) => {
    try {
      const [summaryRes, usersRes, tiersRes] = await Promise.all([
        fetch(`${API_BASE}/api/enterprise?resource=dashboard&tenantId=${tenantId}`),
        fetch(`${API_BASE}/api/enterprise?resource=user&tenantId=${tenantId}`),
        fetch(`${API_BASE}/api/enterprise?resource=tiers`),
      ]);

      if (summaryRes.ok) {
        const data = await summaryRes.json();
        if (data.success) {
          setSummary(data.summary);
        }
      }

      if (usersRes.ok) {
        const data = await usersRes.json();
        if (data.success) {
          setUsers(data.users || []);
        }
      }

      if (tiersRes.ok) {
        const data = await tiersRes.json();
        if (data.success) {
          setTiers(data.tiers || {});
        }
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      const tenantId = await initializeTenant();
      if (tenantId) {
        await fetchDashboardData(tenantId);
      } else {
        setIsLoading(false);
      }
    };
    init();
  }, [initializeTenant, fetchDashboardData]);

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
    if (!inviteEmail.trim() || !tenant) return;
    setIsInviting(true);

    try {
      const res = await fetch(`${API_BASE}/api/enterprise?resource=user&action=invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenant.id,
          email: inviteEmail,
          role: inviteRole,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to invite user');
      }

      const data = await res.json();
      if (data.success && data.user) {
        setUsers(prev => [...prev, data.user]);
        setInviteEmail('');
      }
    } catch (err) {
      console.error('Failed to invite user:', err);
      alert(err instanceof Error ? err.message : 'Failed to invite user');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    // For now, just remove from UI (would need DELETE endpoint in API)
    setUsers(prev => prev.filter(u => u.id !== userId));
  };

  const handleSaveSettings = async () => {
    if (!tenant) return;
    setIsSaving(true);
    setSaveMessage(null);

    try {
      // Would need a PUT endpoint for tenant updates
      // For now, update local state
      setTenant({ ...tenant, name: orgName, slug: orgSlug });
      setSaveMessage('Settings saved successfully');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpgrade = async (newTier: string) => {
    if (!tenant) return;

    try {
      const res = await fetch(`${API_BASE}/api/enterprise?resource=subscription&action=upgrade`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenant.id,
          tier: newTier,
        }),
      });

      if (res.ok) {
        // Refresh tenant and dashboard data
        setTenant({ ...tenant, tier: newTier as Tenant['tier'] });
        if (tenant.id) {
          await fetchDashboardData(tenant.id);
        }
      }
    } catch (err) {
      console.error('Failed to upgrade:', err);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'billing', label: 'Billing', icon: '💳' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-gray-400 mt-1">Manage your organization and team</p>
        </div>
        <div className={`px-4 py-2 rounded-lg border ${getTierColor(tenant?.tier || 'free')}`}>
          <span className="font-medium capitalize">{tenant?.tier || 'Free'} Plan</span>
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
      {activeTab === 'overview' && summary && (
        <div className="space-y-6">
          {/* Usage Alerts */}
          {summary.usageAlerts.length > 0 && (
            <div className="space-y-2">
              {summary.usageAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border ${
                    alert.severity === 'critical'
                      ? 'bg-red-500/10 border-red-500/50 text-red-400'
                      : alert.severity === 'warning'
                      ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400'
                      : 'bg-blue-500/10 border-blue-500/50 text-blue-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️'}</span>
                    <span>{alert.message}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Users', value: summary.totalUsers, icon: '👥', color: 'blue' },
              { label: 'Active Users', value: summary.activeUsers, icon: '✅', color: 'green' },
              { label: 'API Calls (Period)', value: formatNumber(summary.apiCallsThisPeriod), icon: '📡', color: 'purple' },
              { label: 'Days Until Renewal', value: summary.daysUntilRenewal, icon: '📅', color: 'orange' },
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
                style={{ width: `${Math.min((summary.storageUsed / summary.storageLimit) * 100, 100)}%` }}
              />
            </div>
            <p className="text-gray-400 text-sm mt-2">
              {formatBytes(summary.storageUsed)} / {formatBytes(summary.storageLimit)} used
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
            {users.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <p>No users yet. Invite your first team member!</p>
              </div>
            ) : (
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
            )}
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
              <span className={`px-3 py-1 rounded-full border ${getTierColor(tenant?.tier || 'free')}`}>
                {(tenant?.tier || 'free').charAt(0).toUpperCase() + (tenant?.tier || 'free').slice(1)}
              </span>
            </div>
            <p className="text-gray-400">
              {summary ? `${summary.daysUntilRenewal} days until renewal` : 'Your plan renews on the 1st of each month.'}
            </p>
          </div>

          {/* Plan Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Object.entries(tiers).length > 0 ? (
              Object.entries(tiers).map(([key, tier]) => {
                const isCurrent = tenant?.tier === key;
                const isEnterprise = key === 'enterprise';
                return (
                  <div
                    key={key}
                    className={`p-6 rounded-xl border transition-colors ${
                      isCurrent
                        ? 'bg-blue-600/10 border-blue-500'
                        : key === 'pro' && !isCurrent
                        ? 'bg-gray-900/50 border-purple-500/50'
                        : 'bg-gray-900/50 border-gray-800 hover:border-gray-700'
                    }`}
                  >
                    {key === 'pro' && !isCurrent && (
                      <span className="text-xs text-purple-400 font-medium">RECOMMENDED</span>
                    )}
                    <h4 className="text-xl font-bold text-white mt-1">{tier.displayName}</h4>
                    <p className="text-3xl font-bold text-white mt-2">
                      {isEnterprise ? 'Custom' : `$${Math.round(tier.price.monthly / 100)}`}
                      {!isEnterprise && <span className="text-sm text-gray-400">/mo</span>}
                    </p>
                    <ul className="mt-4 space-y-2 text-sm text-gray-400">
                      <li>✓ {tier.limits.maxUsers === -1 ? 'Unlimited' : tier.limits.maxUsers} users</li>
                      <li>✓ {tier.limits.maxBots === -1 ? 'Unlimited' : tier.limits.maxBots} bots</li>
                      <li>✓ {tier.limits.apiCallsPerDay === -1 ? 'Unlimited' : formatNumber(tier.limits.apiCallsPerDay)} API calls/day</li>
                    </ul>
                    <button
                      onClick={() => !isCurrent && !isEnterprise && handleUpgrade(key)}
                      className={`w-full mt-4 py-2 rounded-lg font-medium transition-colors ${
                        isCurrent
                          ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                      }`}
                      disabled={isCurrent}
                    >
                      {isCurrent ? 'Current Plan' : isEnterprise ? 'Contact Sales' : 'Upgrade'}
                    </button>
                  </div>
                );
              })
            ) : (
              // Fallback if tiers not loaded
              [
                { name: 'Free', price: 0, users: 3, bots: 1, apiCalls: '1K/day', current: tenant?.tier === 'free' },
                { name: 'Pro', price: 49, users: 10, bots: 5, apiCalls: '50K/day', current: tenant?.tier === 'pro', recommended: true },
                { name: 'Business', price: 199, users: 50, bots: 20, apiCalls: '500K/day', current: tenant?.tier === 'business' },
                { name: 'Enterprise', price: null, users: 'Unlimited', bots: 'Unlimited', apiCalls: 'Unlimited', current: tenant?.tier === 'enterprise' },
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
              ))
            )}
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
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Slug (URL identifier)</label>
                <input
                  type="text"
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 rounded-lg text-white font-medium transition-colors"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
                {saveMessage && (
                  <span className={saveMessage.includes('success') ? 'text-green-400' : 'text-red-400'}>
                    {saveMessage}
                  </span>
                )}
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
                  <p className="text-gray-400 text-sm font-mono">sk_prod_****************************{tenant?.id?.slice(-4) || '1234'}</p>
                </div>
                <button className="text-red-400 hover:text-red-300 text-sm">Revoke</button>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                <div>
                  <p className="text-white font-medium">Development Key</p>
                  <p className="text-gray-400 text-sm font-mono">sk_dev_****************************{tenant?.id?.slice(-4) || '5678'}</p>
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
