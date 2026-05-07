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
import { SectionSituationSnippetCard } from '@/components/campaigns/section-planning/SectionSituationSnippetCard'
import { WorkforceMappingTable } from '@/components/campaigns/section-planning/WorkforceMappingTable'
import { SectionAmbitionPanel } from '@/components/campaigns/section-planning/SectionAmbitionPanel'
import { SectionWhereToPlayPanel } from '@/components/campaigns/section-planning/SectionWhereToPlayPanel'
import { SectionCapacitiesPanel } from '@/components/campaigns/section-planning/SectionCapacitiesPanel'
import { SectionActivitiesPanel } from '@/components/campaigns/section-planning/SectionActivitiesPanel'
import { SectionTheoryOfWinningPanel } from '@/components/campaigns/section-planning/SectionTheoryOfWinningPanel'
import { SectionSOCPanel } from '@/components/campaigns/section-planning/SectionSOCPanel'
import { StageMappingPanel } from '@/components/campaigns/section-planning/StageMappingPanel'
import { SectionWorkplanGrid } from '@/components/campaigns/section-planning/SectionWorkplanGrid'
import { SectionRevisionHistory } from '@/components/campaigns/section-planning/SectionRevisionHistory'
import { SectionGuidedWizard } from '@/components/campaigns/section-planning/SectionGuidedWizard'
import { Button } from '@/components/ui/button'
import { Wand2 } from 'lucide-react'

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

  const guided = searchParams.get('guided') === '1'
  const setGuided = useCallback(
    (next: boolean) => {
      const p = new URLSearchParams(searchParams.toString())
      if (next) p.set('guided', '1')
      else p.delete('guided')
      router.replace(`${pathname}?${p.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  if (!Number.isFinite(campaignId) || !Number.isFinite(sectionPlanId)) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-destructive">
          Invalid section plan URL.
        </CardContent>
      </Card>
    )
  }

  if (guided) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Guided mode
          </h1>
        </div>
        <SectionGuidedWizard
          sectionPlanId={sectionPlanId}
          campaignId={campaignId}
          onExit={() => setGuided(false)}
        />
      </div>
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
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setGuided(true)}>
            <Wand2 className="h-3.5 w-3.5 mr-1.5" />
            Guided mode
          </Button>
        </div>
        <SectionPlanStepRouter
          step={activeStep}
          sectionPlanId={sectionPlanId}
          campaignId={campaignId}
        />
      </div>
    </SectionPlanShell>
  )
}

interface StepRouterProps {
  step: SectionPlanStep
  sectionPlanId: number
  campaignId: number
}

/**
 * Routes the active step to its panel. Panels arrive phase-by-phase; the
 * remaining placeholder slots show what is still in flight.
 */
function SectionPlanStepRouter({ step, sectionPlanId, campaignId }: StepRouterProps) {
  if (step === 'situation') {
    return <SectionSituationSnippetCard sectionPlanId={sectionPlanId} />
  }
  if (step === 'workforce') {
    return <WorkforceMappingTable sectionPlanId={sectionPlanId} campaignId={campaignId} />
  }
  if (step === 'ambitions') {
    return <SectionAmbitionPanel sectionPlanId={sectionPlanId} />
  }
  if (step === 'where-to-play') {
    return <SectionWhereToPlayPanel sectionPlanId={sectionPlanId} />
  }
  if (step === 'capacities') {
    return <SectionCapacitiesPanel sectionPlanId={sectionPlanId} />
  }
  if (step === 'activities') {
    return <SectionActivitiesPanel sectionPlanId={sectionPlanId} campaignId={campaignId} />
  }
  if (step === 'theory') {
    return <SectionTheoryOfWinningPanel sectionPlanId={sectionPlanId} />
  }
  if (step === 'soc') {
    return <SectionSOCPanel sectionPlanId={sectionPlanId} />
  }
  if (step === 'mapping') {
    return <StageMappingPanel sectionPlanId={sectionPlanId} campaignId={campaignId} />
  }
  if (step === 'workplan') {
    return (
      <div className="space-y-6">
        <SectionWorkplanGrid sectionPlanId={sectionPlanId} />
        <SectionRevisionHistory sectionPlanId={sectionPlanId} />
      </div>
    )
  }

  return null
}
