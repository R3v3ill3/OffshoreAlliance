'use client'

/**
 * /campaigns/[id]/bargaining
 *
 * Bargaining Hub — stub for Wave 6.
 * Wave 6 will replace this file with the full hub UI:
 *   stage planner (reuses Phase 1 panels), decisions, PABO, actions, votes.
 */

import { useParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Scale } from 'lucide-react'

export default function BargainingHubPage() {
  const params = useParams()
  const campaignId = Number(params.id as string)

  return (
    <div className="max-w-3xl mx-auto py-8">
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <Scale className="h-8 w-8 text-slate-400 mx-auto" />
          <h2 className="text-lg font-semibold text-slate-800">Bargaining Hub</h2>
          <p className="text-sm text-slate-600">
            Coming in Wave 6 — full bargaining hub for campaign{' '}
            <span className="font-medium">#{campaignId}</span>. This will
            include the stage planner (stages 7–11), decision-point management,
            PABO applications, protected industrial actions, and member
            endorsement votes.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
