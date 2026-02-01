/**
 * Voice Calls API - Call Handling Rules
 *
 * GET    /api/voice/rules - List rules
 * POST   /api/voice/rules - Create rule
 * DELETE /api/voice/rules - Delete rule
 */

import { NextRequest, NextResponse } from 'next/server';

interface CallRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditions: Array<{
    type: 'caller_id' | 'time_of_day' | 'day_of_week' | 'contact_tag';
    operator: string;
    value: string;
  }>;
  actions: Array<{
    type: 'answer_ai' | 'forward' | 'voicemail' | 'reject' | 'sms_response';
    params?: Record<string, unknown>;
  }>;
}

// Mock rules store
const callRules: CallRule[] = [
  {
    id: 'rule_1',
    name: 'Family Calls',
    enabled: true,
    priority: 100,
    conditions: [
      { type: 'contact_tag', operator: 'contains', value: 'family' },
    ],
    actions: [
      { type: 'forward', params: { number: '+15551234567' } },
    ],
  },
  {
    id: 'rule_2',
    name: 'After Hours',
    enabled: true,
    priority: 50,
    conditions: [
      { type: 'time_of_day', operator: 'in_range', value: '18:00-08:00' },
    ],
    actions: [
      { type: 'voicemail', params: { greeting: 'custom' } },
    ],
  },
  {
    id: 'rule_3',
    name: 'Unknown Callers',
    enabled: false,
    priority: 10,
    conditions: [
      { type: 'contact_tag', operator: 'equals', value: '' },
    ],
    actions: [
      { type: 'answer_ai', params: { screen: true } },
    ],
  },
];

/**
 * GET /api/voice/rules
 */
export async function GET() {
  return NextResponse.json({
    rules: callRules.sort((a, b) => b.priority - a.priority),
  });
}

/**
 * POST /api/voice/rules
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const newRule: CallRule = {
      id: `rule_${Date.now()}`,
      name: body.name,
      enabled: body.enabled ?? true,
      priority: body.priority ?? 50,
      conditions: body.conditions || [],
      actions: body.actions || [],
    };

    callRules.push(newRule);

    return NextResponse.json({
      success: true,
      rule: newRule,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/voice/rules
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ruleId = searchParams.get('id');

    if (!ruleId) {
      return NextResponse.json({ error: 'Rule ID required' }, { status: 400 });
    }

    const index = callRules.findIndex((r) => r.id === ruleId);
    if (index === -1) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    callRules.splice(index, 1);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
