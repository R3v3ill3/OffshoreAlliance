'use client'

import { useCallback, useState } from 'react'
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import {
  SectionPlanShell,
  type SectionPlanStep,
} from '@/components/campaigns/section-planning/SectionPlanShell'

const STEP_VALUES: SectionPlanStep[] = [
  'situation',
  'workforce',
  'ambitions',
  'where-to-play',
  'capacities',
  'activities',
  'theory',
  'soc',
  'workplan',
  'mapping',
]

function isStep(v: string | null): v is SectionPlanStep {
  return !!v && (STEP_VALUES as readonly string[]).includes(v)
}

export default function SectionPlanDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const supabase = createClient()

  const campaignId = Number(params.id)
  const sectionPlanId = Number(params.sectionPlanId)

  const rawStep = searchParams.get('step')
  const activeStep: SectionPlanStep = isStep(rawStep) ? rawStep : 'situation'

  const handleStepChange = useCallback(
    (next: SectionPlanStep) => {
      const p = new URLSearchParams(searchParams.toString())
      p.set('step', next)
      router.replace(`${pathname}?${p.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const { data: campaign } = useQuery({
    queryKey: ['campaign', String(campaignId)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('campaign_id, name')
        .eq('campaign_id', campaignId)
        .single()
      if (error) throw error
      return data
    },
    enabled: Number.isFinite(campaignId),
  })

  if (!Number.isFinite(campaignId) || !Number.isFinite(sectionPlanId)) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-destructive">
          Invalid section plan URL.
        </CardContent>
      </Card>
    )
  }

  return (
    <SectionPlanShell
      sectionPlanId={sectionPlanId}
      campaignId={campaignId}
      campaignName={campaign?.name ?? undefined}
      activeStep={activeStep}
      onStepChange={handleStepChange}
    >
      <SectionPlanStepRouter
        step={activeStep}
        sectionPlanId={sectionPlanId}
        campaignId={campaignId}
      />
    </SectionPlanShell>
  )
}

interface StepRouterProps {
  step: SectionPlanStep
  sectionPlanId: number
  campaignId: number
}

/**
 * Routes the active step to its panel. Each panel arrives in a later phase;
 * unfilled steps render a placeholder card. Phase 2 ships the shell only.
 */
function SectionPlanStepRouter({ step }: StepRouterProps) {
  const PLACEHOLDER: Record<SectionPlanStep, string> = {
    situation: 'The situation snippet panel arrives in Phase 3.',
    workforce: 'The workforce mapping table arrives in Phase 3.',
    ambitions: 'The ambition panel wrapper arrives in Phase 3.',
    'where-to-play': 'Where-to-play arrives in Phase 4.',
    capacities: 'Capacities arrive in Phase 4.',
    activities: 'Activities + sequences arrive in Phase 5.',
    theory: 'Theory of Winning arrives in Phase 6.',
    soc: 'Section SOC arrives in Phase 6.',
    workplan: 'Workplan grid arrives in Phase 9.',
    mapping: 'Stage mapping arrives in Phase 8.',
  }

  return (
    <Card>
      <CardContent className="py-8 text-sm text-muted-foreground">
        {PLACEHOLDER[step]}
      </CardContent>
    </Card>
  )
}
