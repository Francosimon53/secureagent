import { NextResponse } from 'next/server';

// Model definitions with pricing (per 1M tokens)
const MODELS = {
  // OpenAI
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    inputCost: 5.0,
    outputCost: 15.0,
    maxTokens: 128000,
    color: '#10a37f',
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    inputCost: 0.15,
    outputCost: 0.6,
    maxTokens: 128000,
    color: '#10a37f',
  },
  'gpt-4-turbo': {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'OpenAI',
    inputCost: 10.0,
    outputCost: 30.0,
    maxTokens: 128000,
    color: '#10a37f',
  },
  // Anthropic
  'claude-opus-4': {
    id: 'claude-opus-4',
    name: 'Claude Opus 4',
    provider: 'Anthropic',
    inputCost: 15.0,
    outputCost: 75.0,
    maxTokens: 200000,
    color: '#d4a574',
  },
  'claude-sonnet-4': {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'Anthropic',
    inputCost: 3.0,
    outputCost: 15.0,
    maxTokens: 200000,
    color: '#d4a574',
  },
  'claude-haiku-3.5': {
    id: 'claude-haiku-3.5',
    name: 'Claude Haiku 3.5',
    provider: 'Anthropic',
    inputCost: 0.8,
    outputCost: 4.0,
    maxTokens: 200000,
    color: '#d4a574',
  },
  // Google
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    inputCost: 1.25,
    outputCost: 5.0,
    maxTokens: 1000000,
    color: '#4285f4',
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    inputCost: 0.075,
    outputCost: 0.3,
    maxTokens: 1000000,
    color: '#4285f4',
  },
  // Meta (via Groq)
  'llama-4-70b': {
    id: 'llama-4-70b',
    name: 'Llama 4 70B',
    provider: 'Meta/Groq',
    inputCost: 0.59,
    outputCost: 0.79,
    maxTokens: 131072,
    color: '#0668e1',
  },
  // DeepSeek
  'deepseek-v3': {
    id: 'deepseek-v3',
    name: 'DeepSeek V3',
    provider: 'DeepSeek',
    inputCost: 0.14,
    outputCost: 0.28,
    maxTokens: 128000,
    color: '#5b6ee1',
  },
  // Mistral
  'mistral-large': {
    id: 'mistral-large',
    name: 'Mistral Large',
    provider: 'Mistral',
    inputCost: 2.0,
    outputCost: 6.0,
    maxTokens: 128000,
    color: '#f54e42',
  },
} as const;

type ModelId = keyof typeof MODELS;

interface CompareRequest {
  prompt: string;
  models: string[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

interface ModelResponse {
  modelId: string;
  modelName: string;
  provider: string;
  response: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  error?: string;
  color: string;
}

interface CompareResponse {
  id: string;
  prompt: string;
  timestamp: number;
  results: ModelResponse[];
  totalLatencyMs: number;
  totalCostUsd: number;
}

// Simulate model response (in production, call actual APIs)
async function queryModel(
  modelId: ModelId,
  prompt: string,
  systemPrompt?: string,
  maxTokens?: number
): Promise<ModelResponse> {
  const model = MODELS[modelId];
  const startTime = Date.now();

  // Simulate varying response times based on model
  const baseLatency = {
    'gpt-4o': 800,
    'gpt-4o-mini': 400,
    'gpt-4-turbo': 1200,
    'claude-opus-4': 1500,
    'claude-sonnet-4': 600,
    'claude-haiku-3.5': 300,
    'gemini-2.5-pro': 700,
    'gemini-2.5-flash': 250,
    'llama-4-70b': 350,
    'deepseek-v3': 500,
    'mistral-large': 550,
  }[modelId] || 500;

  // Add some randomness
  const latency = baseLatency + Math.floor(Math.random() * 200);
  await new Promise((resolve) => setTimeout(resolve, latency));

  // Simulate response based on model personality
  const responses: Record<string, string> = {
    'gpt-4o': `I'll provide a comprehensive analysis of your question.\n\n${generateResponse(prompt, 'analytical')}`,
    'gpt-4o-mini': `Here's a concise answer:\n\n${generateResponse(prompt, 'concise')}`,
    'gpt-4-turbo': `Let me think through this carefully.\n\n${generateResponse(prompt, 'detailed')}`,
    'claude-opus-4': `I'll approach this thoughtfully and thoroughly.\n\n${generateResponse(prompt, 'thorough')}`,
    'claude-sonnet-4': `Great question! Here's my take:\n\n${generateResponse(prompt, 'balanced')}`,
    'claude-haiku-3.5': `${generateResponse(prompt, 'brief')}`,
    'gemini-2.5-pro': `Based on my analysis:\n\n${generateResponse(prompt, 'structured')}`,
    'gemini-2.5-flash': `Quick answer:\n\n${generateResponse(prompt, 'quick')}`,
    'llama-4-70b': `Here's what I think:\n\n${generateResponse(prompt, 'direct')}`,
    'deepseek-v3': `Let me help with that:\n\n${generateResponse(prompt, 'helpful')}`,
    'mistral-large': `Analyzing your query:\n\n${generateResponse(prompt, 'technical')}`,
  };

  const response = responses[modelId] || generateResponse(prompt, 'default');

  // Estimate tokens (rough approximation: ~4 chars per token)
  const inputTokens = Math.ceil((prompt.length + (systemPrompt?.length || 0)) / 4);
  const outputTokens = Math.ceil(response.length / 4);
  const totalTokens = inputTokens + outputTokens;

  // Calculate cost
  const inputCost = (inputTokens / 1000000) * model.inputCost;
  const outputCost = (outputTokens / 1000000) * model.outputCost;
  const costUsd = inputCost + outputCost;

  return {
    modelId,
    modelName: model.name,
    provider: model.provider,
    response,
    latencyMs: Date.now() - startTime,
    inputTokens,
    outputTokens,
    totalTokens,
    costUsd,
    color: model.color,
  };
}

function generateResponse(prompt: string, style: string): string {
  const promptLower = prompt.toLowerCase();

  // Generate contextual responses based on prompt content
  if (promptLower.includes('code') || promptLower.includes('function') || promptLower.includes('program')) {
    return generateCodeResponse(style);
  }
  if (promptLower.includes('explain') || promptLower.includes('what is')) {
    return generateExplanationResponse(prompt, style);
  }
  if (promptLower.includes('compare') || promptLower.includes('difference')) {
    return generateComparisonResponse(style);
  }
  if (promptLower.includes('list') || promptLower.includes('steps')) {
    return generateListResponse(style);
  }

  return generateGenericResponse(prompt, style);
}

function generateCodeResponse(style: string): string {
  const codes: Record<string, string> = {
    analytical: `Here's a well-structured solution:\n\n\`\`\`javascript\nfunction solution(input) {\n  // Validate input\n  if (!input) throw new Error('Input required');\n  \n  // Process data\n  const result = input.map(item => item * 2);\n  \n  // Return result\n  return result;\n}\n\`\`\`\n\nThis implementation follows best practices with proper error handling.`,
    concise: `\`\`\`javascript\nconst solve = (x) => x.map(i => i * 2);\n\`\`\``,
    detailed: `Let me break down the solution step by step:\n\n1. **Input Validation**: First, we check if the input is valid\n2. **Processing**: We iterate through each element\n3. **Output**: Return the transformed result\n\n\`\`\`javascript\nfunction processData(data) {\n  if (!Array.isArray(data)) {\n    throw new TypeError('Expected array');\n  }\n  return data.map(item => {\n    return item * 2;\n  });\n}\n\`\`\``,
    default: `\`\`\`javascript\nfunction example(input) {\n  return input.map(x => x * 2);\n}\n\`\`\``,
  };
  return codes[style] || codes.default;
}

function generateExplanationResponse(prompt: string, style: string): string {
  const explanations: Record<string, string> = {
    thorough: `This is a multifaceted topic that deserves careful consideration.\n\n**Definition**: At its core, this concept refers to...\n\n**Key Aspects**:\n- First, we need to understand the foundational principles\n- Second, the practical applications are numerous\n- Third, there are important considerations to keep in mind\n\n**In Practice**: When applied in real-world scenarios, this means...`,
    balanced: `Great question! Let me explain this clearly.\n\nThe concept you're asking about has both theoretical and practical dimensions. On one hand, it represents a fundamental principle in the field. On the other hand, it has immediate real-world applications.\n\nThe key takeaway is that understanding this helps you make better decisions.`,
    brief: `In simple terms: this refers to the process of achieving a goal through systematic steps. It's commonly used in various fields.`,
    structured: `**Overview**\nThis topic encompasses several key areas.\n\n**Core Concept**\nThe fundamental idea is...\n\n**Applications**\n1. Industry use cases\n2. Research applications\n3. Everyday examples\n\n**Summary**\nUnderstanding this enables better decision-making.`,
    default: `This is an interesting topic. The main idea is that it helps solve problems efficiently by applying systematic approaches.`,
  };
  return explanations[style] || explanations.default;
}

function generateComparisonResponse(style: string): string {
  const comparisons: Record<string, string> = {
    analytical: `| Aspect | Option A | Option B |\n|--------|----------|----------|\n| Performance | High | Medium |\n| Cost | $$$ | $$ |\n| Ease of Use | Moderate | High |\n\n**Analysis**: Option A excels in performance but comes at a higher cost. Option B offers a better balance for most use cases.`,
    direct: `The main differences:\n- **Speed**: A is faster\n- **Cost**: B is cheaper\n- **Flexibility**: A offers more options\n\nMy recommendation: Choose based on your priorities.`,
    technical: `From a technical standpoint:\n\n1. **Architecture**: A uses a distributed system, B uses monolithic\n2. **Scalability**: A scales horizontally, B vertically\n3. **Latency**: A: ~50ms, B: ~100ms\n\nConclusion: A is better for high-scale applications.`,
    default: `Both options have their merits. A is better for performance, while B is more cost-effective. The best choice depends on your specific needs.`,
  };
  return comparisons[style] || comparisons.default;
}

function generateListResponse(style: string): string {
  const lists: Record<string, string> = {
    detailed: `Here are the comprehensive steps:\n\n1. **Preparation Phase**\n   - Gather requirements\n   - Set up environment\n   - Define success criteria\n\n2. **Implementation Phase**\n   - Execute the plan\n   - Monitor progress\n   - Adjust as needed\n\n3. **Review Phase**\n   - Evaluate results\n   - Document lessons learned\n   - Plan next iteration`,
    quick: `1. Start here\n2. Do this\n3. Then that\n4. Done!`,
    helpful: `I'd recommend these steps:\n\n1. First, understand your goal clearly\n2. Break it down into smaller tasks\n3. Tackle each task one by one\n4. Review and refine\n5. Celebrate your progress!\n\nLet me know if you need more details on any step.`,
    default: `Steps:\n1. Begin\n2. Process\n3. Complete\n4. Review`,
  };
  return lists[style] || lists.default;
}

function generateGenericResponse(prompt: string, style: string): string {
  const responses: Record<string, string> = {
    analytical: `Analyzing your query, I can provide several insights. The topic you've raised touches on multiple important areas. Let me break this down systematically and offer a comprehensive perspective.`,
    concise: `Here's the key point: focus on the essentials and iterate quickly.`,
    thorough: `Thank you for this thought-provoking question. Let me explore multiple angles to give you the most complete answer possible. There are several factors to consider, each with its own implications.`,
    balanced: `This is a great topic to explore. I'll share my perspective while acknowledging different viewpoints. The answer depends on context, but here's a solid starting point.`,
    brief: `The short answer is: it depends on your specific situation and goals.`,
    structured: `**Summary**: Key insights on your query\n\n**Details**: The main considerations include context, goals, and constraints.\n\n**Recommendation**: Start with the basics and build from there.`,
    quick: `Quick take: focus on what matters most to you and go from there.`,
    direct: `Here's my take: do what aligns with your goals. Keep it simple.`,
    helpful: `I'm happy to help! Based on your question, I'd suggest starting with the fundamentals and building up. Feel free to ask follow-up questions!`,
    technical: `From a technical perspective, the optimal approach involves considering trade-offs between complexity, performance, and maintainability.`,
    default: `Based on your query, here's what I think would be most helpful. Consider the context and apply the principles that best fit your situation.`,
  };
  return responses[style] || responses.default;
}

// Store comparison history (in-memory for demo)
const comparisonHistory: CompareResponse[] = [];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, models, systemPrompt, maxTokens, temperature } = body as CompareRequest;

    // Validate request
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    if (!models || !Array.isArray(models) || models.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 models required for comparison' },
        { status: 400 }
      );
    }

    if (models.length > 4) {
      return NextResponse.json(
        { error: 'Maximum 4 models can be compared at once' },
        { status: 400 }
      );
    }

    // Validate model IDs
    const validModels = models.filter((m) => m in MODELS) as ModelId[];
    if (validModels.length !== models.length) {
      const invalidModels = models.filter((m) => !(m in MODELS));
      return NextResponse.json(
        { error: `Invalid model IDs: ${invalidModels.join(', ')}` },
        { status: 400 }
      );
    }

    const startTime = Date.now();

    // Query all models in parallel
    const results = await Promise.all(
      validModels.map((modelId) =>
        queryModel(modelId, prompt, systemPrompt, maxTokens).catch((error) => ({
          modelId,
          modelName: MODELS[modelId].name,
          provider: MODELS[modelId].provider,
          response: '',
          latencyMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: 0,
          error: error.message,
          color: MODELS[modelId].color,
        }))
      )
    );

    const totalLatencyMs = Date.now() - startTime;
    const totalCostUsd = results.reduce((sum, r) => sum + r.costUsd, 0);

    const comparison: CompareResponse = {
      id: crypto.randomUUID(),
      prompt,
      timestamp: Date.now(),
      results,
      totalLatencyMs,
      totalCostUsd,
    };

    // Save to history
    comparisonHistory.unshift(comparison);
    if (comparisonHistory.length > 100) {
      comparisonHistory.pop();
    }

    return NextResponse.json(comparison);
  } catch (error) {
    console.error('Compare error:', error);
    return NextResponse.json(
      { error: 'Failed to compare models' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'models') {
    // Return available models
    const modelList = Object.entries(MODELS).map(([id, model]) => ({
      id,
      name: model.name,
      provider: model.provider,
      inputCost: model.inputCost,
      outputCost: model.outputCost,
      maxTokens: model.maxTokens,
      color: model.color,
    }));

    // Group by provider
    const byProvider: Record<string, typeof modelList> = {};
    for (const model of modelList) {
      if (!byProvider[model.provider]) {
        byProvider[model.provider] = [];
      }
      byProvider[model.provider].push(model);
    }

    return NextResponse.json({
      models: modelList,
      byProvider,
      total: modelList.length,
    });
  }

  if (action === 'history') {
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    return NextResponse.json({
      history: comparisonHistory.slice(0, limit),
      total: comparisonHistory.length,
    });
  }

  return NextResponse.json({
    message: 'Model Comparison API',
    endpoints: {
      'POST /api/compare': 'Compare models with a prompt',
      'GET /api/compare?action=models': 'List available models',
      'GET /api/compare?action=history': 'Get comparison history',
    },
  });
}
