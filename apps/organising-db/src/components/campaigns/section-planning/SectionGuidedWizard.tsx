'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SectionSituationSnippetCard } from './SectionSituationSnippetCard'
import { WorkforceMappingTable } from './WorkforceMappingTable'
import { SectionAmbitionPanel } from './SectionAmbitionPanel'
import { SectionWhereToPlayPanel } from './SectionWhereToPlayPanel'
import { SectionCapacitiesPanel } from './SectionCapacitiesPanel'
import { SectionActivitiesPanel } from './SectionActivitiesPanel'
import { SectionTheoryOfWinningPanel } from './SectionTheoryOfWinningPanel'
import { SectionSOCPanel } from './SectionSOCPanel'
import { SectionWorkplanGrid } from './SectionWorkplanGrid'
import { StageMappingPanel } from './StageMappingPanel'

interface Step {
  key: string
  title: string
  prompt: string
  render: (props: { sectionPlanId: number; campaignId: number }) => React.ReactNode
}

const STEPS: Step[] = [
  {
    key: 'situation',
    title: 'Current Situation',
    prompt: 'Pull the latest from the campaign, then sharpen the status, key event, and strategic context.',
    render: ({ sectionPlanId }) => (
      <SectionSituationSnippetCard sectionPlanId={sectionPlanId} />
    ),
  },
  {
    key: 'workforce',
    title: 'Workforce Mapping',
    prompt: 'Confirm the per-worksite workers / members / density. Override only when the live data is wrong.',
    render: ({ sectionPlanId, campaignId }) => (
      <WorkforceMappingTable sectionPlanId={sectionPlanId} campaignId={campaignId} />
    ),
  },
  {
    key: 'ambitions',
    title: 'Ambitions for the Period',
    prompt: 'Set 4 tight ambitions — Primary, Secondary, Organising, Industrial.',
    render: ({ sectionPlanId }) => <SectionAmbitionPanel sectionPlanId={sectionPlanId} />,
  },
  {
    key: 'where-to-play',
    title: 'Contact Strategy / Where to Play',
    prompt: 'Priority cohorts ranked 1–3 + rationale. Link each row to an ambition.',
    render: ({ sectionPlanId }) => <SectionWhereToPlayPanel sectionPlanId={sectionPlanId} />,
  },
  {
    key: 'capacities',
    title: 'Capacities',
    prompt: 'What tools / skills / platforms do you have? Mark gaps with a resolution plan.',
    render: ({ sectionPlanId }) => <SectionCapacitiesPanel sectionPlanId={sectionPlanId} />,
  },
  {
    key: 'activities',
    title: 'Activities + Sequences',
    prompt: 'Create the outreach scaffolds; chain follow-ups with a sequence.',
    render: ({ sectionPlanId, campaignId }) => (
      <SectionActivitiesPanel sectionPlanId={sectionPlanId} campaignId={campaignId} />
    ),
  },
  {
    key: 'theory',
    title: 'Theory of Winning',
    prompt: 'One if/then statement testing the bet. Save creates a new version.',
    render: ({ sectionPlanId }) => <SectionTheoryOfWinningPanel sectionPlanId={sectionPlanId} />,
  },
  {
    key: 'soc',
    title: 'Structured Organising Conversations',
    prompt: 'Author SOC 1 (general workforce) and / or SOC 2 (bargaining reps) with the recording grid.',
    render: ({ sectionPlanId }) => <SectionSOCPanel sectionPlanId={sectionPlanId} />,
  },
  {
    key: 'workplan',
    title: 'Workplan',
    prompt: 'Day-by-day call targets. Completion counts roll up from concluded events.',
    render: ({ sectionPlanId }) => <SectionWorkplanGrid sectionPlanId={sectionPlanId} />,
  },
  {
    key: 'mapping',
    title: 'Map back to P2W stages',
    prompt: 'AI-assisted post-hoc mapping back to the 11-stage Playing-to-Win framework.',
    render: ({ sectionPlanId, campaignId }) => (
      <StageMappingPanel sectionPlanId={sectionPlanId} campaignId={campaignId} />
    ),
  },
]

interface SectionGuidedWizardProps {
  sectionPlanId: number
  campaignId: number
  onExit: () => void
}

export function SectionGuidedWizard({
  sectionPlanId,
  campaignId,
  onExit,
}: SectionGuidedWizardProps) {
  const [idx, setIdx] = useState(0)
  const [completed, setCompleted] = useState<Set<number>>(new Set())
  const step = STEPS[idx]

  const markCompleteAndNext = () => {
    const next = new Set(completed)
    next.add(idx)
    setCompleted(next)
    if (idx < STEPS.length - 1) setIdx(idx + 1)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {STEPS.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setIdx(i)}
                  className={
                    'rounded px-2 py-1 ' +
                    (i === idx
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : completed.has(i)
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                        : 'bg-muted text-muted-foreground')
                  }
                >
                  {completed.has(i) && <Check className="inline h-3 w-3 mr-1" />}
                  {i + 1}. {s.title}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={onExit}>
              Exit guided mode
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="info">
              Step {idx + 1} of {STEPS.length}
            </Badge>
            <h2 className="text-lg font-semibold">{step.title}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{step.prompt}</p>
        </CardContent>
      </Card>

      <div>{step.render({ sectionPlanId, campaignId })}</div>

      <div className="flex justify-between items-center pt-2">
        <Button
          variant="outline"
          onClick={() => setIdx(Math.max(0, idx - 1))}
          disabled={idx === 0}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Previous
        </Button>
        <div className="flex gap-2">
          {idx < STEPS.length - 1 ? (
            <Button onClick={markCompleteAndNext}>
              Next: {STEPS[idx + 1].title}
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          ) : (
            <Button onClick={onExit}>
              <Check className="h-4 w-4 mr-1.5" />
              Finish
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
