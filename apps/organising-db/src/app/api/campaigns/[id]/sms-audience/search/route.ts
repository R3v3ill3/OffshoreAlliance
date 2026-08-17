/**
 * GET /api/campaigns/[id]/sms-audience/search?q=…&scope=campaign|org
 *
 * Name search over the worker directory for the audience picker's
 * "Find people" flow: type a first or last name, pick individuals.
 *
 * The picker could already build an audience by filter, by saved list,
 * by CSV import, or by creating a brand-new person — but not by
 * finding someone who is already in the database. That gap made adding
 * two known members to a chat board harder than importing a file.
 *
 * Scope mirrors the picker's universe: 'campaign' (default) restricts
 * to campaign_worker_membership, matching what the "whole campaign"
 * audience would resolve to; 'org' searches the whole directory for
 * standalone episodes, which have no campaign workforce. RLS on
 * `workers` still applies either way.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'

/** Candidates pulled before campaign-membership filtering. */
const CANDIDATE_LIMIT = 200
/** Rows actually returned to the picker. */
const RESULT_LIMIT = 50
/** Below this, an ilike scan is too broad to be useful. */
const MIN_QUERY_LENGTH = 2

interface WorkerRow {
  worker_id: number
  first_name: string | null
  last_name: string | null
  phone_e164: string | null
  sms_opt_out: boolean | null
  employer: { employer_name: string } | null
}

/** Escape PostgREST `or()` metacharacters in user input. */
function escapeForOr(term: string): string {
  return term.replace(/[,()\\]/g, ' ').trim()
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const cid = parseInt(id, 10)
    if (!Number.isFinite(cid)) {
      return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!profile || profile.role === 'viewer') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 },
      )
    }

    const raw = (req.nextUrl.searchParams.get('q') ?? '').trim()
    const orgWide = req.nextUrl.searchParams.get('scope') === 'org'
    const q = escapeForOr(raw)
    if (q.length < MIN_QUERY_LENGTH) {
      return NextResponse.json({ workers: [] })
    }

    // "john smith" should match first=john AND last=smith, not just a
    // substring of either — so tokens are matched pairwise as well as
    // whole-string.
    const tokens = q.split(/\s+/).filter(Boolean)
    const select =
      'worker_id, first_name, last_name, phone_e164, sms_opt_out, employer:employers(employer_name)'

    let query = supabase
      .from('workers')
      .select(select)
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
      .order('last_name', { ascending: true })
      .limit(CANDIDATE_LIMIT)

    if (tokens.length > 1) {
      const [first, ...rest] = tokens
      const last = rest.join(' ')
      // Two-token queries are almost always "first last"; run that as a
      // separate constrained query and merge, rather than loosening the
      // single-field match above.
      const { data: pairData, error: pairErr } = await supabase
        .from('workers')
        .select(select)
        .ilike('first_name', `%${first}%`)
        .ilike('last_name', `%${last}%`)
        .limit(CANDIDATE_LIMIT)
      if (pairErr) throw pairErr

      const { data: looseData, error: looseErr } = await query
      if (looseErr) throw looseErr

      const merged = new Map<number, WorkerRow>()
      for (const w of [
        ...((pairData ?? []) as unknown as WorkerRow[]),
        ...((looseData ?? []) as unknown as WorkerRow[]),
      ]) {
        merged.set(w.worker_id, w)
      }
      return NextResponse.json({
        workers: await shape(supabase, [...merged.values()], cid, orgWide),
      })
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({
      workers: await shape(
        supabase,
        (data ?? []) as unknown as WorkerRow[],
        cid,
        orgWide,
      ),
    })
  } catch (error) {
    console.error('GET sms-audience search error:', error)
    return errorResponse('Failed to search people', error)
  }
}

/** Campaign-scope filter + response shaping, capped at RESULT_LIMIT. */
async function shape(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: WorkerRow[],
  campaignId: number,
  orgWide: boolean,
) {
  let scoped = rows
  if (!orgWide && rows.length > 0) {
    const ids = rows.map((r) => r.worker_id)
    const inCampaign = new Set<number>()
    for (let i = 0; i < ids.length; i += 500) {
      const { data, error } = await supabase
        .from('campaign_worker_membership')
        .select('worker_id')
        .eq('campaign_id', campaignId)
        .in('worker_id', ids.slice(i, i + 500))
      if (error) throw error
      for (const r of data ?? []) inCampaign.add(r.worker_id as number)
    }
    scoped = rows.filter((r) => inCampaign.has(r.worker_id))
  }

  return scoped
    .sort((a, b) =>
      `${a.last_name ?? ''} ${a.first_name ?? ''}`.localeCompare(
        `${b.last_name ?? ''} ${b.first_name ?? ''}`,
      ),
    )
    .slice(0, RESULT_LIMIT)
    .map((w) => ({
      worker_id: w.worker_id,
      first_name: w.first_name ?? '',
      last_name: w.last_name ?? '',
      phone_e164: w.phone_e164,
      sms_opt_out: !!w.sms_opt_out,
      employer_name: w.employer?.employer_name ?? null,
    }))
}
