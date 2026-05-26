'use client'

import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Sparkles, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import {
  classifySubjectLength,
  scanSpamTriggers,
  scanStructural,
} from '@/lib/comms/spam-triggers'

interface Props {
  value: string
  onChange: (value: string) => void
  onRequestAiVariants?: () => void
  isAiPending?: boolean
  variants?: string[]
  onPickVariant?: (variant: string) => void
}

export function SubjectLineField({
  value,
  onChange,
  onRequestAiVariants,
  isAiPending,
  variants,
  onPickVariant,
}: Props) {
  const len = value.length
  const cls = classifySubjectLength(len)
  const struct = useMemo(() => scanStructural(value), [value])
  const spam = useMemo(() => scanSpamTriggers(value), [value])

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="email-subject" className="text-xs uppercase tracking-wide text-muted-foreground">
          Subject
        </Label>
        <div className="flex items-center gap-2">
          <CounterChip count={len} kind="subject" cls={cls} />
          {onRequestAiVariants && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-1.5 gap-1"
              onClick={onRequestAiVariants}
              disabled={isAiPending}
              title="Generate 3 subject-line variants with AI"
            >
              {isAiPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Subject ideas
            </Button>
          )}
        </div>
      </div>
      <Input
        id="email-subject"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="What's this email about?"
        className="text-base font-medium h-10"
      />
      {(struct.shoutPercent > 30 ||
        struct.exclamationCount > 1 ||
        struct.emojiCount > 2 ||
        spam.length > 0) && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-700">
          <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5">
            {struct.shoutPercent > 30 && (
              <p>{struct.shoutPercent}% capitalised — heavy SHOUTING reads as spammy.</p>
            )}
            {struct.exclamationCount > 1 && (
              <p>{struct.exclamationCount} exclamation marks — keep it to one.</p>
            )}
            {struct.emojiCount > 2 && (
              <p>{struct.emojiCount} emoji — &gt;2 in a subject looks promotional.</p>
            )}
            {spam.length > 0 && (
              <p>
                Possible spam triggers:{' '}
                {Array.from(new Set(spam.map((s) => s.trigger.match))).join(', ')}.
              </p>
            )}
          </div>
        </div>
      )}
      {variants && variants.length > 0 && onPickVariant && (
        <div className="rounded-md border bg-muted/30 p-2 space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            AI subject variants — click to use
          </p>
          {variants.map((v, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPickVariant(v)}
              className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-accent/60"
            >
              <span className="text-muted-foreground mr-2">{i + 1}.</span>
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function PreheaderField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const len = value.length
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label
          htmlFor="email-preheader"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          Preheader{' '}
          <span className="text-muted-foreground/70 normal-case">
            (preview text shown in the inbox)
          </span>
        </Label>
        <CounterChip count={len} kind="preheader" cls={classifySubjectLength(len)} />
      </div>
      <Input
        id="email-preheader"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="One-line teaser that appears next to the subject…"
        className="text-sm"
      />
    </div>
  )
}

function CounterChip({
  count,
  kind,
  cls,
}: {
  count: number
  kind: 'subject' | 'preheader'
  cls: 'too-short' | 'green' | 'amber' | 'red'
}) {
  const label = kind === 'subject' ? 'chars' : 'chars'
  const tone =
    cls === 'green'
      ? 'text-green-700 bg-green-50 border-green-200'
      : cls === 'amber'
      ? 'text-amber-700 bg-amber-50 border-amber-200'
      : cls === 'red'
      ? 'text-red-700 bg-red-50 border-red-200'
      : 'text-muted-foreground bg-muted border-border'

  const hint =
    kind === 'subject'
      ? cls === 'green'
        ? 'In the sweet spot'
        : cls === 'amber'
        ? 'May truncate on mobile'
        : cls === 'red'
        ? 'Will truncate in most clients'
        : 'Too short — be more specific'
      : cls === 'green'
      ? 'Good range'
      : cls === 'amber'
      ? 'Short — may show inbox preview from body'
      : cls === 'red'
      ? 'Too long — will get cut'
      : 'Add a preheader to improve open rate'

  return (
    <span
      title={hint}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
        tone,
      )}
    >
      {count} {label}
    </span>
  )
}
