'use client';

/**
 * Submit Skill Page
 *
 * Form to submit a new skill to the marketplace
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const CATEGORIES = [
  { id: 'productivity', label: 'Productivity', icon: '📈' },
  { id: 'developer', label: 'Developer', icon: '💻' },
  { id: 'communication', label: 'Communication', icon: '💬' },
  { id: 'data', label: 'Data', icon: '📊' },
  { id: 'automation', label: 'Automation', icon: '⚡' },
  { id: 'custom', label: 'Custom', icon: '🔧' },
];

const ICONS = ['📝', '🔍', '✉️', '📊', '⚡', '🎙️', '🔀', '💬', '🤖', '🎯', '📅', '💡', '🔒', '🌐', '📦'];

interface Parameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export default function SubmitSkillPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('productivity');
  const [icon, setIcon] = useState('📝');
  const [tags, setTags] = useState('');
  const [code, setCode] = useState(`export async function execute(params: { input: string }) {
  const { input } = params;

  // Your skill logic here

  return {
    success: true,
    data: {
      result: input
    }
  };
}`);
  const [parameters, setParameters] = useState<Parameter[]>([
    { name: 'input', type: 'string', description: 'Input text', required: true },
  ]);

  // Add parameter
  const addParameter = () => {
    setParameters([
      ...parameters,
      { name: '', type: 'string', description: '', required: false },
    ]);
  };

  // Remove parameter
  const removeParameter = (index: number) => {
    setParameters(parameters.filter((_, i) => i !== index));
  };

  // Update parameter
  const updateParameter = (index: number, field: keyof Parameter, value: string | boolean) => {
    const updated = [...parameters];
    updated[index] = { ...updated[index], [field]: value };
    setParameters(updated);
  };

  // Generate skill name from display name
  const generateName = (displayName: string) => {
    return displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  // Handle display name change
  const handleDisplayNameChange = (value: string) => {
    setDisplayName(value);
    if (!name || name === generateName(displayName)) {
      setName(generateName(value));
    }
  };

  // Submit skill
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      // Validate
      if (!name || !displayName || !description || !code) {
        throw new Error('Please fill in all required fields');
      }

      if (name.length < 3) {
        throw new Error('Skill name must be at least 3 characters');
      }

      if (description.length < 10) {
        throw new Error('Description must be at least 10 characters');
      }

      // Prepare config
      const config = {
        name,
        displayName,
        description,
        version: '1.0.0',
        category,
        icon,
        parameters: parameters.filter((p) => p.name),
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };

      // Submit
      const response = await fetch('/api/skills/marketplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          code,
          authorId: 'demo_user',
          authorName: 'Demo User',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit skill');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/dashboard/marketplace');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <span className="text-6xl mb-4 block">🎉</span>
          <h1 className="text-2xl font-bold mb-2">Skill Submitted!</h1>
          <p className="text-gray-400">Redirecting to marketplace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard/marketplace"
            className="text-blue-400 hover:text-blue-300 mb-4 inline-block"
          >
            ← Back to Marketplace
          </Link>
          <h1 className="text-3xl font-bold">Submit a Skill</h1>
          <p className="text-gray-400 mt-1">
            Share your skill with the SecureAgent community
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">Basic Information</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Display Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Display Name *
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => handleDisplayNameChange(e.target.value)}
                  placeholder="My Awesome Skill"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              {/* Skill Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Skill ID *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-awesome-skill"
                  pattern="[a-z][a-z0-9-]*"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Lowercase letters, numbers, and hyphens only
                </p>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Category *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Icon */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Icon
                </label>
                <div className="flex flex-wrap gap-2">
                  {ICONS.map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setIcon(i)}
                      className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-colors ${
                        icon === i
                          ? 'bg-blue-600 ring-2 ring-blue-400'
                          : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Description *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what your skill does..."
                rows={3}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
                required
              />
            </div>

            {/* Tags */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Tags
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="ai, automation, productivity"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Comma-separated list of tags
              </p>
            </div>
          </div>

          {/* Parameters */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Parameters</h2>
              <button
                type="button"
                onClick={addParameter}
                className="text-blue-400 hover:text-blue-300 text-sm"
              >
                + Add Parameter
              </button>
            </div>

            {parameters.length === 0 ? (
              <p className="text-gray-500 text-center py-4">
                No parameters defined
              </p>
            ) : (
              <div className="space-y-4">
                {parameters.map((param, index) => (
                  <div
                    key={index}
                    className="bg-gray-700 rounded-lg p-4 border border-gray-600"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <input
                        type="text"
                        value={param.name}
                        onChange={(e) =>
                          updateParameter(index, 'name', e.target.value)
                        }
                        placeholder="name"
                        className="bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                      />
                      <select
                        value={param.type}
                        onChange={(e) =>
                          updateParameter(index, 'type', e.target.value)
                        }
                        className="bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="string">string</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                        <option value="array">array</option>
                        <option value="object">object</option>
                      </select>
                      <input
                        type="text"
                        value={param.description}
                        onChange={(e) =>
                          updateParameter(index, 'description', e.target.value)
                        }
                        placeholder="Description"
                        className="bg-gray-600 border border-gray-500 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                      />
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={param.required}
                            onChange={(e) =>
                              updateParameter(index, 'required', e.target.checked)
                            }
                            className="rounded bg-gray-600 border-gray-500"
                          />
                          Required
                        </label>
                        <button
                          type="button"
                          onClick={() => removeParameter(index)}
                          className="text-red-400 hover:text-red-300 ml-auto"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Code */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">Skill Code</h2>
            <p className="text-gray-400 text-sm mb-4">
              Write your skill function in TypeScript. The function should export
              an <code className="text-blue-400">execute</code> function that
              takes parameters and returns a result.
            </p>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              rows={15}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-blue-500 resize-none"
              spellCheck={false}
              required
            />
          </div>

          {/* Guidelines */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <h3 className="font-semibold text-blue-400 mb-2">
              Submission Guidelines
            </h3>
            <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
              <li>Skills must have a clear, single purpose</li>
              <li>Include proper error handling in your code</li>
              <li>Avoid using <code>eval()</code> or <code>new Function()</code></li>
              <li>Document all parameters with descriptions</li>
              <li>Test your skill thoroughly before submitting</li>
            </ul>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-4">
            <Link
              href="/dashboard/marketplace"
              className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Skill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
