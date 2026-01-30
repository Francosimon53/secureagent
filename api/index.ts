/**
 * SecureAgent Vercel Serverless API
 *
 * Simple health check and info endpoint for the deployed library.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const { method, url } = req;

  // Health check
  if (url === '/health' || url === '/api/health') {
    return res.status(200).json({
      status: 'healthy',
      service: 'secureagent',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  }

  // Info endpoint
  if (url === '/' || url === '/api') {
    return res.status(200).json({
      name: 'SecureAgent',
      description: 'Security-focused AI agent framework',
      version: '1.0.0',
      documentation: 'https://github.com/Francosimon53/secureagent',
      endpoints: {
        health: '/api/health',
        info: '/api',
      },
      modules: [
        'agent',
        'security',
        'tools',
        'channels',
        'observability',
        'resilience',
        'storage',
        'mcp',
        'enterprise',
        'productivity',
        'savings',
        'travel',
        'lifestyle',
        'finance',
        'health',
        'wellness',
        'family',
        'orchestration',
        'content-creator',
      ],
    });
  }

  // 404 for unknown routes
  return res.status(404).json({
    error: 'Not Found',
    message: `Route ${method} ${url} not found`,
    availableEndpoints: ['/api', '/api/health'],
  });
}
