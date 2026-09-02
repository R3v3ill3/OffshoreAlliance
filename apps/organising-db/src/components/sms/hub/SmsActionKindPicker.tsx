'use client'

/**
 * The four things an organiser can run over SMS, as selectable cards.
 * Copy leads with the job to be done, then the mechanism, so the
 * choice is made on intent ("I want a reply from each person") rather
 * than on feature names.
 */
import {
  ArrowRightLeft,
  CheckCircle2,
  ClipboardList,
  MessagesSquare,
  Send,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'
import { SMS_ACTION_KINDS, type SmsActionKind } from '@/lib/sms/hub-actions'

export interface SmsActionKindMeta {
  kind: SmsActionKind
  label: string
  headline: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  tone: string
}

export const SMS_ACTION_KIND_META: Record<SmsActionKind, SmsActionKindMeta> = {
  blast: {
    kind: 'blast',
    label: 'Blast',
    headline: 'Tell everyone the same thing',
    description:
      'One message to a list. Merge fields, send window and opt-out screening; replies land in the Inbox.',
    icon: Send,
    tone: 'text-blue-500',
  },
  chat: {
    kind: 'chat',
    label: 'Chat board',
    headline: 'Talk to people one at a time',
    description:
      'Work through a list a handful at a time with personalised openers. Every reply is a 1:1 thread.',
    icon: MessagesSquare,
    tone: 'text-emerald-500',
  },
  survey: {
    kind: 'survey',
    label: 'Survey',
    headline: 'Get an answer from each person',
    description:
      'Up to five questions by reply. Answers are parsed automatically and can write member ratings.',
    icon: ClipboardList,
    tone: 'text-purple-500',
  },
  relay: {
    kind: 'relay',
    label: 'Relay',
    headline: 'Let members reach someone outside',
    description:
      'A dedicated number forwards member texts to an MP, employer or ally with attribution — nobody sees the other side’s number.',
    icon: ArrowRightLeft,
    tone: 'text-amber-500',
  },
}

export function SmsActionKindPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: SmsActionKind | null
  onChange: (kind: SmsActionKind) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label="Kind of SMS action" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {SMS_ACTION_KINDS.map((kind) => {
        const meta = SMS_ACTION_KIND_META[kind]
        const selected = value === kind
        return (
          <Card
            key={kind}
            role="radio"
            aria-checked={selected}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : 0}
            className={cn(
              'select-none border-2 transition-colors',
              disabled
                ? 'cursor-not-allowed opacity-60'
                : 'cursor-pointer hover:border-muted-foreground/30',
              selected ? 'border-primary bg-primary/5' : 'border-transparent',
            )}
            onClick={() => !disabled && onChange(kind)}
            onKeyDown={(e) => {
              if (disabled) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onChange(kind)
              }
            }}
          >
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between">
                <meta.icon className={cn('h-7 w-7', meta.tone)} />
                {selected && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}
              </div>
              <div>
                <p className="text-sm font-semibold">{meta.headline}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{meta.label}</p>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {meta.description}
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
