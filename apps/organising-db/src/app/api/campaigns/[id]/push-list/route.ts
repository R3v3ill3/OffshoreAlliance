import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ActionNetworkClient } from '@/lib/api/action-network'
import { syncWorkerToActionNetwork } from '@/lib/api/action-network'

function getAnClient(): ActionNetworkClient {
  const apiKey = process.env.ACTION_NETWORK_API_KEY
  if (!apiKey || apiKey === 'your-action-network-key-here') {
    throw new Error('Action Network API key not configured')
  }
  return new ActionNetworkClient({ apiKey })
}

interface PushListBody {
  draft_id?: number
  tag_name?: string
  filters: {
    membership?: string[]
    roles?: string[]
    employer_id?: string
    worksite_id?: string
    occupation?: string
    an_tags?: string[]
    exclude_an_tags?: string[]
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const campaignId = Number(id)
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: 'Invalid campaign ID' }, { status: 400 })
    }

    const body: PushListBody = await req.json()
    const { filters, tag_name, draft_id } = body

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('name')
      .eq('campaign_id', campaignId)
      .single()

    let query = supabase
      .from('campaign_worker_membership')
      .select(`
        worker_id,
        oa_leader_role,
        workers!inner (
          worker_id, first_name, last_name, email, phone, occupation,
          employer_id, worksite_id, member_role_type_id, action_network_id,
          employers ( employer_name ),
          worksites ( worksite_name )
        )
      `)
      .eq('campaign_id', campaignId)

    if (filters.roles?.length) {
      query = query.in('oa_leader_role', filters.roles)
    }

    const { data: membershipRows, error: memErr } = await query
    if (memErr) throw memErr

    let workers = (membershipRows ?? []).map((r: Record<string, unknown>) => {
      const w = r.workers as {
        worker_id: number; first_name: string; last_name: string
        email: string | null; phone: string | null; occupation: string | null
        employer_id: number | null; worksite_id: number | null
        member_role_type_id: number | null; action_network_id: string | null
        employers: { employer_name: string } | null
        worksites: { worksite_name: string } | null
      }
      return {
        worker_id: w.worker_id,
        first_name: w.first_name,
        last_name: w.last_name,
        email: w.email,
        phone: w.phone,
        occupation: w.occupation,
        employer_name: w.employers?.employer_name ?? null,
        worksite_name: w.worksites?.worksite_name ?? null,
        action_network_id: w.action_network_id,
        employer_id: w.employer_id,
        worksite_id: w.worksite_id,
        membership_status: w.member_role_type_id ? 'member' : 'non_member',
      }
    })

    if (filters.membership?.length) {
      workers = workers.filter((w) => filters.membership!.includes(w.membership_status))
    }
    if (filters.employer_id && filters.employer_id !== '__all__') {
      const eid = Number(filters.employer_id)
      workers = workers.filter((w) => w.employer_id === eid)
    }
    if (filters.worksite_id && filters.worksite_id !== '__all__') {
      const wid = Number(filters.worksite_id)
      workers = workers.filter((w) => w.worksite_id === wid)
    }
    if (filters.occupation) {
      const q = filters.occupation.toLowerCase()
      workers = workers.filter((w) => w.occupation?.toLowerCase().includes(q))
    }

    let workerIds = workers.map((w) => w.worker_id)

    if (filters.an_tags?.length && workerIds.length > 0) {
      const { data: tagRows } = await supabase
        .from('worker_an_tags')
        .select('worker_id')
        .in('worker_id', workerIds)
        .in('an_tag_id', filters.an_tags)
      const taggedSet = new Set((tagRows ?? []).map((r) => r.worker_id))
      workers = workers.filter((w) => taggedSet.has(w.worker_id))
    }

    if (filters.exclude_an_tags?.length && workerIds.length > 0) {
      const { data: exclRows } = await supabase
        .from('worker_an_tags')
        .select('worker_id')
        .in('worker_id', workerIds)
        .in('an_tag_id', filters.exclude_an_tags)
      const excludedSet = new Set((exclRows ?? []).map((r) => r.worker_id))
      workers = workers.filter((w) => !excludedSet.has(w.worker_id))
    }

    if (workers.length === 0) {
      return NextResponse.json({ error: 'No workers match the filters' }, { status: 400 })
    }

    const anClient = getAnClient()

    const dateStr = new Date().toISOString().slice(0, 10)
    const finalTagName = tag_name || `${campaign?.name || `Campaign ${campaignId}`} - ${dateStr}`

    const tagResponse = await anClient.createTag(finalTagName)
    const tagHref = (tagResponse as Record<string, unknown>)?._links
      ? ((tagResponse as Record<string, Record<string, { href: string }>>)._links.self?.href ?? '')
      : ''
    const tagId = tagHref.split('/').pop() || ''

    if (!tagId) {
      return NextResponse.json({ error: 'Failed to create tag in Action Network' }, { status: 500 })
    }

    let contactsTagged = 0
    let contactsCreated = 0
    let contactsSkipped = 0
    const errors: string[] = []

    for (const worker of workers) {
      try {
        if (!worker.email) {
          contactsSkipped++
          continue
        }

        let anId = worker.action_network_id

        if (!anId) {
          const anPerson = syncWorkerToActionNetwork({
            first_name: worker.first_name,
            last_name: worker.last_name,
            email: worker.email,
            phone: worker.phone,
            employer_name: worker.employer_name ?? undefined,
            worksite_name: worker.worksite_name ?? undefined,
            occupation: worker.occupation,
          })

          const createResult = await anClient.createPerson(anPerson)
          const personHref = (createResult as Record<string, Record<string, { href: string }>>)?._links?.self?.href ?? ''
          anId = personHref.split('/').pop() || ''

          if (anId) {
            await supabase
              .from('workers')
              .update({ action_network_id: anId })
              .eq('worker_id', worker.worker_id)
            contactsCreated++
          } else {
            contactsSkipped++
            continue
          }
        }

        await anClient.addTagging(tagId, {
          email_addresses: [{ address: worker.email }],
        })

        await supabase.from('worker_an_tags').upsert(
          {
            worker_id: worker.worker_id,
            an_tag_id: tagId,
            an_tag_name: finalTagName,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: 'worker_id,an_tag_id' },
        )

        contactsTagged++
      } catch (err) {
        errors.push(`Worker ${worker.worker_id} (${worker.email}): ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    await supabase.from('an_tag_sync_log').insert({
      campaign_id: campaignId,
      an_tag_id: tagId,
      an_tag_name: finalTagName,
      sync_direction: 'push',
      workers_affected: contactsTagged + contactsCreated,
      synced_by: user.id,
    })

    if (draft_id) {
      await supabase
        .from('campaign_comms_drafts')
        .update({ wtp_context_snapshot: { an_tag_id: tagId, an_tag_href: tagHref, an_tag_name: finalTagName } })
        .eq('draft_id', draft_id)
    }

    return NextResponse.json({
      success: true,
      tag_id: tagId,
      tag_href: tagHref,
      tag_name: finalTagName,
      contacts_tagged: contactsTagged,
      contacts_created: contactsCreated,
      contacts_skipped: contactsSkipped,
      errors: errors.length > 0 ? errors : undefined,
      total_workers: workers.length,
    })
  } catch (error) {
    console.error('Push list error:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
