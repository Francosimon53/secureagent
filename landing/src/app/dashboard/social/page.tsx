'use client';

import { useState, useEffect } from 'react';

interface SocialAccount {
  id: string;
  platform: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  connected: boolean;
  connectedAt?: number;
  followers?: number;
}

interface ScheduledPost {
  id: string;
  content: string;
  platforms: string[];
  scheduledAt: number;
  status: 'scheduled' | 'published' | 'failed';
  media?: { type: string; url: string }[];
}

interface PendingReply {
  id: string;
  platform: string;
  authorUsername: string;
  authorAvatar?: string;
  content: string;
  suggestedReply: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
  createdAt: number;
}

interface AnalyticsSummary {
  totalImpressions: number;
  totalEngagement: number;
  totalFollowers: number;
  growthRate: number;
  topPlatform: string;
}

type TabType = 'accounts' | 'calendar' | 'compose' | 'replies' | 'analytics';

const PLATFORM_ICONS: Record<string, string> = {
  twitter: '𝕏',
  linkedin: 'in',
  bluesky: '🦋',
  youtube: '▶️',
  instagram: '📷',
};

const PLATFORM_COLORS: Record<string, string> = {
  twitter: 'bg-gray-800',
  linkedin: 'bg-blue-700',
  bluesky: 'bg-sky-500',
  youtube: 'bg-red-600',
  instagram: 'bg-gradient-to-br from-purple-600 to-pink-500',
};

const PLATFORM_NAMES: Record<string, string> = {
  twitter: 'Twitter / X',
  linkedin: 'LinkedIn',
  bluesky: 'Bluesky',
  youtube: 'YouTube',
  instagram: 'Instagram',
};

export default function SocialMediaPage() {
  const [activeTab, setActiveTab] = useState<TabType>('accounts');
  const [accounts, setAccounts] = useState<SocialAccount[]>([
    { id: '1', platform: 'twitter', username: '@myaccount', displayName: 'My Account', connected: false },
    { id: '2', platform: 'linkedin', username: 'company-page', displayName: 'Company Page', connected: false },
    { id: '3', platform: 'bluesky', username: '@me.bsky.social', displayName: 'Me', connected: false },
    { id: '4', platform: 'youtube', username: 'MyChannel', displayName: 'My Channel', connected: false },
    { id: '5', platform: 'instagram', username: '@mybusiness', displayName: 'My Business', connected: false },
  ]);
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [pendingReplies, setPendingReplies] = useState<PendingReply[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Compose state
  const [composeText, setComposeText] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [scheduleTime, setScheduleTime] = useState<string>('');
  const [isScheduling, setIsScheduling] = useState(false);

  // Calendar view state
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Fetch data on mount
  useEffect(() => {
    fetchAccounts();
    fetchScheduledPosts();
    fetchPendingReplies();
    fetchAnalytics();
  }, []);

  const fetchAccounts = async () => {
    try {
      const response = await fetch('/api/social/accounts');
      if (response.ok) {
        const data = await response.json();
        if (data.accounts) {
          setAccounts(data.accounts);
        }
      }
    } catch {
      // Keep default state
    }
  };

  const fetchScheduledPosts = async () => {
    try {
      const response = await fetch('/api/social/scheduled');
      if (response.ok) {
        const data = await response.json();
        if (data.posts) {
          setScheduledPosts(data.posts);
        }
      }
    } catch {
      // Keep empty state
    }
  };

  const fetchPendingReplies = async () => {
    try {
      const response = await fetch('/api/social/replies/pending');
      if (response.ok) {
        const data = await response.json();
        if (data.replies) {
          setPendingReplies(data.replies);
        }
      }
    } catch {
      // Keep empty state
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await fetch('/api/social/analytics');
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch {
      // Keep null state
    }
  };

  const handleConnect = async (platform: string) => {
    setConnecting(platform);
    setError(null);

    try {
      // Start OAuth flow or show connection modal
      if (platform === 'twitter' || platform === 'instagram' || platform === 'youtube') {
        const response = await fetch(`/api/social/oauth/${platform}/start`);
        if (response.ok) {
          const data = await response.json();
          window.open(data.authUrl, 'oauth', 'width=500,height=600');
        }
      } else {
        // For other platforms, show credentials modal
        setError(`Please configure ${PLATFORM_NAMES[platform]} in settings`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    try {
      const response = await fetch('/api/social/accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });

      if (response.ok) {
        setAccounts(prev => prev.map(a =>
          a.id === accountId ? { ...a, connected: false, connectedAt: undefined } : a
        ));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnection failed');
    }
  };

  const handlePublish = async (immediate: boolean = true) => {
    if (!composeText.trim() || selectedPlatforms.length === 0) {
      setError('Please enter content and select at least one platform');
      return;
    }

    setIsScheduling(true);
    setError(null);

    try {
      const body = {
        content: { text: composeText },
        platforms: selectedPlatforms,
        scheduledAt: immediate ? undefined : new Date(scheduleTime).getTime(),
      };

      const response = await fetch('/api/social/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setComposeText('');
        setSelectedPlatforms([]);
        setScheduleTime('');
        fetchScheduledPosts();
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to publish');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setIsScheduling(false);
    }
  };

  const handleApproveReply = async (replyId: string, editedText?: string) => {
    try {
      const response = await fetch('/api/social/replies/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyId, editedText }),
      });

      if (response.ok) {
        setPendingReplies(prev => prev.filter(r => r.id !== replyId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve reply');
    }
  };

  const handleRejectReply = async (replyId: string) => {
    try {
      const response = await fetch('/api/social/replies/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyId }),
      });

      if (response.ok) {
        setPendingReplies(prev => prev.filter(r => r.id !== replyId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject reply');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'text-green-400';
      case 'negative': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getCalendarDays = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const getPostsForDay = (day: number) => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const dayStart = new Date(year, month, day).getTime();
    const dayEnd = new Date(year, month, day + 1).getTime();

    return scheduledPosts.filter(post =>
      post.scheduledAt >= dayStart && post.scheduledAt < dayEnd
    );
  };

  const connectedAccounts = accounts.filter(a => a.connected);
  const availablePlatforms = accounts.filter(a => a.connected).map(a => a.platform);

  const hasConnectedAccounts = accounts.some(a => a.connected);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Social Media</h1>
        <p className="text-gray-400 mt-1">Manage your social media presence across platforms</p>
      </div>

      {/* Setup Required Banner */}
      {!hasConnectedAccounts && (
        <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center text-2xl shrink-0">
              ⚠️
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-white">Setup Required</h3>
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-medium rounded-full">Coming Soon</span>
              </div>
              <p className="text-gray-400 text-sm mb-4">
                Social media integrations require OAuth setup with each platform. Connect your accounts in the Accounts tab below to enable posting, scheduling, and analytics.
              </p>
              <p className="text-gray-500 text-xs">
                Supported platforms: Twitter/X, LinkedIn, Bluesky, YouTube, Instagram • OAuth integrations coming in a future release
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <div className="text-gray-400 text-sm">Connected Accounts</div>
          <div className="text-2xl font-bold text-white mt-1">{connectedAccounts.length}</div>
          <div className="text-xs text-gray-500 mt-1">of {accounts.length} available</div>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <div className="text-gray-400 text-sm">Scheduled Posts</div>
          <div className="text-2xl font-bold text-white mt-1">{scheduledPosts.length}</div>
          <div className="text-xs text-gray-500 mt-1">pending publish</div>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <div className="text-gray-400 text-sm">Pending Replies</div>
          <div className="text-2xl font-bold text-white mt-1">{pendingReplies.length}</div>
          <div className="text-xs text-gray-500 mt-1">awaiting approval</div>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <div className="text-gray-400 text-sm">Total Impressions</div>
          <div className="text-2xl font-bold text-white mt-1">
            {analytics ? formatNumber(analytics.totalImpressions) : '—'}
          </div>
          <div className="text-xs text-green-400 mt-1">
            {analytics?.growthRate ? `+${analytics.growthRate.toFixed(1)}%` : '—'}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-800 pb-2">
        {(['accounts', 'compose', 'calendar', 'replies', 'analytics'] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {tab === 'replies' ? 'Auto-Replies' : tab}
          </button>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 text-red-400">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-300 hover:text-white"
          >
            ×
          </button>
        </div>
      )}

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {/* Accounts Tab */}
        {activeTab === 'accounts' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((account) => (
              <div
                key={account.id}
                className={`bg-gray-900/50 border rounded-xl p-5 transition-all ${
                  account.connected ? 'border-green-500/50' : 'border-gray-800'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 ${PLATFORM_COLORS[account.platform]} rounded-xl flex items-center justify-center text-white font-bold text-lg`}>
                      {PLATFORM_ICONS[account.platform]}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{PLATFORM_NAMES[account.platform]}</h3>
                      <span className="text-sm text-gray-400">{account.username}</span>
                    </div>
                  </div>
                  {account.connected ? (
                    <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                  ) : (
                    <span className="w-3 h-3 bg-gray-600 rounded-full" />
                  )}
                </div>

                {account.connected && account.followers !== undefined && (
                  <div className="text-sm text-gray-400 mb-4">
                    {formatNumber(account.followers)} followers
                  </div>
                )}

                {account.connected && account.connectedAt && (
                  <div className="text-xs text-gray-500 mb-4">
                    Connected {formatDate(account.connectedAt)}
                  </div>
                )}

                {account.connected ? (
                  <button
                    onClick={() => handleDisconnect(account.id)}
                    className="w-full px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm font-medium transition-colors"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(account.platform)}
                    disabled={connecting === account.platform}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {connecting === account.platform ? 'Connecting...' : 'Connect'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Compose Tab */}
        {activeTab === 'compose' && (
          <div className="max-w-2xl space-y-6">
            {/* Platform Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Post to</label>
              <div className="flex flex-wrap gap-2">
                {availablePlatforms.length > 0 ? (
                  availablePlatforms.map((platform) => (
                    <button
                      key={platform}
                      onClick={() => {
                        setSelectedPlatforms(prev =>
                          prev.includes(platform)
                            ? prev.filter(p => p !== platform)
                            : [...prev, platform]
                        );
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                        selectedPlatforms.includes(platform)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      <span className={`w-6 h-6 ${PLATFORM_COLORS[platform]} rounded flex items-center justify-center text-white text-xs`}>
                        {PLATFORM_ICONS[platform]}
                      </span>
                      {PLATFORM_NAMES[platform]}
                    </button>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm">Connect accounts in the Accounts tab first</p>
                )}
              </div>
            </div>

            {/* Content */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Content</label>
              <textarea
                value={composeText}
                onChange={(e) => setComposeText(e.target.value)}
                placeholder="What's on your mind?"
                rows={6}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              />
              <div className="flex justify-between mt-2 text-sm">
                <span className="text-gray-500">
                  {composeText.length} characters
                </span>
                {selectedPlatforms.includes('twitter') && composeText.length > 280 && (
                  <span className="text-red-400">Exceeds Twitter limit (280)</span>
                )}
              </div>
            </div>

            {/* Schedule */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Schedule (optional)</label>
              <input
                type="datetime-local"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => handlePublish(true)}
                disabled={isScheduling || !composeText.trim() || selectedPlatforms.length === 0}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
              >
                {isScheduling ? 'Publishing...' : 'Publish Now'}
              </button>
              {scheduleTime && (
                <button
                  onClick={() => handlePublish(false)}
                  disabled={isScheduling || !composeText.trim() || selectedPlatforms.length === 0}
                  className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
                >
                  {isScheduling ? 'Scheduling...' : 'Schedule'}
                </button>
              )}
            </div>

            {/* AI Suggestions */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-medium text-gray-300 mb-3">✨ AI Suggestions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => {/* Generate caption */}}
                  className="w-full text-left px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-400 transition-colors"
                >
                  Generate caption for this content
                </button>
                <button
                  onClick={() => {/* Generate hashtags */}}
                  className="w-full text-left px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-400 transition-colors"
                >
                  Suggest hashtags
                </button>
                <button
                  onClick={() => {/* Get best time */}}
                  className="w-full text-left px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-400 transition-colors"
                >
                  Find best time to post
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Calendar Tab */}
        {activeTab === 'calendar' && (
          <div className="space-y-4">
            {/* Calendar Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">
                {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1))}
                  className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400"
                >
                  ←
                </button>
                <button
                  onClick={() => setCalendarDate(new Date())}
                  className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400"
                >
                  Today
                </button>
                <button
                  onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1))}
                  className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400"
                >
                  →
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
              {/* Day Headers */}
              <div className="grid grid-cols-7 bg-gray-800/50">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="px-2 py-3 text-center text-sm font-medium text-gray-400">
                    {day}
                  </div>
                ))}
              </div>

              {/* Day Cells */}
              <div className="grid grid-cols-7">
                {getCalendarDays().map((day, index) => {
                  const posts = day ? getPostsForDay(day) : [];
                  const isToday = day === new Date().getDate() &&
                    calendarDate.getMonth() === new Date().getMonth() &&
                    calendarDate.getFullYear() === new Date().getFullYear();

                  return (
                    <div
                      key={index}
                      className={`min-h-[100px] border-t border-r border-gray-800 p-2 ${
                        day ? 'bg-gray-900/30' : 'bg-gray-900/10'
                      } ${isToday ? 'bg-blue-900/20' : ''}`}
                    >
                      {day && (
                        <>
                          <div className={`text-sm ${isToday ? 'text-blue-400 font-bold' : 'text-gray-400'}`}>
                            {day}
                          </div>
                          <div className="mt-1 space-y-1">
                            {posts.slice(0, 3).map((post) => (
                              <div
                                key={post.id}
                                className="text-xs bg-blue-600/30 text-blue-300 rounded px-1 py-0.5 truncate"
                                title={post.content}
                              >
                                {post.platforms.map(p => PLATFORM_ICONS[p]).join(' ')} {post.content.slice(0, 20)}...
                              </div>
                            ))}
                            {posts.length > 3 && (
                              <div className="text-xs text-gray-500">+{posts.length - 3} more</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Upcoming Posts */}
            <div>
              <h3 className="text-lg font-medium text-white mb-3">Upcoming Posts</h3>
              {scheduledPosts.length > 0 ? (
                <div className="space-y-2">
                  {scheduledPosts.slice(0, 5).map((post) => (
                    <div
                      key={post.id}
                      className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex -space-x-2">
                          {post.platforms.map((p) => (
                            <div
                              key={p}
                              className={`w-8 h-8 ${PLATFORM_COLORS[p]} rounded-full flex items-center justify-center text-white text-sm border-2 border-gray-900`}
                            >
                              {PLATFORM_ICONS[p]}
                            </div>
                          ))}
                        </div>
                        <div>
                          <p className="text-white text-sm">{post.content.slice(0, 60)}...</p>
                          <p className="text-gray-500 text-xs">{formatDate(post.scheduledAt)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {/* Cancel post */}}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No scheduled posts</p>
              )}
            </div>
          </div>
        )}

        {/* Auto-Replies Tab */}
        {activeTab === 'replies' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-white">Pending Replies</h2>
              <button
                onClick={fetchPendingReplies}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 text-sm"
              >
                Refresh
              </button>
            </div>

            {pendingReplies.length > 0 ? (
              <div className="space-y-4">
                {pendingReplies.map((reply) => (
                  <div
                    key={reply.id}
                    className="bg-gray-900/50 border border-gray-800 rounded-xl p-5"
                  >
                    {/* Original Comment */}
                    <div className="flex items-start gap-3 mb-4">
                      <div className={`w-10 h-10 ${PLATFORM_COLORS[reply.platform]} rounded-full flex items-center justify-center text-white`}>
                        {PLATFORM_ICONS[reply.platform]}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{reply.authorUsername}</span>
                          <span className={`text-xs ${getSentimentColor(reply.sentiment)}`}>
                            {reply.sentiment}
                          </span>
                        </div>
                        <p className="text-gray-300 text-sm mt-1">{reply.content}</p>
                        <p className="text-gray-500 text-xs mt-1">{formatDate(reply.createdAt)}</p>
                      </div>
                    </div>

                    {/* Suggested Reply */}
                    <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm text-gray-400">Suggested Reply</span>
                        <span className="text-xs text-gray-500">
                          ({Math.round(reply.confidence * 100)}% confidence)
                        </span>
                      </div>
                      <p className="text-white text-sm">{reply.suggestedReply}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApproveReply(reply.id)}
                        className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white text-sm font-medium transition-colors"
                      >
                        Approve & Send
                      </button>
                      <button
                        onClick={() => {/* Open edit modal */}}
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 text-sm font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleRejectReply(reply.id)}
                        className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm font-medium transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">💬</div>
                <p className="text-gray-400">No pending replies</p>
                <p className="text-gray-500 text-sm mt-1">
                  Auto-replies will appear here when new comments or mentions are detected
                </p>
              </div>
            )}

            {/* Auto-Reply Settings */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 mt-6">
              <h3 className="text-lg font-medium text-white mb-4">Auto-Reply Settings</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white">Require Approval</p>
                    <p className="text-gray-500 text-sm">Review replies before sending</p>
                  </div>
                  <button className="w-12 h-6 bg-blue-600 rounded-full relative">
                    <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white">Reply to Comments</p>
                    <p className="text-gray-500 text-sm">Auto-reply to post comments</p>
                  </div>
                  <button className="w-12 h-6 bg-blue-600 rounded-full relative">
                    <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white">Reply to Mentions</p>
                    <p className="text-gray-500 text-sm">Auto-reply when mentioned</p>
                  </div>
                  <button className="w-12 h-6 bg-gray-700 rounded-full relative">
                    <div className="absolute left-1 top-1 w-4 h-4 bg-gray-400 rounded-full" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                <div className="text-gray-400 text-sm">Total Impressions</div>
                <div className="text-3xl font-bold text-white mt-2">
                  {analytics ? formatNumber(analytics.totalImpressions) : '—'}
                </div>
                <div className="text-sm text-green-400 mt-1">↑ 12% from last week</div>
              </div>
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                <div className="text-gray-400 text-sm">Total Engagement</div>
                <div className="text-3xl font-bold text-white mt-2">
                  {analytics ? formatNumber(analytics.totalEngagement) : '—'}
                </div>
                <div className="text-sm text-green-400 mt-1">↑ 8% from last week</div>
              </div>
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                <div className="text-gray-400 text-sm">Total Followers</div>
                <div className="text-3xl font-bold text-white mt-2">
                  {analytics ? formatNumber(analytics.totalFollowers) : '—'}
                </div>
                <div className="text-sm text-green-400 mt-1">↑ 150 this week</div>
              </div>
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                <div className="text-gray-400 text-sm">Engagement Rate</div>
                <div className="text-3xl font-bold text-white mt-2">
                  {analytics?.growthRate ? `${analytics.growthRate.toFixed(1)}%` : '—'}
                </div>
                <div className="text-sm text-gray-400 mt-1">Industry avg: 2.5%</div>
              </div>
            </div>

            {/* Platform Breakdown */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
              <h3 className="text-lg font-medium text-white mb-4">Platform Performance</h3>
              <div className="space-y-4">
                {connectedAccounts.map((account) => (
                  <div key={account.id} className="flex items-center gap-4">
                    <div className={`w-10 h-10 ${PLATFORM_COLORS[account.platform]} rounded-lg flex items-center justify-center text-white`}>
                      {PLATFORM_ICONS[account.platform]}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white">{PLATFORM_NAMES[account.platform]}</span>
                        <span className="text-gray-400 text-sm">2.4K engagements</span>
                      </div>
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${PLATFORM_COLORS[account.platform]}`}
                          style={{ width: `${Math.random() * 60 + 20}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {connectedAccounts.length === 0 && (
                  <p className="text-gray-500 text-center py-4">
                    Connect accounts to see analytics
                  </p>
                )}
              </div>
            </div>

            {/* Top Posts */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
              <h3 className="text-lg font-medium text-white mb-4">Top Performing Posts</h3>
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-4">📊</div>
                <p>Analytics data will appear here once you have published posts</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
