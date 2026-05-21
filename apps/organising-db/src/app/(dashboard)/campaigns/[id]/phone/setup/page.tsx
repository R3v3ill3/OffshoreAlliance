'use client'

/**
 * Phone-call setup — step 1 of 2 (Pathway picker).
 *
 * Converted from the previous dialog version so the whole orchestrator
 * flow lives in browser history and Back retraces step-by-step.
 *
 * Routes
 *   GET  /campaigns/[id]/phone/setup
 *     → PathwayPicker. "Next" → /phone/setup/order?pathway=X
 *     → Back → /campaigns/[id] (campaign page).
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PathwayPicker } from '@/components/phone/orchestrator/PathwayPicker'
import type { Pathway } from '@/types/phone-call-action'

export default function PhoneSetupPage() {
  const params = useParams()
  const router = useRouter()
  const campaignId = params.id as string

  const [pathway, setPathway] = useState<Pathway | null>(null)

  const backHref = `/campaigns/${campaignId}`

  function handleNext() {
    if (!pathway) return
    router.push(`/campaigns/${campaignId}/phone/setup/order?pathway=${pathway}`)
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Create phone call</h2>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Step 1 of 2 · Pathway
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pick a pathway</CardTitle>
          <CardDescription>
            Pick the kind of phone call you want to set up. You can switch
            via Edit&nbsp;setup later if you change your mind.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PathwayPicker
            value={pathway}
            onChange={setPathway}
            onNext={handleNext}
            onCancel={() => router.push(backHref)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
