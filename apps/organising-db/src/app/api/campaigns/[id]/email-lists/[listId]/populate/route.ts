/**
 * Populate an email_list from filter criteria.
 *
 * Mirrors /api/campaigns/[id]/call-lists/[listId]/populate but:
 *   • Targets workers with email (rather than phone).
 *   • Writes to email_list_items (sequential sort_order; priority = sort_order).
 *   • Skips priority bucket logic; v1 sends in list order only.
 *
 * Request body:
 *   { filters: { membership?, employer_id?, worksite_id?, roles?, occupations? } }
 *
 * Response:
 *   { added: number, skipped_no_email: number, skipped_duplicate: number, total_items: number }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface PopulateFilters {
  membership?: string
  employer_id?: string | number
  worksite_id?: string | number
  roles?: string[]
  occupations?: string[]
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; listId: string }> },
) {
  try {
    const { id: campaignId, listId } = await params
    const cid = parseInt(campaignId, 10)
    const lid = parseInt(listId, 10)
    if (!Number.isFinite(cid) || !Number.isFinite(lid)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: list, error: listErr } = await supabase
      .from('email_lists')
      .select('list_id, campaign_id')
      .eq('list_id', lid)
      .maybeSingle()
    if (listErr) throw listErr
    if (!list || list.campaign_id !== cid) {
      return NextResponse.json({ error: 'Email list not found' }, { status: 404 })
    }

    const body = await req.json().catch(() => ({}))
    const filters: PopulateFilters = (body?.filters as PopulateFilters) ?? {}

    // Pull campaign-scoped workers with their email + filter dimensions in one
    // round-trip via the same join shape used by /list-builder.
    let q = supabase
      .from('campaign_worker_membership')
      .select(
        `worker_id,
         workers!inner(
           worker_id,
           first_name,
           last_name,
           email,
           occupation,
           employer_id,
           worksite_id,
           member_role_type_id,
           member_role_type:member_role_types(role_name),
           union_membership_type:union_membership_types(type_name)
         )`,
      )
      .eq('campaign_id', cid)

    if (filters.employer_id) {
      q = q.eq('workers.employer_id', filters.employer_id)
    }
    if (filters.worksite_id) {
      q = q.eq('workers.worksite_id', filters.worksite_id)
    }
    if (filters.occupations && filters.occupations.length > 0) {
      q = q.in('workers.occupation', filters.occupations)
    }

    const { data: rows, error: rowsErr } = await q
    if (rowsErr) throw rowsErr

    const filtered = (rows ?? []).filter((r) => {
      const w = r.workers as unknown as {
        email: string | null
        member_role_type: { role_name: string } | { role_name: string }[] | null
        union_membership_type:
          | { type_name: string }
          | { type_name: string }[]
          | null
      } | null
      if (!w) return false
      if (filters.membership && filters.membership !== 'all') {
        const ump = Array.isArray(w.union_membership_type)
          ? w.union_membership_type[0]
          : w.union_membership_type
        const typeName = ump?.type_name ?? null
        if (filters.membership === 'member' && typeName !== 'member') return false
        if (filters.membership === 'member_pending' && typeName !== 'member_pending') return false
        if (filters.membership === 'non_member' && typeName !== 'non_member') return false
      }
      if (filters.roles && filters.roles.length > 0) {
        const role = Array.isArray(w.member_role_type)
          ? w.member_role_type[0]
          : w.member_role_type
        if (!role || !filters.roles.includes(role.role_name)) return false
      }
      return true
    })

    let skippedNoEmail = 0
    const withEmail = filtered.filter((r) => {
      const w = r.workers as unknown as { email: string | null } | null
      if (!w?.email || w.email.trim() === '') {
        skippedNoEmail += 1
        return false
      }
      return true
    })

    // Existing items in this list (so populate is idempotent / additive).
    const { data: existing, error: existingErr } = await supabase
      .from('email_list_items')
      .select('worker_id')
      .eq('list_id', lid)
    if (existingErr) throw existingErr
    const existingIds = new Set((existing ?? []).map((e) => e.worker_id))

    const newRows = withEmail
      .filter((r) => !existingIds.has(r.worker_id))
      .map((r, i) => {
        const w = r.workers as unknown as { email: string }
        return {
          list_id: lid,
          worker_id: r.worker_id,
          email: w.email,
          sort_order: existingIds.size + i,
          priority_score: existingIds.size + i,
          status: 'pending' as const,
        }
      })

    const skippedDuplicate = withEmail.length - newRows.length

    if (newRows.length > 0) {
      const { error: insErr } = await supabase.from('email_list_items').insert(newRows)
      if (insErr) throw insErr
    }

    const total = existingIds.size + newRows.length
    const { error: totalErr } = await supabase
      .from('email_lists')
      .update({ total_items: total })
      .eq('list_id', lid)
    if (totalErr) throw totalErr

    return NextResponse.json({
      added: newRows.length,
      skipped_no_email: skippedNoEmail,
      skipped_duplicate: skippedDuplicate,
      total_items: total,
    })
  } catch (error) {
    console.error('POST email-list populate error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to populate email list',
      },
      { status: 500 },
    )
  }
}
