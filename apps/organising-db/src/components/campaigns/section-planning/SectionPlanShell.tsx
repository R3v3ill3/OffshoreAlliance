'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/lib/supabase/auth-context'
import { useSectionPlan } from '@/lib/hooks/useSectionPlans'
import {
  SECTION_PLAN_STATUS_LABELS,
  type SectionPlanRow,
} from '@/types/section-planning'
import { TimeframeBanner } from './TimeframeBanner'
import { SectionPlanProvider } from './SectionPlanContext'
import { EditSectionPlanDialog } from './EditSectionPlanDialog'

export type SectionPlanStep =
  | 'situation'
  | 'workforce'
  | 'ambitions'
  | 'where-to-play'
  | 'capacities'
  | 'activities'
  | 'theory'
  | 'soc'
  | 'workplan'
  | 'mapping'

const STEPS: Array<{ key: SectionPlanStep; label: string }> = [
  { key: 'situation', label: 'Situation' },
  { key: 'workforce', label: 'Workforce mapping' },
  { key: 'ambitions', label: 'Ambitions' },
  { key: 'where-to-play', label: 'Where to play' },
  { key: 'capacities', label: 'Capacities' },
  { key: 'activities', label: 'Activities' },
  { key: 'theory', label: 'Theory of winning' },
  { key: 'soc', label: 'Conversations (SOC)' },
  { key: 'workplan', label: 'Workplan' },
  { key: 'mapping', label: 'Stage mapping' },
]

interface SectionPlanShellProps {
  sectionPlanId: number
  campaignId: number
  campaignName?: string
  activeStep: SectionPlanStep
  onStepChange: (step: SectionPlanStep) => void
  children: React.ReactNode
}

export function SectionPlanShell({
  sectionPlanId,
  campaignId,
  campaignName,
  activeStep,
  onStepChange,
  children,
}: SectionPlanShellProps) {
  const { canWrite } = useAuth()
  const { data: sectionPlan, isLoading, error } = useSectionPlan(sectionPlanId)
  const [editOpen, setEditOpen] = useState(false)

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading section plan…</div>
  }

  if (error || !sectionPlan) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-destructive">
          Could not load section plan: {(error as Error)?.message ?? 'not found'}
        </CardContent>
      </Card>
    )
  }

  const plan: SectionPlanRow = sectionPlan

  return (
    <SectionPlanProvider sectionPlan={plan}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/campaigns/${campaignId}?tab=section-plans`}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Section plans
            </Link>
          </Button>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold">{plan.name}</h1>
              <Badge variant="secondary">{SECTION_PLAN_STATUS_LABELS[plan.status]}</Badge>
            </div>
            {campaignName && (
              <p className="text-sm text-muted-foreground">
                Campaign:{' '}
                <Link
                  href={`/campaigns/${campaignId}`}
                  className="underline-offset-2 hover:underline"
                >
                  {campaignName}
                </Link>
              </p>
            )}
            {plan.purpose && (
              <p className="text-sm text-muted-foreground max-w-2xl whitespace-pre-wrap">
                {plan.purpose}
              </p>
            )}
          </div>
          {canWrite && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Edit basics
            </Button>
          )}
        </div>

        <TimeframeBanner sectionPlan={plan} />

        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
          <nav className="space-y-1" aria-label="Section plan steps">
            {STEPS.map((step) => (
              <button
                key={step.key}
                type="button"
                onClick={() => onStepChange(step.key)}
                className={
                  'w-full text-left px-3 py-2 text-sm rounded-md transition-colors ' +
                  (activeStep === step.key
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'hover:bg-muted text-muted-foreground')
                }
              >
                {step.label}
              </button>
            ))}
          </nav>
          <div className="min-w-0">{children}</div>
        </div>

        <EditSectionPlanDialog
          sectionPlan={plan}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      </div>
    </SectionPlanProvider>
  )
}
