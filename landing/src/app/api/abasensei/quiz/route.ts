import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { topic, difficulty } = await req.json()
    const res = await fetch('https://abasensei.app/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: topic || 'reinforcement', difficulty: difficulty || 'medium' })
    })
    const data = await res.json()
    return NextResponse.json({ ok: true, ...data })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
