'use client'

import { CheckCircle2, FileText, Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Pathway } from '@/types/phone-call-action'

interface Option {
  value: Pathway
  icon: React.ReactNode
  headline: string
  subtitle: string
  explanation: string
}

const OPTIONS: Option[] = [
  {
    value: 'script',
    icon: <FileText className="h-8 w-8 text-purple-500" />,
    headline: 'Full script + ratings',
    subtitle: 'Build a script, then run calls with it',
    explanation:
      'Use the script wizard to draft an opening, ask, objections, CTA ambitions, and any assessments to rate during the call. Best for structured conversations or full membership pushes.',
  },
  {
    value: 'assessment_only',
    icon: <Star className="h-8 w-8 text-amber-500" />,
    headline: 'Assessment-only (simple)',
    subtitle: 'Just rate selected assessments per call',
    explanation:
      'Skip the script wizard. You pick one or more campaign assessments to rate each contact against during the dial, and that’s it. Best for quick rating sweeps.',
  },
]

interface Props {
  value: Pathway | null
  onChange: (p: Pathway) => void
  onNext: () => void
  onCancel: () => void
}

export function PathwayPicker({ value, onChange, onNext, onCancel }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pick the kind of phone call you want to set up. You can switch from
        Edit&nbsp;setup later if you change your mind.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((opt) => {
          const selected = value === opt.value
          return (
            <Card
              key={opt.value}
              role="button"
              tabIndex={0}
              className={[
                'cursor-pointer border-2 transition-colors select-none',
                selected
                  ? 'border-primary bg-primary/5'
                  : 'border-transparent hover:border-muted-foreground/30',
              ].join(' ')}
              onClick={() => onChange(opt.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onChange(opt.value)
              }}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  {opt.icon}
                  {selected && (
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-sm">{opt.headline}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.subtitle}</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {opt.explanation}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onNext} disabled={!value}>
          Next
        </Button>
      </div>
    </div>
  )
}
