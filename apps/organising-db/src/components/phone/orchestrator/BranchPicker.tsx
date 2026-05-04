'use client'

import { useState } from 'react'
import { Users, FileText, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { EntryBranch } from '@/types/phone-call-action'

interface BranchOption {
  value: EntryBranch
  icon: React.ReactNode
  headline: string
  subtitle: string
  explanation: string
}

const BRANCH_OPTIONS: BranchOption[] = [
  {
    value: 'list_first',
    icon: <Users className="h-8 w-8 text-blue-500" />,
    headline: 'Create the list first',
    subtitle: 'Build your contact list, then script',
    explanation:
      "Start by selecting which workers to call and building your call list. Once the list is ready, you'll be guided to create a phone script tailored to those contacts.",
  },
  {
    value: 'script_first',
    icon: <FileText className="h-8 w-8 text-purple-500" />,
    headline: 'Create the script first',
    subtitle: 'Write the script, then build the list',
    explanation:
      "Start by crafting your call script — including CTA ambitions, objections, and issue talking points. Once saved, you'll be routed to build the contact list and start calling.",
  },
]

interface Props {
  value: EntryBranch | null
  onChange: (branch: EntryBranch) => void
  onConfirm: () => void
  onBack: () => void
  isSubmitting?: boolean
}

export function BranchPicker({ value, onChange, onConfirm, onBack, isSubmitting }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose how you want to start. Both paths will guide you through the full setup — list
        and script — just in a different order.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {BRANCH_OPTIONS.map((option) => {
          const selected = value === option.value
          return (
            <Card
              key={option.value}
              className={[
                'cursor-pointer border-2 transition-colors select-none',
                selected
                  ? 'border-primary bg-primary/5'
                  : 'border-transparent hover:border-muted-foreground/30',
              ].join(' ')}
              onClick={() => onChange(option.value)}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  {option.icon}
                  {selected && (
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-sm">{option.headline}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{option.subtitle}</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {option.explanation}
                </p>
              </CardContent>
            </Card>
          )
        })}
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
