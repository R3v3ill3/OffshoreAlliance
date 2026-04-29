'use client'

/**
 * Inline launch card for the SOC wizard, shown in CapacitiesPanel when a
 * "Structured Organising Conversation" capacity is identified for the
 * stage. Lists existing SOC sessions for this scope and offers a button
 * to launch a new session pre-loaded with the campaign's context.
 */

import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sparkles, MessageCircle, ArrowRight } from 'lucide-react'
import { useSocSessionsForCapacity } from '@/lib/hooks/useSocWizard'
import type { PlanCapacity } from '@/types/planner-types'

interface Props {
  capacity: PlanCapacity & {
    capacity_options?: { option_text: string; category: string } | null
  }
  campaignId: number
  planId: number
  stageNumber: number
}

export function SocWizardLaunchCard({ capacity, campaignId, stageNumber }: Props) {
  const router = useRouter()
  const sessions = useSocSessionsForCapacity({
    campaign_id: campaignId,
    stage_number: stageNumber,
    capacity_id: capacity.capacity_id,
  })

  function launch() {
    const sp = new URLSearchParams({
      campaign_id: String(campaignId),
      stage_number: String(stageNumber),
      capacity_id: String(capacity.capacity_id),
    })
    router.push(`/campaigns/soc-wizard?${sp.toString()}`)
  }
  function open(sessionId: number) {
    router.push(`/campaigns/soc-wizard?session_id=${sessionId}`)
  }

  const list = sessions.data ?? []

  return (
    <Card className="border-slate-200">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-slate-900 inline-flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4 text-slate-500" />
              {capacity.capacity_options?.option_text ?? capacity.custom_text ?? 'Structured Organising Conversation'}
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Coach-guided 8-stage SOC. The wizard pre-loads campaign context, walks you through each stage with AI coaching, then lets you export to phone, email, or SMS.
            </p>
          </div>
          <Button size="sm" onClick={launch}>
            <Sparkles className="h-4 w-4" />
            Launch SOC Wizard
          </Button>
        </div>

        {list.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">
              Existing sessions ({list.length})
            </div>
            {list.map((s) => (
              <button
                key={s.session_id}
                onClick={() => open(s.session_id)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-slate-50 text-left"
              >
                <span className="truncate text-slate-800">{s.title}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary" className="text-[10px]">
                    {s.status}
                  </Badge>
                  <ArrowRight className="h-3 w-3 text-slate-400" />
                </span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
