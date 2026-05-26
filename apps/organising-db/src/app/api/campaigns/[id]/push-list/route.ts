import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCampaignMembershipStatus } from '@/lib/campaign/constants'
import { ActionNetworkClient } from '@/lib/api/action-network'
import { syncWorkerToActionNetwork } from '@/lib/api/action-network'
import { recordEmailSend, tagWorkerEmailed } from '@/lib/comms/send-log'

function getAnClient(): ActionNetworkClient {
  const apiKey = process.env.ACTION_NETWORK_API_KEY
  if (!apiKey || apiKey === 'your-action-network-key-here') {
    throw new Error('Action Network API key not configured')
  }
  return new ActionNetworkClient({ apiKey })
}

function generateRandomSuffix(length: number = 3): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

interface PushListBody {
  draft_id?: number
  tag_name?: string
  /** When set, only these workers (must still match campaign membership query) are pushed */
  worker_ids?: number[]
  filters: {
    membership?: string[]
    roles?: string[]
    employer_id?: string
    worksite_id?: string
    ou_id?: string
    ou_type?: string
    multi_unit_only?: boolean
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
    const { filters, tag_name, draft_id, worker_ids: selectedWorkerIds } = body

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('name')
      .eq('campaign_id', campaignId)
      .single()

    const query = supabase
      .from('campaign_worker_membership')
      .select(`
        worker_id,
        workers!inner (
          worker_id, first_name, last_name, email, phone, occupation,
          employer_id, worksite_id, member_role_type_id, is_bargaining_rep, action_network_id,
          employers ( employer_name ),
          worksites ( worksite_name ),
          member_role_type:member_role_types ( role_name ),
          union_membership_type:union_membership_types ( type_name )
        )
      `)
      .eq('campaign_id', campaignId)

    const { data: membershipRows, error: memErr } = await query
    if (memErr) throw memErr

    let workers = (membershipRows ?? []).map((r: Record<string, unknown>) => {
      const w = r.workers as {
        worker_id: number; first_name: string; last_name: string
        email: string | null; phone: string | null; occupation: string | null
        employer_id: number | null; worksite_id: number | null
        member_role_type_id: number | null
        is_bargaining_rep: boolean | null
        action_network_id: string | null
        employers: { employer_name: string } | null
        worksites: { worksite_name: string } | null
        member_role_type: { role_name: string } | { role_name: string }[] | null
        union_membership_type: { type_name: string } | { type_name: string }[] | null
      }
      const mrt = Array.isArray(w.member_role_type) ? w.member_role_type[0] : w.member_role_type
      const umt = Array.isArray(w.union_membership_type)
        ? w.union_membership_type[0]
        : w.union_membership_type
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
        membership_status: getCampaignMembershipStatus({
          unionMembershipTypeName: umt?.type_name,
          memberRoleName: mrt?.role_name,
          isBargainingRep: w.is_bargaining_rep,
        }),
        role_name: mrt?.role_name ?? null,
      }
    })

    if (filters.roles?.length) {
      workers = workers.filter((w: { role_name: string | null }) =>
        w.role_name && filters.roles!.includes(w.role_name)
      )
    }

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

    if (filters.ou_id || filters.ou_type) {
      const workerIdsBeforeOu = workers.map((w) => w.worker_id)
      if (workerIdsBeforeOu.length > 0) {
        let ouQuery = supabase
          .from('campaign_worker_ou')
          .select('worker_id, ou:campaign_organising_units!inner(ou_id, campaign_id, ou_type)')
          .in('worker_id', workerIdsBeforeOu)

        if (filters.ou_id && filters.ou_id !== '__all__') {
          const numericOuId = Number(filters.ou_id)
          if (Number.isFinite(numericOuId)) {
            ouQuery = ouQuery.eq('ou_id', numericOuId)
          }
        }
        if (filters.ou_type && filters.ou_type !== '__all__') {
          ouQuery = ouQuery.eq('ou.ou_type', filters.ou_type)
        }

        const { data: ouRows, error: ouErr } = await ouQuery
        if (ouErr) throw ouErr
        const allowed = new Set(
          (ouRows ?? [])
            .filter((row: Record<string, unknown>) => {
              const ou = row.ou as { campaign_id?: number } | { campaign_id?: number }[] | null
              const joined = Array.isArray(ou) ? ou[0] : ou
              return joined?.campaign_id === campaignId
            })
            .map((row: Record<string, unknown>) => row.worker_id as number),
        )
        workers = workers.filter((w) => allowed.has(w.worker_id))
      } else {
        workers = []
      }
    }

    const workerIds = workers.map((w) => w.worker_id)

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

    if (filters.multi_unit_only && workers.length > 0) {
      const workerIdsAfterFilters = workers.map((w) => w.worker_id)
      const { data: summaryRows, error: summaryErr } = await supabase
        .from('campaign_worker_unit_membership_summary')
        .select('worker_id, is_multi_unit_member')
        .eq('campaign_id', campaignId)
        .in('worker_id', workerIdsAfterFilters)
      if (summaryErr) throw summaryErr
      const multiSet = new Set(
        (summaryRows ?? [])
          .filter((row) => row.is_multi_unit_member)
          .map((row) => row.worker_id),
      )
      workers = workers.filter((w) => multiSet.has(w.worker_id))
    }

    if (selectedWorkerIds?.length) {
      const allow = new Set(selectedWorkerIds)
      workers = workers.filter((w) => allow.has(w.worker_id))
    }

    if (workers.length === 0) {
      return NextResponse.json({ error: 'No workers match the filters' }, { status: 400 })
    }

    const anClient = getAnClient()

    const dateStr = new Date().toISOString().slice(0, 10)
    const randomSuffix = generateRandomSuffix()
    const finalTagName = tag_name || `${campaign?.name || `Campaign ${campaignId}`} - ${dateStr} - ${randomSuffix}`

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
    const workerResults: Array<{ worker_id: number; name: string; status: 'tagged' | 'created' | 'skipped' | 'error'; detail?: string }> = []

    for (const worker of workers) {
      const fullName = `${worker.first_name} ${worker.last_name}`
      try {
        if (!worker.email) {
          contactsSkipped++
          workerResults.push({ worker_id: worker.worker_id, name: fullName, status: 'skipped', detail: 'No email' })
          continue
        }

        const anPerson = syncWorkerToActionNetwork({
          first_name: worker.first_name,
          last_name: worker.last_name,
          email: worker.email,
          phone: worker.phone,
          employer_name: worker.employer_name ?? undefined,
          worksite_name: worker.worksite_name ?? undefined,
          occupation: worker.occupation,
        })

        // Atomic upsert + tag in a single AN call. Tags are matched by name
        // against the tag we created above (idempotent by name on AN's side).
        const signupResult = await anClient.signupPerson(anPerson, {
          add_tags: [finalTagName],
        })

        const personHref =
          (signupResult as Record<string, Record<string, { href: string }>>)?._links?.self?.href ?? ''
        let anId = personHref.split('/').pop() || ''

        // Defensive: if the helper response shape was unexpected, look the
        // person up by email so we still capture the AN id and confirm the
        // record exists.
        if (!anId) {
          try {
            const found = await anClient.findPersonByEmail(worker.email)
            const fallbackHref =
              (found as Record<string, Record<string, { href: string }>> | null)?._links?.self?.href ?? ''
            anId = fallbackHref.split('/').pop() || ''
          } catch {
            // Fall through to the no-id branch below.
          }
        }

        if (!anId) {
          contactsSkipped++
          workerResults.push({
            worker_id: worker.worker_id,
            name: fullName,
            status: 'skipped',
            detail: 'No AN ID returned from signup helper or email lookup',
          })
          continue
        }

        const wasNew = !worker.action_network_id
        if (wasNew) {
          await supabase
            .from('workers')
            .update({ action_network_id: anId })
            .eq('worker_id', worker.worker_id)
          contactsCreated++
        } else {
          contactsTagged++
        }

        await supabase.from('worker_an_tags').upsert(
          {
            worker_id: worker.worker_id,
            an_tag_id: tagId,
            an_tag_name: finalTagName,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: 'worker_id,an_tag_id' },
        )

        workerResults.push({
          worker_id: worker.worker_id,
          name: fullName,
          status: wasNew ? 'created' : 'tagged',
          detail: `AN ID: ${anId}`,
        })

        // Record the send in the engagement log if a draft is associated.
        if (draft_id) {
          void recordEmailSend({
            draftId: draft_id,
            campaignId,
            workerId: worker.worker_id,
            recipientEmail: worker.email!,
            sendMethod: 'action_network',
            userId: user.id,
          }).then(() => tagWorkerEmailed(worker.worker_id))
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        contactsSkipped++
        errors.push(`Worker ${worker.worker_id} (${worker.email}): ${errorMsg}`)
        workerResults.push({ worker_id: worker.worker_id, name: fullName, status: 'error', detail: errorMsg })
        console.error(`Push worker ${worker.worker_id} (${worker.email}):`, errorMsg)
      }
    }

    // Post-push verification: read taggings count from AN. A single GET is
    // enough — the collection's total_records reflects all tagged people on
    // AN's side, regardless of how the tag was populated. Compare with what
    // we believe we pushed to surface silent failures.
    const pushedCount = contactsTagged + contactsCreated
    let verifiedTagCount: number | null = null
    let verificationWarning: string | null = null
    try {
      verifiedTagCount = await anClient.getTaggingCount(tagId)
      if (verifiedTagCount < pushedCount) {
        verificationWarning =
          `Action Network reports ${verifiedTagCount} people on tag "${finalTagName}", ` +
          `but we expected ${pushedCount}. Some recipients may not have been tagged — ` +
          `check the per-worker results below or retry the push.`
      }
    } catch (err) {
      verificationWarning = `Could not verify tag membership in Action Network: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`
    }

    await supabase.from('an_tag_sync_log').insert({
      campaign_id: campaignId,
      an_tag_id: tagId,
      an_tag_name: finalTagName,
      sync_direction: 'push',
      workers_affected: pushedCount,
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
      verified_tag_count: verifiedTagCount,
      verification_warning: verificationWarning,
      errors: errors.length > 0 ? errors : undefined,
      total_workers: workers.length,
      worker_results: workerResults,
    })
  } catch (error) {
    console.error('Push list error:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
