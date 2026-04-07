import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

const execAsync = promisify(exec)

export async function POST(req: NextRequest) {
  try {
    const { repoUrl } = await req.json()
    if (!repoUrl) return NextResponse.json({ error: 'repoUrl required' }, { status: 400 })

    const tmpDir = await mkdtemp(join(tmpdir(), 'vlayer-'))
    
    await execAsync(`git clone --depth 1 ${repoUrl} ${tmpDir}/repo`, { timeout: 30000 })
    const { stdout } = await execAsync(`npx verification-layer scan ${tmpDir}/repo -f json`, { timeout: 50000 })
    await rm(tmpDir, { recursive: true, force: true })

    return NextResponse.json({ ok: true, report: JSON.parse(stdout) })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
