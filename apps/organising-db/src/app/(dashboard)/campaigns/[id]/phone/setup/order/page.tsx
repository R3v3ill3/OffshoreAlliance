'use client'

/**
 * Phone-call setup — step 2 of 2 (Order picker).
 *
 * Reads the chosen pathway from ?pathway=. On Confirm:
 *   1. Inserts a phone_call_actions row (status='in_progress'),
 *   2. Resolves the first pathway component URL,
 *   3. Navigates to it with returnTo=<this page> so Back retraces here,
 *   4. From here Back goes to /phone/setup (pathway picker),
 *   5. From /phone/setup Back goes to the campaign page.
 *
 * Mirrors the previous orchestrator dialog's behaviour but as a real
 * route so browser history + the user's Back muscle memory both work.
 */

import { useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { OrderPicker } from '@/components/phone/orchestrator/OrderPicker'
import {
  entryBranchFor,
  type Order,
  type Pathway,
} from '@/types/phone-call-action'

function isPathway(value: string | null): value is Pathway {
  return value === 'script' || value === 'assessment_only'
}

export default function PhoneSetupOrderPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const supabase = createClient()
  const campaignId = params.id as string

  const pathway = useMemo<Pathway | null>(() => {
    const raw = searchParams.get('pathway')
    return isPathway(raw) ? raw : null
  }, [searchParams])

  const [order, setOrder] = useState<Order | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const backHref = `/campaigns/${campaignId}/phone/setup`

  async function handleConfirm() {
    if (!pathway || !order) return
    if (!user) {
      toast.error('You must be signed in to create a phone call action.')
      return
    }
    setIsSubmitting(true)
    try {
      const entryBranch = entryBranchFor(pathway, order)

      const { data, error } = await supabase
        .from('phone_call_actions')
        .insert({
          campaign_id: Number(campaignId),
          created_by: user.id,
          variation_count: 1,
          variation_dimension: 'none' as const,
          entry_branch: entryBranch,
          status: 'in_progress' as const,
          selected_assessment_ids: [] as number[],
        })
        .select('action_id')
        .single()
      if (error) throw error
      const actionId = data!.action_id

      toast.success('Phone call action created')

      // returnTo points back to THIS order-picker page so the first
      // pathway component's Back retraces a real route, not the
      // campaign overview.
      const here = encodeURIComponent(
        `/campaigns/${campaignId}/phone/setup/order?pathway=${pathway}`,
      )

      let firstStepHref = ''
      if (pathway === 'script') {
        firstStepHref =
          order === 'setup_first'
            ? `/campaigns/phone-wizard?campaign_id=${campaignId}&action_id=${actionId}&returnTo=${here}`
            : `/campaigns/${campaignId}/phone/lists/new?action_id=${actionId}&returnTo=${here}`
      } else {
        firstStepHref =
          order === 'setup_first'
            ? `/campaigns/${campaignId}/phone/assessment-setup?action_id=${actionId}&returnTo=${here}`
            : `/campaigns/${campaignId}/phone/lists/new?action_id=${actionId}&pathway=assessment_only&returnTo=${here}`
      }

      router.push(firstStepHref)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Failed to create phone call action: ${err.message}`
          : 'Failed to create phone call action',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!pathway) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No pathway selected. Use the Back button or restart from
            &ldquo;Create Phone Call&rdquo;.
          </CardContent>
        </Card>
      </div>
    )
  }

  const pathwayLabel = pathway === 'script' ? 'Script + ratings' : 'Assessment-only'

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Choose where to start</h2>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Step 2 of 2 · {pathwayLabel}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Order</CardTitle>
          <CardDescription>
            Choose which component to set up first. Either order ends at the
            same dialler.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrderPicker
            pathway={pathway}
            value={order}
            onChange={setOrder}
            onConfirm={handleConfirm}
            onBack={() => router.push(backHref)}
            isSubmitting={isSubmitting}
          />
        </CardContent>
      </Card>
    </div>
  )
}
