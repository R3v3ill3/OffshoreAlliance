'use client'

import Link from 'next/link'
import type { P2wCompletion } from '@/lib/hooks/useCampaignsAllStats'

interface StagePlanSummary {
  plan_id: number
  stage_number: number
  stage_name: string
  status: string
}

interface CampaignPlanningVisualProps {
  campaignId: number
  stagePlans: StagePlanSummary[]
  p2wByPlanId: Map<number, P2wCompletion>
}

const P2W_STEPS: { key: keyof P2wCompletion; label: string }[] = [
  { key: 'ambitions', label: 'Ambitions' },
  { key: 'whereToPlay', label: 'Where to Play' },
  { key: 'theory', label: 'Theory of Winning' },
  { key: 'capacities', label: 'Capacities' },
  { key: 'management', label: 'Management Systems' },
]

const ALL_STAGES = [1, 2, 3, 4, 5]

const STAGE_SHORT: Record<number, string> = {
  1: 'ID',
  2: 'Comms',
  3: 'Mob',
  4: 'Claims',
  5: 'Endorse',
}

function stageStatusClasses(status: string | undefined): {
  chip: string
  border: string
  number: string
} {
  switch (status) {
    case 'completed':
      return {
        chip: 'bg-emerald-100 dark:bg-emerald-900/40',
        border: 'border-emerald-400 dark:border-emerald-600',
        number: 'text-emerald-700 dark:text-emerald-300',
      }
    case 'active':
      return {
        chip: 'bg-sky-100 dark:bg-sky-900/40',
        border: 'border-sky-400 dark:border-sky-500',
        number: 'text-sky-700 dark:text-sky-300',
      }
    case 'draft':
      return {
        chip: 'bg-muted/60',
        border: 'border-border',
        number: 'text-muted-foreground',
      }
    default:
      return {
        chip: 'bg-muted/30',
        border: 'border-dashed border-border',
        number: 'text-muted-foreground/50',
      }
  }
}

export function CampaignPlanningVisual({
  campaignId,
  stagePlans,
  p2wByPlanId,
}: CampaignPlanningVisualProps) {
  const planByStage = new Map<number, StagePlanSummary>()
  for (const sp of stagePlans) {
    planByStage.set(sp.stage_number, sp)
  }

  return (
    <div className="flex gap-1">
      {ALL_STAGES.map((stageNum) => {
        const plan = planByStage.get(stageNum)
        const classes = stageStatusClasses(plan?.status)
        const p2w = plan ? p2wByPlanId.get(plan.plan_id) : undefined
        const completedSteps = p2w ? P2W_STEPS.filter((s) => p2w[s.key]).length : 0
        const href = `/campaigns/${campaignId}/plan/stage/${stageNum}`

        const content = (
          <div
            className={`flex flex-col items-center gap-1 rounded border px-1.5 py-1 min-w-[2.75rem] ${classes.chip} ${classes.border}`}
            title={
              plan
                ? `Stage ${stageNum}: ${plan.stage_name} (${plan.status})${p2w ? ` — ${completedSteps}/5 planning steps` : ''}`
                : `Stage ${stageNum}: not started`
            }
          >
            <span className={`text-[10px] font-semibold leading-none ${classes.number}`}>
              S{stageNum}
            </span>
            <span className={`text-[9px] leading-none ${classes.number} opacity-80`}>
              {STAGE_SHORT[stageNum]}
            </span>
            <div className="flex gap-0.5 mt-0.5">
              {P2W_STEPS.map((step) => {
                const done = p2w ? p2w[step.key] : false
                return (
                  <span
                    key={step.key}
                    className={`h-1.5 w-1.5 rounded-full ${
                      done
                        ? plan?.status === 'completed'
                          ? 'bg-emerald-500'
                          : 'bg-sky-500'
                        : plan
                          ? 'bg-muted-foreground/30'
                          : 'bg-muted-foreground/10'
                    }`}
                    title={step.label}
                  />
                )
              })}
            </div>
          </div>
        )

        return plan ? (
          <Link key={stageNum} href={href} onClick={(e) => e.stopPropagation()}>
            {content}
          </Link>
        ) : (
          <div key={stageNum}>{content}</div>
        )
      })}
    </div>
  )
}
