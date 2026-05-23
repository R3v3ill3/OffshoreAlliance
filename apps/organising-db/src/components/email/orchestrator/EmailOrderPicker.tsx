'use client'

import { Loader2, Mail, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { EmailOrder } from '@/types/email-action'

interface Props {
  /** Fires immediately when the user clicks a card — no separate Confirm step. */
  onSelect: (o: EmailOrder) => void
  onBack: () => void
  /** When set, shows a spinner over the matching card. */
  submitting?: EmailOrder | null
}

/**
 * Single-tap order picker. Each card is "hot": clicking it triggers
 * navigation through onSelect without an intermediate Continue button.
 * Back is unchanged.
 */
export function EmailOrderPicker({ onSelect, onBack, submitting }: Props) {
  const isSubmitting = submitting != null

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose which component to set up first. Either order ends at the same send step.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card
          role="button"
          tabIndex={0}
          aria-disabled={isSubmitting}
          className={[
            'cursor-pointer border-2 transition-colors select-none',
            'border-transparent hover:border-primary/60 hover:bg-primary/5',
            isSubmitting ? 'pointer-events-none opacity-60' : '',
          ].join(' ')}
          onClick={() => !isSubmitting && onSelect('setup_first')}
          onKeyDown={(e) => {
            if (isSubmitting) return
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSelect('setup_first')
            }
          }}
        >
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <Mail className="h-8 w-8 text-purple-500" />
              {submitting === 'setup_first' && (
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
              )}
            </div>
            <div>
              <p className="font-semibold text-sm">Draft email first</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Open the body editor now, build the recipient list afterwards.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          aria-disabled={isSubmitting}
          className={[
            'cursor-pointer border-2 transition-colors select-none',
            'border-transparent hover:border-primary/60 hover:bg-primary/5',
            isSubmitting ? 'pointer-events-none opacity-60' : '',
          ].join(' ')}
          onClick={() => !isSubmitting && onSelect('list_first')}
          onKeyDown={(e) => {
            if (isSubmitting) return
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSelect('list_first')
            }
          }}
        >
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <Users className="h-8 w-8 text-blue-500" />
              {submitting === 'list_first' && (
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
              )}
            </div>
            <div>
              <p className="font-semibold text-sm">Build the list first</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Build or pick a recipient list now, draft the email afterwards.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-start pt-2">
        <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
          Back
        </Button>
      </div>
    </div>
  )
}
