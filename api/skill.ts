/**
 * Skill API Endpoint
 *
 * REST API for creating, listing, and executing skills.
 *
 * Endpoints:
 * - POST /api/skill (create skill)
 * - GET /api/skill (list skills)
 * - POST /api/skill/execute (run skill)
 * - GET /api/skill/:name (get skill details)
 * - DELETE /api/skill/:name (delete skill)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createSkillSystem,
  type SkillSystem,
  type SkillCreateInput,
} from '../src/skills/index.js';

// Global skill system instance (persists across requests in same lambda)
let skillSystem: SkillSystem | null = null;

async function getSkillSystem(): Promise<SkillSystem> {
  if (!skillSystem) {
    skillSystem = createSkillSystem({
      persistToFile: false, // In-memory for serverless
      defaultTimeout: 10000, // 10 second timeout for serverless
    });
    await skillSystem.initialize();
  }
  return skillSystem;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method, query } = req;
  const path = query.path as string | undefined;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse body if needed (Vercel should do this automatically, but just in case)
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid JSON in request body',
      });
    }
  }

  try {
    const system = await getSkillSystem();

    // POST /api/skill/execute - Execute a skill
    if (method === 'POST' && path === 'execute') {
      const { skill_name, params, timeout } = body;

      if (!skill_name) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'skill_name is required',
        });
      }

      const result = await system.toolHandler.handleToolCall('run_skill', {
        skill_name,
        params: params || {},
        timeout,
      });

      return res.status(result.success ? 200 : 400).json(result);
    }

    // POST /api/skill - Create a new skill
    if (method === 'POST') {
      const { name, description, code, parameters, tags } = body;

      if (!name || !description || !code) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'name, description, and code are required',
        });
      }

      const result = await system.toolHandler.handleToolCall('create_skill', {
        name,
        description,
        code,
        parameters,
        tags,
      });

      return res.status(result.success ? 201 : 400).json(result);
    }

    // GET /api/skill?name=xxx - Get skill details
    // GET /api/skill - List all skills
    if (method === 'GET') {
      const skillName = query.name as string | undefined;
      const searchQuery = query.q as string | undefined;
      const tagsParam = query.tags as string | undefined;

      // Get specific skill
      if (skillName) {
        const result = await system.toolHandler.handleToolCall('get_skill', {
          name: skillName,
        });
        return res.status(result.success ? 200 : 404).json(result);
      }

      // List/search skills
      const result = await system.toolHandler.handleToolCall('list_skills', {
        query: searchQuery,
        tags: tagsParam ? tagsParam.split(',') : undefined,
      });

      return res.status(200).json(result);
    }

    // DELETE /api/skill?name=xxx - Delete a skill
    if (method === 'DELETE') {
      const skillName = query.name as string;

      if (!skillName) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'name query parameter is required',
        });
      }

      const result = await system.toolHandler.handleToolCall('delete_skill', {
        name: skillName,
      });

      return res.status(result.success ? 200 : 404).json(result);
    }

    // Method not allowed
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: `${method} is not supported`,
      allowedMethods: ['GET', 'POST', 'DELETE'],
    });

  } catch (error) {
    console.error('Skill API error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: (error as Error).message,
    });
  }
}
