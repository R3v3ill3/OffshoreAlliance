'use client'

import { CheckCircle2, ClipboardList, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Order, Pathway } from '@/types/phone-call-action'

interface Props {
  pathway: Pathway
  value: Order | null
  onChange: (o: Order) => void
  onConfirm: () => void
  onBack: () => void
  isSubmitting?: boolean
}

export function OrderPicker({ pathway, value, onChange, onConfirm, onBack, isSubmitting }: Props) {
  const setupLabel = pathway === 'script' ? 'Create script first' : 'Pick assessments first'
  const setupSubtitle =
    pathway === 'script'
      ? 'Open the script wizard now, build the list afterwards.'
      : 'Choose which assessments to rate, build the list afterwards.'
  const listSubtitle =
    pathway === 'script'
      ? 'Build or pick a list now, draft the script afterwards.'
      : 'Build or pick a list now, choose the assessments afterwards.'

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose which component to set up first. Either order ends at the same dialler.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card
          role="button"
          tabIndex={0}
          className={[
            'cursor-pointer border-2 transition-colors select-none',
            value === 'setup_first'
              ? 'border-primary bg-primary/5'
              : 'border-transparent hover:border-muted-foreground/30',
          ].join(' ')}
          onClick={() => onChange('setup_first')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onChange('setup_first')
          }}
        >
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <ClipboardList className="h-8 w-8 text-purple-500" />
              {value === 'setup_first' && (
                <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
              )}
            </div>
            <div>
              <p className="font-semibold text-sm">{setupLabel}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{setupSubtitle}</p>
            </div>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          className={[
            'cursor-pointer border-2 transition-colors select-none',
            value === 'list_first'
              ? 'border-primary bg-primary/5'
              : 'border-transparent hover:border-muted-foreground/30',
          ].join(' ')}
          onClick={() => onChange('list_first')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onChange('list_first')
          }}
        >
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <Users className="h-8 w-8 text-blue-500" />
              {value === 'list_first' && (
                <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
              )}
            </div>
            <div>
              <p className="font-semibold text-sm">Build the list first</p>
              <p className="text-xs text-muted-foreground mt-0.5">{listSubtitle}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
          Back
        </Button>
        <Button onClick={onConfirm} disabled={!value || isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
