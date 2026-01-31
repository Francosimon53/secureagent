'use client';

import { useState, useEffect } from 'react';

interface Skill {
  id: string;
  name: string;
  description: string;
  category: 'core' | 'tools' | 'integrations' | 'custom';
  enabled: boolean;
  status: 'active' | 'inactive' | 'error';
  usageCount: number;
  lastUsed?: Date;
  config?: Record<string, unknown>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://secureagent.vercel.app';

const defaultSkills: Skill[] = [
  {
    id: 'web-search',
    name: 'Web Search',
    description: 'Search the web using DuckDuckGo for real-time information',
    category: 'tools',
    enabled: true,
    status: 'active',
    usageCount: 156,
    lastUsed: new Date(Date.now() - 3600000),
  },
  {
    id: 'browser-automation',
    name: 'Browser Automation',
    description: 'Control a headless browser to scrape websites and take screenshots',
    category: 'tools',
    enabled: true,
    status: 'active',
    usageCount: 42,
    lastUsed: new Date(Date.now() - 7200000),
  },
  {
    id: 'code-execution',
    name: 'Code Execution',
    description: 'Execute Python code in a sandboxed environment',
    category: 'tools',
    enabled: false,
    status: 'inactive',
    usageCount: 0,
  },
  {
    id: 'file-operations',
    name: 'File Operations',
    description: 'Read, write, and manage files on the server',
    category: 'core',
    enabled: true,
    status: 'active',
    usageCount: 89,
    lastUsed: new Date(Date.now() - 1800000),
  },
  {
    id: 'memory-management',
    name: 'Memory Management',
    description: 'Store and retrieve conversation context and user preferences',
    category: 'core',
    enabled: true,
    status: 'active',
    usageCount: 1247,
    lastUsed: new Date(Date.now() - 60000),
  },
  {
    id: 'telegram-integration',
    name: 'Telegram',
    description: 'Send and receive messages via Telegram Bot API',
    category: 'integrations',
    enabled: true,
    status: 'active',
    usageCount: 523,
    lastUsed: new Date(Date.now() - 120000),
  },
  {
    id: 'discord-integration',
    name: 'Discord',
    description: 'Handle Discord slash commands and @mentions',
    category: 'integrations',
    enabled: true,
    status: 'active',
    usageCount: 312,
    lastUsed: new Date(Date.now() - 300000),
  },
  {
    id: 'whatsapp-integration',
    name: 'WhatsApp',
    description: 'Connect with WhatsApp Business Cloud API',
    category: 'integrations',
    enabled: false,
    status: 'inactive',
    usageCount: 0,
  },
  {
    id: 'slack-integration',
    name: 'Slack',
    description: 'Integrate with Slack workspaces via Events API',
    category: 'integrations',
    enabled: false,
    status: 'inactive',
    usageCount: 0,
  },
  {
    id: 'image-generation',
    name: 'Image Generation',
    description: 'Generate images using AI models (requires API key)',
    category: 'tools',
    enabled: false,
    status: 'inactive',
    usageCount: 0,
  },
  {
    id: 'custom-greeting',
    name: 'Custom Greeting',
    description: 'Personalized greeting messages for different channels',
    category: 'custom',
    enabled: true,
    status: 'active',
    usageCount: 892,
    lastUsed: new Date(Date.now() - 180000),
  },
];

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>(defaultSkills);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'core': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'tools': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'integrations': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'custom': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'core': return '⚙️';
      case 'tools': return '🔧';
      case 'integrations': return '🔌';
      case 'custom': return '✨';
      default: return '📦';
    }
  };

  const toggleSkill = async (skillId: string) => {
    setSkills(prev => prev.map(skill => {
      if (skill.id === skillId) {
        const newEnabled = !skill.enabled;
        return {
          ...skill,
          enabled: newEnabled,
          status: newEnabled ? 'active' : 'inactive',
        };
      }
      return skill;
    }));

    // In production, call API to update skill status
    // await fetch(`${API_BASE}/api/skills/${skillId}`, { method: 'PATCH', ... });
  };

  const filteredSkills = skills.filter(skill => {
    if (filter !== 'all' && skill.category !== filter) return false;
    if (search && !skill.name.toLowerCase().includes(search.toLowerCase()) &&
        !skill.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: skills.length,
    enabled: skills.filter(s => s.enabled).length,
    totalUsage: skills.reduce((sum, s) => sum + s.usageCount, 0),
  };

  const formatLastUsed = (date?: Date) => {
    if (!date) return 'Never';
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Skills</h1>
          <p className="text-gray-400 mt-1">Enable and configure agent capabilities</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-400">{stats.enabled} of {stats.total} enabled</span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-400">{stats.totalUsage.toLocaleString()} total uses</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex gap-2">
          {['all', 'core', 'tools', 'integrations', 'custom'].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                filter === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search skills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Skills Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSkills.map((skill) => (
          <div
            key={skill.id}
            className={`p-5 bg-gray-900/50 border rounded-xl transition-all cursor-pointer hover:border-gray-600 ${
              selectedSkill?.id === skill.id ? 'border-blue-500' : 'border-gray-800'
            }`}
            onClick={() => setSelectedSkill(skill)}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getCategoryIcon(skill.category)}</span>
                <div>
                  <h3 className="font-medium text-white">{skill.name}</h3>
                  <span className={`inline-block px-2 py-0.5 text-xs rounded border ${getCategoryColor(skill.category)}`}>
                    {skill.category}
                  </span>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSkill(skill.id);
                }}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  skill.enabled ? 'bg-green-600' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    skill.enabled ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            <p className="text-sm text-gray-400 mb-4 line-clamp-2">{skill.description}</p>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">
                {skill.usageCount.toLocaleString()} uses
              </span>
              <span className="text-gray-500">
                Last: {formatLastUsed(skill.lastUsed)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {filteredSkills.length === 0 && (
        <div className="text-center py-12 text-gray-500 bg-gray-900/50 border border-gray-800 rounded-xl">
          No skills match your filter
        </div>
      )}

      {/* Skill Details Modal */}
      {selectedSkill && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedSkill(null)}>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{getCategoryIcon(selectedSkill.category)}</span>
                <div>
                  <h2 className="text-xl font-semibold text-white">{selectedSkill.name}</h2>
                  <span className={`inline-block px-2 py-0.5 text-xs rounded border ${getCategoryColor(selectedSkill.category)}`}>
                    {selectedSkill.category}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedSkill(null)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-gray-400 mb-6">{selectedSkill.description}</p>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                <span className="text-gray-300">Status</span>
                <span className={selectedSkill.enabled ? 'text-green-400' : 'text-gray-500'}>
                  {selectedSkill.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                <span className="text-gray-300">Usage Count</span>
                <span className="text-white">{selectedSkill.usageCount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                <span className="text-gray-300">Last Used</span>
                <span className="text-white">{formatLastUsed(selectedSkill.lastUsed)}</span>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => toggleSkill(selectedSkill.id)}
                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                  selectedSkill.enabled
                    ? 'bg-red-600/10 text-red-400 hover:bg-red-600/20'
                    : 'bg-green-600 text-white hover:bg-green-500'
                }`}
              >
                {selectedSkill.enabled ? 'Disable Skill' : 'Enable Skill'}
              </button>
              <button
                onClick={() => setSelectedSkill(null)}
                className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
