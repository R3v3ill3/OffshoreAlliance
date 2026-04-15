'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'
import { ChevronLeft, ChevronRight, CheckCircle, Circle, ArrowRight } from 'lucide-react'
import { resolveScriptVariables } from '@/lib/comms/template-variables'
import type { CallScriptSection } from '@/types/planner-types'

interface ConversationStepperProps {
  sections: CallScriptSection[]
  currentIndex: number
  reachedSections: Set<number>
  stepNotes: Record<number, string>
  onStepNotesChange: (index: number, text: string) => void
  onAdvance: () => void
  onGoBack: () => void
  canAdvance: boolean
  canGoBack: boolean
  workerContext?: Record<string, string | undefined>
}

export function ConversationStepper({
  sections,
  currentIndex,
  reachedSections,
  stepNotes,
  onStepNotesChange,
  onAdvance,
  onGoBack,
  canAdvance,
  canGoBack,
  workerContext = {},
}: ConversationStepperProps) {
  const current = sections[currentIndex]
  if (!current) return null

  const resolve = (text: string) => resolveScriptVariables(text, workerContext)

  return (
    <div className="space-y-3">
      {/* Step indicators */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {sections.map((s, i) => (
          <div
            key={s.section_id}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs whitespace-nowrap transition-colors',
              i === currentIndex && 'bg-primary/10 text-primary font-medium',
              i !== currentIndex && reachedSections.has(i) && 'text-green-600',
              i !== currentIndex && !reachedSections.has(i) && 'text-muted-foreground',
            )}
          >
            {reachedSections.has(i) && i !== currentIndex ? (
              <CheckCircle className="h-3 w-3 text-green-500" />
            ) : i === currentIndex ? (
              <ArrowRight className="h-3 w-3" />
            ) : (
              <Circle className="h-3 w-3" />
            )}
            <span className="hidden sm:inline">{s.title || `Step ${i + 1}`}</span>
            <span className="sm:hidden">{i + 1}</span>
          </div>
        ))}
      </div>

      {/* Current section prompt */}
      <div className="p-4 rounded-lg border-2 border-primary/20 bg-primary/5">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="secondary" className="text-xs">
            {current.section_type.replace(/_/g, ' ')}
          </Badge>
          <span className="text-sm font-semibold">{current.title}</span>
          {current.is_optional && (
            <Badge variant="outline" className="text-xs">Optional</Badge>
          )}
        </div>

        {/* Prompt text - the key quick reference for the caller */}
        {current.prompt_text && (
          <p className="text-base font-medium text-primary mb-2">
            {resolve(current.prompt_text)}
          </p>
        )}

        {/* Talking points */}
        {current.talking_points && current.talking_points.length > 0 && (
          <ul className="space-y-1 ml-4 text-sm text-muted-foreground list-disc">
            {current.talking_points.map((point, i) => (
              <li key={i}>{resolve(point)}</li>
            ))}
          </ul>
        )}

        {/* Step notes */}
        <div className="mt-3">
          <Input
            value={stepNotes[currentIndex] || ''}
            onChange={(e) => onStepNotesChange(currentIndex, e.target.value)}
            placeholder="Quick note for this step..."
            className="h-7 text-xs"
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline" size="sm"
          onClick={onGoBack}
          disabled={!canGoBack}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          {currentIndex + 1} of {sections.length}
        </span>
        <Button
          variant="outline" size="sm"
          onClick={onAdvance}
          disabled={!canAdvance}
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}
