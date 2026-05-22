'use client'

import { CheckCircle2, PenLine, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { EmailPathway } from '@/types/email-action'

interface Option {
  value: EmailPathway
  icon: React.ReactNode
  headline: string
  subtitle: string
  explanation: string
}

const OPTIONS: Option[] = [
  {
    value: 'ai',
    icon: <Sparkles className="h-8 w-8 text-purple-500" />,
    headline: 'AI-assisted draft',
    subtitle: 'Generate a starting body from campaign context',
    explanation:
      'Pick a tone and audience, then the AI drafts a subject and body using campaign context. You can edit, regenerate, or replace it any time inside the editor.',
  },
  {
    value: 'paste',
    icon: <PenLine className="h-8 w-8 text-blue-500" />,
    headline: 'Paste / write from scratch',
    subtitle: 'Start with an empty editor',
    explanation:
      'Open a blank subject + body editor. Paste an existing email or type your own. You can still trigger AI generation later if you change your mind.',
  },
]

interface Props {
  value: EmailPathway | null
  onChange: (p: EmailPathway) => void
  onNext: () => void
  onCancel: () => void
  isSubmitting?: boolean
  /** Override the "Next" button label (e.g. "Continue"). */
  nextLabel?: string
}

export function EmailPathwayPicker({
  value,
  onChange,
  onNext,
  onCancel,
  isSubmitting,
  nextLabel = 'Next',
}: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pick how you&rsquo;d like to start the email body. You can switch
        between AI and manual editing later inside the editor.
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
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={onNext} disabled={!value || isSubmitting}>
          {isSubmitting ? 'Saving…' : nextLabel}
        </Button>
      </div>
    </div>
  )
}
