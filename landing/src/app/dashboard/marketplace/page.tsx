'use client';

/**
 * Skill Marketplace Page
 *
 * Browse, search, and install community skills
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface SkillCard {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon?: string;
  category: string;
  authorName: string;
  downloads: number;
  rating: number;
  ratingCount: number;
  featured: boolean;
  version: string;
  tags?: string[];
}

interface SearchResponse {
  items: SkillCard[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const CATEGORIES = [
  { id: '', label: 'All Categories', icon: '🌐' },
  { id: 'productivity', label: 'Productivity', icon: '📈' },
  { id: 'developer', label: 'Developer', icon: '💻' },
  { id: 'communication', label: 'Communication', icon: '💬' },
  { id: 'data', label: 'Data', icon: '📊' },
  { id: 'automation', label: 'Automation', icon: '⚡' },
  { id: 'custom', label: 'Custom', icon: '🔧' },
];

const SORT_OPTIONS = [
  { id: 'downloads', label: 'Most Popular' },
  { id: 'rating', label: 'Highest Rated' },
  { id: 'recent', label: 'Recently Added' },
  { id: 'name', label: 'Alphabetical' },
];

export default function MarketplacePage() {
  const [skills, setSkills] = useState<SkillCard[]>([]);
  const [featuredSkills, setFeaturedSkills] = useState<SkillCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState('downloads');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [installedSkills, setInstalledSkills] = useState<Set<string>>(new Set());
  const [installingId, setInstallingId] = useState<string | null>(null);

  // Fetch skills
  const fetchSkills = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      if (category) params.set('category', category);
      params.set('sortBy', sortBy);
      params.set('page', page.toString());
      params.set('pageSize', '12');

      const response = await fetch(`/api/skills/marketplace?${params}`);
      const data: SearchResponse = await response.json();

      setSkills(data.items);
      setTotalPages(data.totalPages);
    } catch (error) {
      console.error('Failed to fetch skills:', error);
    } finally {
      setLoading(false);
    }
  }, [query, category, sortBy, page]);

  // Fetch featured skills
  const fetchFeatured = useCallback(async () => {
    try {
      const response = await fetch('/api/skills/marketplace?featured=true&pageSize=4');
      const data: SearchResponse = await response.json();
      setFeaturedSkills(data.items);
    } catch (error) {
      console.error('Failed to fetch featured skills:', error);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  useEffect(() => {
    fetchFeatured();
  }, [fetchFeatured]);

  // Install skill
  const handleInstall = async (skillId: string) => {
    setInstallingId(skillId);
    try {
      const response = await fetch(`/api/skills/marketplace/${skillId}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'demo_user' }),
      });

      if (response.ok) {
        setInstalledSkills((prev) => new Set([...prev, skillId]));
      }
    } catch (error) {
      console.error('Failed to install skill:', error);
    } finally {
      setInstallingId(null);
    }
  };

  // Star rating component
  const StarRating = ({ rating, count }: { rating: number; count: number }) => (
    <div className="flex items-center gap-1">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            className={star <= Math.round(rating) ? 'text-yellow-400' : 'text-gray-600'}
          >
            ★
          </span>
        ))}
      </div>
      <span className="text-sm text-gray-400">({count})</span>
    </div>
  );

  // Skill card component
  const SkillCardComponent = ({ skill }: { skill: SkillCard }) => {
    const isInstalled = installedSkills.has(skill.id);
    const isInstalling = installingId === skill.id;

    return (
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{skill.icon || '🔧'}</span>
            <div>
              <h3 className="font-semibold text-white">{skill.displayName}</h3>
              <p className="text-sm text-gray-400">by {skill.authorName}</p>
            </div>
          </div>
          {skill.featured && (
            <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-1 rounded">
              Featured
            </span>
          )}
        </div>

        <p className="text-gray-300 text-sm mb-3 line-clamp-2">{skill.description}</p>

        <div className="flex flex-wrap gap-1 mb-3">
          {skill.tags?.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between mb-3">
          <StarRating rating={skill.rating} count={skill.ratingCount} />
          <span className="text-sm text-gray-400">
            {skill.downloads.toLocaleString()} installs
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">v{skill.version}</span>
          <button
            onClick={() => handleInstall(skill.id)}
            disabled={isInstalled || isInstalling}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              isInstalled
                ? 'bg-green-600/20 text-green-400 cursor-default'
                : isInstalling
                  ? 'bg-gray-600 text-gray-300 cursor-wait'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isInstalled ? '✓ Installed' : isInstalling ? 'Installing...' : 'Install'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Skill Marketplace</h1>
            <p className="text-gray-400 mt-1">
              Discover and install community-created skills
            </p>
          </div>
          <Link
            href="/dashboard/marketplace/submit"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            + Submit Skill
          </Link>
        </div>

        {/* Featured Section */}
        {featuredSkills.length > 0 && !query && !category && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span>⭐</span> Featured Skills
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {featuredSkills.map((skill) => (
                <SkillCardComponent key={skill.id} skill={skill} />
              ))}
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search skills..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Category Filter */}
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.icon} {cat.label}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setCategory(cat.id);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                category === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        {/* Skills Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="bg-gray-800 rounded-lg p-4 border border-gray-700 animate-pulse"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-gray-700 rounded"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-700 rounded w-1/2"></div>
                  </div>
                </div>
                <div className="h-12 bg-gray-700 rounded mb-3"></div>
                <div className="h-8 bg-gray-700 rounded"></div>
              </div>
            ))}
          </div>
        ) : skills.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl mb-4 block">🔍</span>
            <h3 className="text-xl font-semibold mb-2">No skills found</h3>
            <p className="text-gray-400">
              Try adjusting your search or filters
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {skills.map((skill) => (
                <SkillCardComponent key={skill.id} skill={skill} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-8">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-gray-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {/* Stats Footer */}
        <div className="mt-12 pt-8 border-t border-gray-800">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-400">100+</div>
              <div className="text-gray-400 text-sm">Skills Available</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-400">50+</div>
              <div className="text-gray-400 text-sm">Contributors</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-400">10K+</div>
              <div className="text-gray-400 text-sm">Total Installs</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-400">4.6</div>
              <div className="text-gray-400 text-sm">Average Rating</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
