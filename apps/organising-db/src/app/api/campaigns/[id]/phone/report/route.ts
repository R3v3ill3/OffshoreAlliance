import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const QuerySchema = z.object({
  groupBy: z.enum(['campaign_unit', 'membership_status', 'worksite', 'list']).optional(),
  list_id: z.coerce.number().int().positive().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
})

type SupportLevelKey = 'strong_supporter' | 'supporter' | 'neutral' | 'unsupportive' | 'hostile'

interface ViewRow {
  campaign_id: number
  list_id: number
  list_name: string
  script_id: number | null
  script_title: string | null
  attempt_id: number | null
  started_at: string | null
  dial_disposition: string | null
  call_disposition: string | null
  cta_response: string | null
  support_level_assessed: string | null
  worker_id: number
  membership_status: string
  worksite_id: number | null
  worksite_name: string | null
  campaign_unit_id: number | null
  campaign_unit_name: string | null
  objection_count: number
  issue_count: number
}

function emptySupport(): Record<SupportLevelKey, number> {
  return { strong_supporter: 0, supporter: 0, neutral: 0, unsupportive: 0, hostile: 0 }
}

function computeSummary(attempts: ViewRow[]) {
  const total_attempts = attempts.length
  const unique_workers = new Set(attempts.map((r) => r.worker_id)).size
  const connected = attempts.filter((r) => r.dial_disposition === 'connected').length
  const no_answer = attempts.filter((r) => r.dial_disposition === 'no_answer').length
  const voicemail = attempts.filter(
    (r) => r.dial_disposition === 'voicemail_left' || r.dial_disposition === 'voicemail_no_message',
  ).length
  const bad_number = attempts.filter(
    (r) => r.dial_disposition === 'disconnected' || r.dial_disposition === 'wrong_number',
  ).length
  const dnc = attempts.filter((r) => r.dial_disposition === 'do_not_call').length
  const connect_rate_pct = total_attempts > 0 ? Math.round((connected / total_attempts) * 100) : 0
  const cta_accepted = attempts.filter((r) => r.cta_response === 'accepted').length
  const cta_considering = attempts.filter((r) => r.cta_response === 'considering').length
  const cta_declined = attempts.filter((r) => r.cta_response === 'declined').length
  const cta_not_reached = attempts.filter((r) => r.cta_response === 'not_reached').length
  const positive_calls = attempts.filter((r) => r.call_disposition === 'completed_positive').length
  const negative_calls = attempts.filter((r) => r.call_disposition === 'completed_negative').length
  const neutral_calls = attempts.filter((r) => r.call_disposition === 'completed_neutral').length
  const objections_total = attempts.reduce((sum, r) => sum + (r.objection_count || 0), 0)
  const issues_total = attempts.reduce((sum, r) => sum + (r.issue_count || 0), 0)

  return {
    total_attempts,
    unique_workers,
    connected,
    no_answer,
    voicemail,
    bad_number,
    dnc,
    connect_rate_pct,
    cta_accepted,
    cta_considering,
    cta_declined,
    cta_not_reached,
    positive_calls,
    negative_calls,
    neutral_calls,
    objections_total,
    issues_total,
  }
}

function computeGroups(allRows: ViewRow[], groupBy: string) {
  // Map: groupKey → { label, deduped attempts (Set<attempt_id>), rows }
  const groupMap = new Map<
    string,
    { label: string; seen: Set<number>; rows: ViewRow[] }
  >()

  for (const row of allRows) {
    if (row.attempt_id === null) continue

    let key: string
    let label: string

    switch (groupBy) {
      case 'campaign_unit':
        key = String(row.campaign_unit_id ?? '__none__')
        label = row.campaign_unit_name ?? 'No Campaign Unit'
        break
      case 'membership_status':
        key = row.membership_status
        label = row.membership_status.replace(/_/g, ' ')
        break
      case 'worksite':
        key = String(row.worksite_id ?? '__none__')
        label = row.worksite_name ?? 'No Worksite'
        break
      case 'list':
        key = String(row.list_id)
        label = row.list_name
        break
      default:
        continue
    }

    if (!groupMap.has(key)) {
      groupMap.set(key, { label, seen: new Set(), rows: [] })
    }
    const g = groupMap.get(key)!
    // Dedupe by attempt_id within each group
    if (!g.seen.has(row.attempt_id)) {
      g.seen.add(row.attempt_id)
      g.rows.push(row)
    }
  }

  return [...groupMap.entries()]
    .map(([key, g]) => {
      const rows = g.rows
      const total_attempts = rows.length
      const connected = rows.filter((r) => r.dial_disposition === 'connected').length
      const connect_rate_pct =
        total_attempts > 0 ? Math.round((connected / total_attempts) * 100) : 0
      const cta_accepted = rows.filter((r) => r.cta_response === 'accepted').length
      const cta_considering = rows.filter((r) => r.cta_response === 'considering').length
      const cta_declined = rows.filter((r) => r.cta_response === 'declined').length
      const cta_not_reached = rows.filter((r) => r.cta_response === 'not_reached').length
      const objections_total = rows.reduce((sum, r) => sum + (r.objection_count || 0), 0)
      const issues_total = rows.reduce((sum, r) => sum + (r.issue_count || 0), 0)
      const support_levels = emptySupport()
      for (const r of rows) {
        const sl = r.support_level_assessed as SupportLevelKey | null
        if (sl && sl in support_levels) support_levels[sl]++
      }

      return {
        group_key: key,
        group_label: g.label,
        total_attempts,
        connected,
        connect_rate_pct,
        cta_accepted,
        cta_considering,
        cta_declined,
        cta_not_reached,
        objections_total,
        issues_total,
        support_levels,
      }
    })
    .sort((a, b) => b.total_attempts - a.total_attempts)
}

interface ObjectionRow {
  id: number
  outcome: string
  objection_id: number | null
  custom_label: string | null
  call_objections: { label: string } | null
}

interface IssueRow {
  id: number
  issue_label: string
  heat: number
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const campaignId = parseInt(id, 10)
    if (isNaN(campaignId)) {
      return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Parse and validate query params
    const { searchParams } = req.nextUrl
    const parsed = QuerySchema.safeParse({
      groupBy: searchParams.get('groupBy') ?? undefined,
      list_id: searchParams.get('list_id') ?? undefined,
      start_date: searchParams.get('start_date') ?? undefined,
      end_date: searchParams.get('end_date') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 })
    }
    const { groupBy, list_id, start_date, end_date } = parsed.data

    // Query the reporting view
    let viewQuery = supabase
      .from('vw_call_action_report')
      .select('*')
      .eq('campaign_id', campaignId)

    if (list_id) viewQuery = viewQuery.eq('list_id', list_id)
    if (start_date) viewQuery = viewQuery.gte('started_at', start_date)
    if (end_date) viewQuery = viewQuery.lte('started_at', end_date + 'T23:59:59.999Z')

    const { data: viewRows, error: viewError } = await viewQuery
    if (viewError) throw viewError

    const allRows = (viewRows ?? []) as ViewRow[]

    // Dedupe by attempt_id (for summary; null attempt_id = no call yet, excluded from call stats)
    const seenAttempts = new Set<number>()
    const uniqueAttempts: ViewRow[] = []
    for (const row of allRows) {
      if (row.attempt_id === null) continue
      if (!seenAttempts.has(row.attempt_id)) {
        seenAttempts.add(row.attempt_id)
        uniqueAttempts.push(row)
      }
    }

    const summary = computeSummary(uniqueAttempts)
    const groups = groupBy ? computeGroups(allRows, groupBy) : []

    // --- Objection breakdown ---
    let objection_breakdown: Array<{
      label: string
      count: number
      fully_resolved: number
      partially_resolved: number
      not_resolved: number
    }> = []

    // --- Issue breakdown ---
    let issue_breakdown: Array<{
      label: string
      count: number
      avg_heat: number
      max_heat: number
    }> = []

    if (uniqueAttempts.length > 0) {
      const attemptIds = [...seenAttempts]

      // Objection breakdown
      const { data: objRows, error: objError } = await supabase
        .from('call_attempt_objections')
        .select('id, outcome, objection_id, custom_label, call_objections(label)')
        .in('attempt_id', attemptIds)
      if (objError) throw objError

      const objMap = new Map<
        string,
        { count: number; fully_resolved: number; partially_resolved: number; not_resolved: number }
      >()
      for (const obj of (objRows ?? []) as unknown as ObjectionRow[]) {
        const label =
          obj.call_objections?.label ?? obj.custom_label ?? 'Unknown objection'
        if (!objMap.has(label)) {
          objMap.set(label, { count: 0, fully_resolved: 0, partially_resolved: 0, not_resolved: 0 })
        }
        const entry = objMap.get(label)!
        entry.count++
        if (obj.outcome === 'fully_resolved') entry.fully_resolved++
        else if (obj.outcome === 'partially_resolved') entry.partially_resolved++
        else entry.not_resolved++
      }
      objection_breakdown = [...objMap.entries()]
        .map(([label, stats]) => ({ label, ...stats }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)

      // Issue breakdown
      const { data: issueRows, error: issueError } = await supabase
        .from('call_issue_observations')
        .select('id, issue_label, heat')
        .in('attempt_id', attemptIds)
      if (issueError) throw issueError

      const issueMap = new Map<string, { count: number; heat_sum: number; max_heat: number }>()
      for (const iss of (issueRows ?? []) as IssueRow[]) {
        if (!issueMap.has(iss.issue_label)) {
          issueMap.set(iss.issue_label, { count: 0, heat_sum: 0, max_heat: 0 })
        }
        const entry = issueMap.get(iss.issue_label)!
        entry.count++
        entry.heat_sum += iss.heat
        entry.max_heat = Math.max(entry.max_heat, iss.heat)
      }
      issue_breakdown = [...issueMap.entries()]
        .map(([label, stats]) => ({
          label,
          count: stats.count,
          avg_heat: Math.round((stats.heat_sum / stats.count) * 10) / 10,
          max_heat: stats.max_heat,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    }

    return NextResponse.json({ summary, groups, objection_breakdown, issue_breakdown })
  } catch (err) {
    console.error('Phone report error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load report' },
      { status: 500 },
    )
  }
}
