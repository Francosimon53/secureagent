'use client';

import { useState, useEffect } from 'react';

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  version: string;
  author: string;
  tags: string[];
  premium: boolean;
  installed: boolean;
  usageCount: number;
  rating: number;
  reviews: number;
  requiredConfig?: string[];
}

interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'marketplace' | 'installed'>('marketplace');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [stats, setStats] = useState({ total: 0, installed: 0 });

  useEffect(() => {
    fetchSkills();
  }, [filter, search, view]);

  const fetchSkills = async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('category', filter);
      if (search) params.set('search', search);
      if (view === 'installed') params.set('installed', 'true');

      const response = await fetch(`/api/skills?${params}`);
      const data = await response.json();

      setSkills(data.skills);
      setCategories(data.categories);
      setStats({ total: data.available, installed: data.installed });
    } catch (error) {
      console.error('Failed to fetch skills:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (skillId: string, action: 'install' | 'uninstall') => {
    setInstalling(skillId);
    try {
      const response = await fetch('/api/skills/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId, action }),
      });

      if (response.ok) {
        // Update local state
        setSkills(prev => prev.map(skill =>
          skill.id === skillId
            ? { ...skill, installed: action === 'install' }
            : skill
        ));
        setStats(prev => ({
          ...prev,
          installed: action === 'install' ? prev.installed + 1 : prev.installed - 1,
        }));

        if (selectedSkill?.id === skillId) {
          setSelectedSkill(prev => prev ? { ...prev, installed: action === 'install' } : null);
        }
      }
    } catch (error) {
      console.error('Failed to install skill:', error);
    } finally {
      setInstalling(null);
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      core: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      tools: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      integrations: 'bg-green-500/10 text-green-400 border-green-500/20',
      productivity: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      developer: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      data: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    };
    return colors[category] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  };

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <span key={i} className={i <= Math.round(rating) ? 'text-yellow-400' : 'text-gray-600'}>
          ★
        </span>
      );
    }
    return stars;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Skills Marketplace</h1>
          <p className="text-gray-400 mt-1">
            Browse and install skills to extend your AI assistant
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            {stats.installed} of {stats.total} installed
          </span>
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setView('marketplace')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                view === 'marketplace'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Marketplace
            </button>
            <button
              onClick={() => setView('installed')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                view === 'installed'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Installed ({stats.installed})
            </button>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <svg className="absolute left-3 top-3 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            All Skills
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilter(cat.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2 ${
                filter === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <span>{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Skills Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="p-5 bg-gray-900/50 border border-gray-800 rounded-xl animate-pulse">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 bg-gray-800 rounded-xl" />
                <div className="flex-1">
                  <div className="h-5 bg-gray-800 rounded w-2/3 mb-2" />
                  <div className="h-4 bg-gray-800 rounded w-1/3" />
                </div>
              </div>
              <div className="h-12 bg-gray-800 rounded mb-4" />
              <div className="h-10 bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      ) : skills.length === 0 ? (
        <div className="text-center py-16 bg-gray-900/50 border border-gray-800 rounded-xl">
          <span className="text-4xl mb-4 block">🔍</span>
          <h3 className="text-lg font-medium text-white mb-2">No skills found</h3>
          <p className="text-gray-400">
            {view === 'installed'
              ? "You haven't installed any skills yet"
              : 'Try adjusting your search or filters'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {skills.map((skill) => (
            <div
              key={skill.id}
              onClick={() => setSelectedSkill(skill)}
              className="group p-5 bg-gray-900/50 border border-gray-800 rounded-xl hover:border-gray-700 transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <span className="text-3xl">{skill.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors">
                        {skill.name}
                      </h3>
                      {skill.premium && (
                        <span className="px-1.5 py-0.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 text-xs rounded border border-amber-500/30">
                          PRO
                        </span>
                      )}
                    </div>
                    <span className={`inline-block px-2 py-0.5 text-xs rounded border mt-1 ${getCategoryColor(skill.category)}`}>
                      {skill.category}
                    </span>
                  </div>
                </div>
                {skill.installed && (
                  <span className="px-2 py-1 bg-green-500/10 text-green-400 text-xs rounded-full border border-green-500/20">
                    Installed
                  </span>
                )}
              </div>

              <p className="text-sm text-gray-400 mb-4 line-clamp-2">{skill.description}</p>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1">
                  {renderStars(skill.rating)}
                  <span className="text-gray-500 ml-1">({skill.reviews})</span>
                </div>
                <span className="text-gray-500">
                  {skill.usageCount.toLocaleString()} uses
                </span>
              </div>

              <div className="flex flex-wrap gap-1 mt-3">
                {skill.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Skill Detail Modal */}
      {selectedSkill && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedSkill(null)}
        >
          <div
            className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-start gap-4">
                  <span className="text-4xl">{selectedSkill.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-white">{selectedSkill.name}</h2>
                      {selectedSkill.premium && (
                        <span className="px-2 py-0.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 text-xs rounded border border-amber-500/30">
                          PRO
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-sm mt-1">
                      by {selectedSkill.author} • v{selectedSkill.version}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSkill(null)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Description */}
              <p className="text-gray-300 mb-6">{selectedSkill.description}</p>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-3 bg-gray-800/50 rounded-lg text-center">
                  <div className="flex items-center justify-center gap-1 text-yellow-400 mb-1">
                    {renderStars(selectedSkill.rating)}
                  </div>
                  <p className="text-xs text-gray-400">{selectedSkill.reviews} reviews</p>
                </div>
                <div className="p-3 bg-gray-800/50 rounded-lg text-center">
                  <p className="text-lg font-bold text-white">{selectedSkill.usageCount.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">Total uses</p>
                </div>
                <div className="p-3 bg-gray-800/50 rounded-lg text-center">
                  <span className={`inline-block px-2 py-0.5 text-sm rounded border ${getCategoryColor(selectedSkill.category)}`}>
                    {selectedSkill.category}
                  </span>
                </div>
              </div>

              {/* Tags */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-300 mb-2">Tags</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedSkill.tags.map((tag) => (
                    <span key={tag} className="px-3 py-1 bg-gray-800 text-gray-300 text-sm rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Required Config */}
              {selectedSkill.requiredConfig && selectedSkill.requiredConfig.length > 0 && (
                <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <h4 className="text-sm font-medium text-amber-400 mb-2">Required Configuration</h4>
                  <ul className="space-y-1">
                    {selectedSkill.requiredConfig.map((config) => (
                      <li key={config} className="text-sm text-gray-300 flex items-center gap-2">
                        <span className="text-amber-400">•</span>
                        <code className="bg-gray-800 px-2 py-0.5 rounded text-xs">{config}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => handleInstall(selectedSkill.id, selectedSkill.installed ? 'uninstall' : 'install')}
                  disabled={installing === selectedSkill.id}
                  className={`flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                    selectedSkill.installed
                      ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                      : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white'
                  }`}
                >
                  {installing === selectedSkill.id ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Processing...
                    </>
                  ) : selectedSkill.installed ? (
                    'Uninstall'
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Install Skill
                    </>
                  )}
                </button>
                <button
                  onClick={() => setSelectedSkill(null)}
                  className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-300 font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
