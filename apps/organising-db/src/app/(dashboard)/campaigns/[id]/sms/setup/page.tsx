'use client'

/**
 * SMS setup — step 1 (Pathway picker). First segment under
 * /campaigns/[id]/sms/** (Phase 8, brief §A decision 2). Inherits the
 * campaign header bar and resume banners via isCampaignDetailRoute —
 * no routing changes needed for that.
 *
 * Two entry modes:
 *
 * 1. Header entry (no worker_list_id): no cohort attached. Blast and
 *    Survey both navigate to the Outreach → SMS sub-tab to open their
 *    respective "new" sheets there.
 * 2. Build-list entry (worker_list_id present): the wall-chart Build
 *    List Fire flow already validated the list and ran prepare mode
 *    (no writes). Blast fires immediately from here; Survey carries
 *    the source list through to the survey editor.
 *
 * Chat always renders disabled — it is not reachable from this page.
 */

import { useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ListChecks, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { fetchApi } from '@/lib/api/fetch-api'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SmsPathwayPicker } from '@/components/sms/orchestrator/SmsPathwayPicker'
import { resolveSmsPathwayTarget, type SmsPathway } from '@/lib/sms/pathway-targets'

interface PrepareResponse {
  redirect_to: string
  worker_list_id: number
  total: number
  sendable: number
  opted_out: number
  missing_mobile: number
}

interface FireBlastResponse {
  redirect_to: string
}

interface FireErrorBody {
  error?: string
  already_fired?: { channel?: string }
}

/**
 * Thrown when fire/sms's blast mode 409s because this cohort was
 * already fired to SMS (decision 4) — distinguishes "needs a
 * force-confirm retry" from every other failure so handleNext can
 * offer the retry without a generic error toast in that one case.
 */
class SmsAlreadyFiredError extends Error {}

export default function SmsSetupPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { canWrite } = useAuth()
  const campaignId = params.id as string

  const workerListId = useMemo(() => {
    const raw = searchParams.get('worker_list_id')
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }, [searchParams])

  const [pathway, setPathway] = useState<SmsPathway | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: readiness, isLoading: readinessLoading } = useQuery<PrepareResponse>({
    queryKey: ['sms-fire-prepare', campaignId, workerListId],
    enabled: workerListId != null,
    queryFn: async () => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/worker-lists/${workerListId}/fire/sms`,
        { method: 'POST' },
      )
      if (!res.ok) throw new Error(`Failed to prepare SMS fire: ${res.status}`)
      return (await res.json()) as PrepareResponse
    },
  })

  const fireBlast = useAuthAwareMutation<FireBlastResponse, Error, { force?: boolean }>({
    mutationFn: async ({ force } = {}) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/worker-lists/${workerListId}/fire/sms`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(force ? { pathway: 'blast', force: true } : { pathway: 'blast' }),
        },
      )
      if (!res.ok) {
        const raw = await res.text().catch(() => '')
        let parsedBody: FireErrorBody | null = null
        if (raw) {
          try {
            parsedBody = JSON.parse(raw) as FireErrorBody
          } catch {
            parsedBody = null
          }
        }
        // Prepare mode never 409s (it's write-free), so this can only
        // come from the blast POST — the fire/sms route's per-channel
        // already-fired guard (decision 4).
        if (res.status === 409 && parsedBody?.already_fired?.channel === 'sms') {
          throw new SmsAlreadyFiredError(
            parsedBody.error ?? 'This cohort has already been fired to SMS',
          )
        }
        const message =
          parsedBody?.error ??
          (raw ? `Failed to fire to SMS (${res.status}): ${raw}` : `Failed to fire to SMS (${res.status})`)
        throw new Error(message)
      }
      return (await res.json()) as FireBlastResponse
    },
  })

  const backHref = `/campaigns/${campaignId}`
  const isBuildListEntry = workerListId != null

  async function handleNext() {
    if (!pathway) return
    const target = resolveSmsPathwayTarget({ pathway, campaignId, workerListId })
    if (target.kind === 'unavailable') return
    if (target.kind === 'navigate') {
      router.push(target.href)
      return
    }
    setIsSubmitting(true)
    try {
      const result = await fireBlast.mutateAsync({})
      router.push(result.redirect_to)
    } catch (err) {
      if (err instanceof SmsAlreadyFiredError) {
        // Decision 4: a cohort may be re-fired to the same channel,
        // but only with an explicit confirm — matches the wall-chart
        // build-list panel's confirm-before-refire idiom.
        const confirmed = window.confirm(
          'This cohort has already been fired to SMS. Firing again will create a new blast list for this cohort. Continue?',
        )
        if (confirmed) {
          try {
            const result = await fireBlast.mutateAsync({ force: true })
            router.push(result.redirect_to)
          } catch (retryErr) {
            toast.error(retryErr instanceof Error ? retryErr.message : 'Failed to fire to SMS')
          }
        }
        // Declined: stay on the picker, no navigation and no artifact.
      } else {
        toast.error(err instanceof Error ? err.message : 'Failed to fire to SMS')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!canWrite) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Create SMS</CardTitle>
            <CardDescription>
              You don&apos;t have permission to create SMS outreach for this campaign.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Create SMS</h2>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Step 1 of 1 · Pathway
          </p>
        </div>
      </div>

      {isBuildListEntry && (
        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <ListChecks className="h-4 w-4 flex-shrink-0" />
          <span>
            Worker list <strong>#{workerListId}</strong> is already attached (from
            Build List).
            {readiness != null && (
              <>
                {' '}
                {readiness.sendable} sendable · {readiness.missing_mobile} without a
                mobile · {readiness.opted_out} opted out
              </>
            )}
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pick a pathway</CardTitle>
          <CardDescription>
            Pick how you want to reach this cohort by SMS. You can switch pathway
            later from the Outreach tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {readinessLoading && isBuildListEntry ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading cohort…</span>
            </div>
          ) : (
            <SmsPathwayPicker
              value={pathway}
              onChange={setPathway}
              onNext={handleNext}
              onCancel={() => router.push(backHref)}
              isSubmitting={isSubmitting}
              nextLabel={isBuildListEntry ? 'Continue' : 'Next'}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
