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

    const t0 = Date.now()
    const timings: Record<string, number> = {}

    const tCreate = Date.now()
    const tagResponse = await anClient.createTag(finalTagName)
    timings.createTag_ms = Date.now() - tCreate

    const tagHref = (tagResponse as Record<string, unknown>)?._links
      ? ((tagResponse as Record<string, Record<string, { href: string }>>)._links.self?.href ?? '')
      : ''
    const tagId = tagHref.split('/').pop() || ''
    // browser_url is AN's UI link to the tag's edit page — useful for
    // proving to the user that the tag they're looking at in the AN UI
    // is the same one our API key wrote to. Falls through to '' if not
    // present (older AN responses didn't always include it).
    const tagBrowserUrl = (tagResponse?.browser_url ?? '') as string

    if (!tagId) {
      return NextResponse.json({ error: 'Failed to create tag in Action Network' }, { status: 500 })
    }

    // Fail-fast: confirm the tag we just created is actually addressable.
    // If this 404s, the API key likely isn't a group-level key — AN's
    // Tags resource is group-only — and no tagging will ever succeed.
    let tagBrowserUrlVerified = tagBrowserUrl
    try {
      const tGet = Date.now()
      const tagDetail = await anClient.getTag(tagId)
      timings.getTag_ms = Date.now() - tGet
      // Prefer browser_url from the GET (more authoritative than the POST
      // response) but fall back to the create response.
      if (tagDetail?.browser_url) tagBrowserUrlVerified = tagDetail.browser_url
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json(
        {
          error:
            `Tag was created (id: ${tagId}) but could not be retrieved from Action Network. ` +
            `This usually means ACTION_NETWORK_API_KEY is a personal API key — Tags are only ` +
            `available with group-level keys. Generate a group key under AN's "Start Organizing > ` +
            `Details > API & Sync" and replace the env var.`,
          detail,
          tag_id: tagId,
          tag_href: tagHref,
        },
        { status: 500 },
      )
    }

    let contactsTagged = 0
    let contactsCreated = 0
    let contactsSkipped = 0
    let helperTagApplied = 0
    let fallbackTagApplied = 0
    let writeConfirmedCount = 0 // AN returned a tagging resource confirming the write
    let tagFailures = 0
    const errors: string[] = []
    const workerResults: Array<{ worker_id: number; name: string; status: 'tagged' | 'created' | 'skipped' | 'error'; detail?: string; tag_method?: 'helper' | 'explicit' | 'both' | 'none'; an_id?: string; write_confirmed?: boolean }> = []

    const tLoop = Date.now()
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

        // Step 1: Atomic upsert + (best-effort) tag via Person Signup Helper.
        // The helper matches `add_tags` by NAME and silently drops names it
        // can't resolve — we still call it because it's the canonical upsert
        // path, but we don't trust it to actually apply the tag.
        const signupResult = await anClient.signupPerson(anPerson, {
          add_tags: [finalTagName],
        })

        // Diagnostic: did the helper actually apply our tag? On success the
        // response has `_embedded["osdi:taggings"]` listing the taggings it
        // created; absence of our tag id in that list means AN silently
        // dropped the `add_tags` request.
        const embeddedTaggings = ((signupResult as Record<string, Record<string, unknown[]>>)
          ?._embedded?.['osdi:taggings'] ?? []) as Array<Record<string, unknown>>
        const helperAppliedTag = embeddedTaggings.some((t) => {
          const tagLinkHref =
            ((t as Record<string, Record<string, { href: string }>>)?._links?.['osdi:tag']?.href) ?? ''
          return tagLinkHref.endsWith(`/tags/${tagId}`)
        })

        const personHref =
          (signupResult as Record<string, Record<string, { href: string }>>)?._links?.self?.href ?? ''
        let anId = personHref.split('/').pop() || ''

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
            tag_method: 'none',
          })
          continue
        }

        // Step 2: Insurance policy. POST /tags/{id}/taggings with the
        // canonical person URL — no name lookup, idempotent on (person, tag).
        // We don't just throw away the response: AN returns the tagging
        // resource with `_links.osdi:tag.href` pointing back at our tag,
        // which is server-side proof the write was committed. We trust
        // this over the subsequent read-back (AN has visible eventual
        // consistency between the write primary and the read replicas).
        let explicitTagApplied = false
        let explicitTagWriteConfirmed = false
        let explicitTagError: string | null = null
        try {
          const tagging = await anClient.addTaggingByPersonId(tagId, anId)
          explicitTagApplied = true
          const taggingTagHref =
            (tagging as Record<string, Record<string, { href: string }>>)?._links?.['osdi:tag']?.href ?? ''
          // Confirm the response references our tag — guards against AN
          // accepting the write but routing it to a different tag at the
          // same name (the cross-group-scope hazard).
          if (taggingTagHref.endsWith(`/tags/${tagId}`)) {
            explicitTagWriteConfirmed = true
          } else {
            console.warn(
              `[push-list] tagging response references unexpected tag (expected ${tagId}, got ${taggingTagHref}) for worker=${worker.worker_id}`,
            )
          }
        } catch (tagErr) {
          explicitTagError = tagErr instanceof Error ? tagErr.message : 'Unknown error'
          console.error(
            `[push-list] explicit tagging failed worker=${worker.worker_id} an=${anId}:`,
            explicitTagError,
          )
        }

        const tagApplied = helperAppliedTag || explicitTagApplied
        const tagMethod: 'helper' | 'explicit' | 'both' | 'none' =
          helperAppliedTag && explicitTagApplied
            ? 'both'
            : helperAppliedTag
              ? 'helper'
              : explicitTagApplied
                ? 'explicit'
                : 'none'

        if (helperAppliedTag) helperTagApplied++
        if (explicitTagApplied) fallbackTagApplied++
        if (explicitTagWriteConfirmed || helperAppliedTag) writeConfirmedCount++

        if (!tagApplied) {
          // Person upserted but BOTH tagging paths failed — surface as error.
          tagFailures++
          contactsSkipped++
          errors.push(
            `Worker ${worker.worker_id} (${worker.email}): person upserted (${anId}) but tagging failed: ${
              explicitTagError ?? 'helper silently ignored add_tags and explicit POST also failed'
            }`,
          )
          workerResults.push({
            worker_id: worker.worker_id,
            name: fullName,
            status: 'error',
            detail: `Person upserted (AN ID: ${anId}) but tag was NOT applied: ${
              explicitTagError ?? 'helper dropped add_tags and explicit tagging also failed'
            }`,
            tag_method: 'none',
            an_id: anId,
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
          detail: `AN ID: ${anId} · tag via ${tagMethod}${explicitTagWriteConfirmed ? ' · write confirmed' : ''}`,
          tag_method: tagMethod,
          an_id: anId,
          write_confirmed: explicitTagWriteConfirmed || helperAppliedTag,
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

    timings.workerLoop_ms = Date.now() - tLoop

    // Post-push verification has two layers:
    //   1. Write-confirmation count (`writeConfirmedCount`) — collected
    //      synchronously from each addTaggingByPersonId response. This
    //      is what AN's primary acknowledged. AUTHORITATIVE.
    //   2. Read-back via GET /tags/{id}/taggings — depends on AN's read
    //      replicas, which lag the primary by seconds-to-minutes. We
    //      retry after a brief delay to expose the lag clearly when it
    //      occurs.
    const pushedCount = contactsTagged + contactsCreated
    const pushedAnIds = workerResults
      .filter((r) => r.status === 'tagged' || r.status === 'created')
      .map((r) => r.an_id ?? '')
      .filter(Boolean)

    let verifiedTagCount: number | null = null
    let verifiedTagCountAfterDelay: number | null = null
    let verifiedPersonHrefs: string[] = []
    let verifiedMatchingPushed = 0
    let verificationWarning: string | null = null
    try {
      const tVerify = Date.now()
      const detailed = await anClient.getTaggingsDetailed(tagId)
      timings.verify_ms = Date.now() - tVerify
      verifiedTagCount = detailed.total
      verifiedPersonHrefs = detailed.person_hrefs
      verifiedMatchingPushed = pushedAnIds.filter((id) =>
        verifiedPersonHrefs.some((h) => h.endsWith(`/people/${id}`)),
      ).length

      // Read replicas can lag the write primary on AN. If the immediate
      // read shows fewer people than we wrote, give it ~3s and re-read
      // before deciding whether to warn the user.
      if (verifiedTagCount < writeConfirmedCount) {
        await new Promise((r) => setTimeout(r, 3000))
        const tVerify2 = Date.now()
        const retry = await anClient.getTaggingsDetailed(tagId)
        timings.verify_retry_ms = Date.now() - tVerify2
        verifiedTagCountAfterDelay = retry.total
        verifiedPersonHrefs = retry.person_hrefs
        verifiedMatchingPushed = pushedAnIds.filter((id) =>
          verifiedPersonHrefs.some((h) => h.endsWith(`/people/${id}`)),
        ).length
        // After the retry, prefer the higher count as the user-visible value.
        if ((verifiedTagCountAfterDelay ?? 0) > (verifiedTagCount ?? 0)) {
          verifiedTagCount = verifiedTagCountAfterDelay
        }
      }

      // Decision tree for the warning:
      //   a) Write was server-confirmed AND read agrees → success
      //   b) Write was server-confirmed but read still lags → "info, not error"
      //   c) Write was NOT confirmed for some workers → real failure
      //   d) Read shows non-zero but the SPECIFIC people we pushed aren't
      //      on it → cross-scope duplicate tag
      if (writeConfirmedCount < pushedCount) {
        verificationWarning =
          `Action Network only confirmed ${writeConfirmedCount} of ${pushedCount} tagging writes. ` +
          `Some recipients may not have been tagged — check the per-worker results.`
      } else if ((verifiedTagCount ?? 0) < writeConfirmedCount) {
        // Server confirmed all writes but the read still lags — this is
        // the AN read-replica delay. Surface as a soft notice.
        verificationWarning =
          `Action Network confirmed all ${writeConfirmedCount} tagging writes, but its read API ` +
          `still reports ${verifiedTagCount ?? 0}. This is normal eventual-consistency lag — the ` +
          `tag will populate in the AN UI within 1–2 minutes. ${
            tagBrowserUrlVerified ? `Open it directly: ${tagBrowserUrlVerified}` : ''
          }`
      } else if (pushedAnIds.length > 0 && verifiedMatchingPushed < pushedAnIds.length) {
        verificationWarning =
          `Action Network reports ${verifiedTagCount} people on tag "${finalTagName}" but only ` +
          `${verifiedMatchingPushed} of the ${pushedAnIds.length} people we pushed are actually on it. ` +
          `This usually means a tag with the same name exists at a different group/scope — check ` +
          `that ACTION_NETWORK_API_KEY belongs to the group you're viewing in the AN UI.`
      }
    } catch (err) {
      verificationWarning = `Could not verify tag membership in Action Network: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`
    }

    // AN read-replica warm-up. Production observation: querying
    // /people/{id}/taggings on freshly-tagged people nudges AN's
    // tag-detail index to refresh — the activist count in the AN UI
    // catches up faster than without this. Fire-and-forget; the push
    // is already complete by the time we hit this.
    const samplePeople = pushedAnIds.slice(0, 3)
    try {
      await Promise.allSettled(
        samplePeople.map((id) => anClient.getPersonTags(id)),
      )
    } catch {
      // Never fail the push because of warm-up.
    }

    timings.total_ms = Date.now() - t0
    if (timings.total_ms > 25000) {
      console.warn(`[push-list] slow push: ${timings.total_ms}ms total`, timings)
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
      tag_browser_url: tagBrowserUrlVerified || null,
      tag_name: finalTagName,
      contacts_tagged: contactsTagged,
      contacts_created: contactsCreated,
      contacts_skipped: contactsSkipped,
      // AN's write primary acknowledged this many taggings. Authoritative.
      write_confirmed_count: writeConfirmedCount,
      // AN's read API returned this many. Subject to read-replica lag.
      verified_tag_count: verifiedTagCount,
      verified_tag_count_after_delay: verifiedTagCountAfterDelay,
      verified_matching_pushed: verifiedMatchingPushed,
      verified_person_hrefs: verifiedPersonHrefs,
      verification_warning: verificationWarning,
      tag_method_stats: {
        helper_applied: helperTagApplied,
        explicit_fallback_applied: fallbackTagApplied,
        both_paths_failed: tagFailures,
      },
      timings_ms: timings,
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
