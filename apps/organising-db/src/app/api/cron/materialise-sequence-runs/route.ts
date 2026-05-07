import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Cron worker that materialises queued activity_sequence_runs.
 *
 * Authentication: Vercel cron sets the `Authorization: Bearer <CRON_SECRET>`
 * header on each invocation when CRON_SECRET is configured. We validate it
 * here as a basic protection against arbitrary callers. Manual / on-demand
 * runs are also possible via the per-run Materialise API route.
 */
export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

interface QueuedRun {
  run_id: number
}

export async function GET(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization') ?? ''
    const expected = `Bearer ${CRON_SECRET}`
    if (authHeader !== expected) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return NextResponse.json(
      { error: 'missing supabase env' },
      { status: 500 },
    )
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  })

  // Pull a small batch to keep the function quick.
  const { data: runs, error: listError } = await supabase
    .from('activity_sequence_runs')
    .select('run_id')
    .eq('state', 'queued')
    .order('triggered_at', { ascending: true })
    .limit(50)

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 })
  }

  const summary = {
    queued_seen: runs?.length ?? 0,
    materialised: [] as number[],
    failed: [] as Array<{ run_id: number; error: string }>,
  }

  for (const row of (runs ?? []) as QueuedRun[]) {
    const { data, error } = await supabase.rpc('materialise_sequence_run', {
      p_run_id: row.run_id,
    })
    if (error) {
      summary.failed.push({ run_id: row.run_id, error: error.message })
    } else {
      summary.materialised.push(data as number)
    }
  }

  return NextResponse.json(summary)
}
