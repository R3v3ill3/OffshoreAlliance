'use client'

/**
 * SmsPathwayPicker — Blast / Chat / Survey (brief §B/§A decision 3),
 * structurally cloned from PathwayPicker.tsx. All three pathways are
 * selectable; Chat routes to the P2P chat board (Chats tab).
 */

import { CheckCircle2, ClipboardList, MessagesSquare, Send } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { SmsPathway } from '@/lib/sms/pathway-targets'

interface Option {
  value: SmsPathway
  icon: React.ReactNode
  headline: string
  subtitle: string
  explanation: string
  disabled?: boolean
}

const OPTIONS: Option[] = [
  {
    value: 'blast',
    icon: <Send className="h-8 w-8 text-blue-500" />,
    headline: 'Send one message to the whole cohort',
    subtitle: 'Blast',
    explanation:
      'Composer, merge fields, blackout window and opt-out screening. Sends are drained by the dispatch cron.',
  },
  {
    value: 'chat',
    icon: <MessagesSquare className="h-8 w-8 text-emerald-500" />,
    headline: 'Peer-to-peer chat',
    subtitle: 'Chat board',
    explanation:
      'Load a working list, then pick people (5–10 at a time) and fire personalised openers. Replies land in the Inbox as 1:1 threads.',
  },
  {
    value: 'survey',
    icon: <ClipboardList className="h-8 w-8 text-purple-500" />,
    headline: 'Reply-native survey',
    subtitle: 'Survey',
    explanation:
      'Ask 1–5 questions by SMS, with optional assessment writes. The roll freezes when you open the survey.',
  },
]

interface Props {
  value: SmsPathway | null
  onChange: (p: SmsPathway) => void
  onNext: () => void
  onCancel: () => void
  isSubmitting?: boolean
  /** Override the "Next" button label (e.g. "Continue"). */
  nextLabel?: string
}

export function SmsPathwayPicker({
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
        Pick how you want to reach this cohort by SMS. You can switch pathway
        later from the Outreach tab.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((opt) => {
          const selected = value === opt.value
          if (opt.disabled) {
            return (
              <Card
                key={opt.value}
                aria-disabled="true"
                tabIndex={-1}
                className="cursor-not-allowed select-none border-2 border-transparent opacity-60"
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    {opt.icon}
                    <Badge variant="secondary">Later release</Badge>
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
          }
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
