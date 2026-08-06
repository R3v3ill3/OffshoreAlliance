import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ActionNetworkClient } from '@/lib/api/action-network'
import { syncWorkerToActionNetwork } from '@/lib/api/action-network'
import { getAnClient as getSharedAnClient, AN_NOT_CONFIGURED_ERROR } from '@/lib/api/an-client'

function getAnClient(): ActionNetworkClient {
  const client = getSharedAnClient()
  if (!client) throw new Error(AN_NOT_CONFIGURED_ERROR)
  return client
}

function generateRandomSuffix(length: number = 3): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { employer_id, worksite_id, tag_name, worker_ids } = body as {
      employer_id?: number
      worksite_id?: number
      tag_name?: string
      worker_ids?: number[]
    }

    let query = supabase
      .from('workers')
      .select(`
        worker_id, first_name, last_name, email, phone, occupation,
        employer_id, worksite_id, action_network_id,
        employers ( employer_name ),
        worksites ( worksite_name )
      `)

    if (worker_ids?.length) {
      query = query.in('worker_id', worker_ids)
    } else {
      if (employer_id) {
        query = query.eq('employer_id', employer_id)
      }
      if (worksite_id) {
        query = query.eq('worksite_id', worksite_id)
      }
    }

    query = query.not('email', 'is', null)

    const { data: workers, error: wErr } = await query
    if (wErr) throw wErr

    if (!workers || workers.length === 0) {
      return NextResponse.json({ error: 'No workers match the filters' }, { status: 400 })
    }

    const anClient = getAnClient()

    const dateStr = new Date().toISOString().slice(0, 10)
    const firstEmp = (workers[0] as Record<string, unknown>).employers
    const empName = firstEmp
      ? (Array.isArray(firstEmp) ? (firstEmp as { employer_name: string }[])[0]?.employer_name : (firstEmp as { employer_name: string }).employer_name) ?? 'Standalone'
      : 'Standalone'
    const randomSuffix = generateRandomSuffix()
    const finalTagName = tag_name || `${empName} - ${dateStr} - ${randomSuffix}`

    const t0 = Date.now()
    const timings: Record<string, number> = {}

    const tCreate = Date.now()
    const tagResponse = await anClient.createTag(finalTagName)
    timings.createTag_ms = Date.now() - tCreate
    const tagHref = (tagResponse as Record<string, Record<string, { href: string }>>)?._links?.self?.href ?? ''
    const tagId = tagHref.split('/').pop() || ''
    const tagBrowserUrl = (tagResponse?.browser_url ?? '') as string

    if (!tagId) {
      return NextResponse.json({ error: 'Failed to create tag in Action Network' }, { status: 500 })
    }

    // Fail-fast: if the tag we just created can't be retrieved, the API key
    // is almost certainly a personal key (Tags resource is group-only on AN).
    let tagBrowserUrlVerified = tagBrowserUrl
    try {
      const tGet = Date.now()
      const tagDetail = await anClient.getTag(tagId)
      timings.getTag_ms = Date.now() - tGet
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
    let writeConfirmedCount = 0
    let tagFailures = 0
    const workerErrors: Array<{ worker_id: number; name: string; email: string | null; error: string }> = []
    const workerResults: Array<{ worker_id: number; name: string; status: 'tagged' | 'created' | 'skipped' | 'error'; detail?: string; tag_method?: 'helper' | 'explicit' | 'both' | 'none'; an_id?: string; write_confirmed?: boolean }> = []
    const tLoop = Date.now()

    for (const row of workers) {
      const raw = row as Record<string, unknown>
      const empRel = raw.employers as { employer_name: string } | { employer_name: string }[] | null
      const wsRel = raw.worksites as { worksite_name: string } | { worksite_name: string }[] | null
      const w = {
        worker_id: raw.worker_id as number,
        first_name: raw.first_name as string,
        last_name: raw.last_name as string,
        email: raw.email as string | null,
        phone: raw.phone as string | null,
        occupation: raw.occupation as string | null,
        action_network_id: raw.action_network_id as string | null,
        employer_name: Array.isArray(empRel) ? empRel[0]?.employer_name ?? null : empRel?.employer_name ?? null,
        worksite_name: Array.isArray(wsRel) ? wsRel[0]?.worksite_name ?? null : wsRel?.worksite_name ?? null,
      }
      const fullName = `${w.first_name} ${w.last_name}`

      try {
        if (!w.email) {
          contactsSkipped++
          workerResults.push({ worker_id: w.worker_id, name: fullName, status: 'skipped', detail: 'No email address' })
          continue
        }

        const anPerson = syncWorkerToActionNetwork({
          first_name: w.first_name,
          last_name: w.last_name,
          email: w.email,
          phone: w.phone,
          employer_name: w.employer_name ?? undefined,
          worksite_name: w.worksite_name ?? undefined,
          occupation: w.occupation,
        })

        // Step 1: Person Signup Helper — atomic upsert + best-effort tag.
        // We don't trust `add_tags` to actually apply (helper silently
        // drops names it can't resolve), but it's the canonical upsert.
        const signupResult = await anClient.signupPerson(anPerson, {
          add_tags: [finalTagName],
        })

        // Diagnostic: did the helper actually apply our tag? Inspect the
        // returned `_embedded["osdi:taggings"]` for our tag id.
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
            const found = await anClient.findPersonByEmail(w.email)
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
            worker_id: w.worker_id,
            name: fullName,
            status: 'skipped',
            detail: 'No AN ID returned from signup helper or email lookup',
            tag_method: 'none',
          })
          continue
        }

        // Step 2: Insurance policy — explicit POST /tags/{id}/taggings using
        // canonical URLs. Idempotent on (person, tag). We trust the response
        // body (tagging resource with `_links.osdi:tag` pointing at our tag)
        // as authoritative, server-confirmed proof of the write.
        let explicitTagApplied = false
        let explicitTagWriteConfirmed = false
        let explicitTagError: string | null = null
        try {
          const tagging = await anClient.addTaggingByPersonId(tagId, anId)
          explicitTagApplied = true
          const taggingTagHref =
            (tagging as Record<string, Record<string, { href: string }>>)?._links?.['osdi:tag']?.href ?? ''
          if (taggingTagHref.endsWith(`/tags/${tagId}`)) {
            explicitTagWriteConfirmed = true
          } else {
            console.warn(
              `[push-standalone] tagging response references unexpected tag (expected ${tagId}, got ${taggingTagHref}) for worker=${w.worker_id}`,
            )
          }
        } catch (tagErr) {
          explicitTagError = tagErr instanceof Error ? tagErr.message : 'Unknown error'
          console.error(
            `[push-standalone] explicit tagging failed worker=${w.worker_id} an=${anId}:`,
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
          tagFailures++
          contactsSkipped++
          workerErrors.push({
            worker_id: w.worker_id,
            name: fullName,
            email: w.email,
            error: `Person upserted (${anId}) but tag NOT applied: ${
              explicitTagError ?? 'helper dropped add_tags and explicit tagging also failed'
            }`,
          })
          workerResults.push({
            worker_id: w.worker_id,
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

        const wasNew = !w.action_network_id
        if (wasNew) {
          await supabase
            .from('workers')
            .update({ action_network_id: anId })
            .eq('worker_id', w.worker_id)
          contactsCreated++
        } else {
          contactsTagged++
        }

        workerResults.push({
          worker_id: w.worker_id,
          name: fullName,
          status: wasNew ? 'created' : 'tagged',
          detail: `AN ID: ${anId} · tag via ${tagMethod}${explicitTagWriteConfirmed ? ' · write confirmed' : ''}`,
          tag_method: tagMethod,
          an_id: anId,
          write_confirmed: explicitTagWriteConfirmed || helperAppliedTag,
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        contactsSkipped++
        workerErrors.push({ worker_id: w.worker_id, name: fullName, email: w.email, error: errorMsg })
        workerResults.push({ worker_id: w.worker_id, name: fullName, status: 'error', detail: errorMsg })
        console.error(`Push worker ${w.worker_id} (${w.email}):`, errorMsg)
      }
    }

    timings.workerLoop_ms = Date.now() - tLoop

    if (workerErrors.length > 0) {
      console.error(`Push-standalone: ${workerErrors.length} errors out of ${workers.length} workers:`,
        JSON.stringify(workerErrors.slice(0, 5)))
    }

    // Two-layer verification:
    //   1. write_confirmed_count — server-side write acknowledgement,
    //      collected from each addTaggingByPersonId response.
    //   2. read-back via getTaggingsDetailed — subject to AN read-replica
    //      lag, retried after ~3s when the immediate read disagrees with
    //      the write count.
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
        if ((verifiedTagCountAfterDelay ?? 0) > (verifiedTagCount ?? 0)) {
          verifiedTagCount = verifiedTagCountAfterDelay
        }
      }

      if (writeConfirmedCount < pushedCount) {
        verificationWarning =
          `Action Network only confirmed ${writeConfirmedCount} of ${pushedCount} tagging writes. ` +
          `Some recipients may not have been tagged — check the per-worker results.`
      } else if ((verifiedTagCount ?? 0) < writeConfirmedCount) {
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

    timings.total_ms = Date.now() - t0
    if (timings.total_ms > 25000) {
      console.warn(`[push-standalone] slow push: ${timings.total_ms}ms total`, timings)
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
      write_confirmed_count: writeConfirmedCount,
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
      total_workers: workers.length,
      errors: workerErrors.length > 0 ? workerErrors : undefined,
      worker_results: workerResults,
    })
  } catch (error) {
    console.error('Standalone push-list error:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
