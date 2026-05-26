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

    const tagResponse = await anClient.createTag(finalTagName)
    const tagHref = (tagResponse as Record<string, Record<string, { href: string }>>)?._links?.self?.href ?? ''
    const tagId = tagHref.split('/').pop() || ''

    if (!tagId) {
      return NextResponse.json({ error: 'Failed to create tag in Action Network' }, { status: 500 })
    }

    let contactsTagged = 0
    let contactsCreated = 0
    let contactsSkipped = 0
    const workerErrors: Array<{ worker_id: number; name: string; email: string | null; error: string }> = []
    const workerResults: Array<{ worker_id: number; name: string; status: 'tagged' | 'created' | 'skipped' | 'error'; detail?: string }> = []

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

        // Atomic upsert + tag in a single AN call (Person Signup Helper).
        // Tags matched by name against the tag we created above.
        const signupResult = await anClient.signupPerson(anPerson, {
          add_tags: [finalTagName],
        })

        const personHref =
          (signupResult as Record<string, Record<string, { href: string }>>)?._links?.self?.href ?? ''
        let anId = personHref.split('/').pop() || ''

        // Defensive fallback: look up by email if the helper response shape
        // is unexpected (e.g. background-processed responses).
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
          detail: `AN ID: ${anId}`,
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        contactsSkipped++
        workerErrors.push({ worker_id: w.worker_id, name: fullName, email: w.email, error: errorMsg })
        workerResults.push({ worker_id: w.worker_id, name: fullName, status: 'error', detail: errorMsg })
        console.error(`Push worker ${w.worker_id} (${w.email}):`, errorMsg)
      }
    }

    if (workerErrors.length > 0) {
      console.error(`Push-standalone: ${workerErrors.length} errors out of ${workers.length} workers:`,
        JSON.stringify(workerErrors.slice(0, 5)))
    }

    // Post-push verification — single GET against AN to confirm what
    // actually landed on the tag, vs. what we believe we pushed.
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
