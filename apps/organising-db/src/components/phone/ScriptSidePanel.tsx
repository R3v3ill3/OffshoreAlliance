'use client'

import { useRef, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils/cn'
import { CheckCircle, Circle, ArrowRight, ChevronDown } from 'lucide-react'
import type { CallScriptSection } from '@/types/planner-types'
import { SECTION_TYPES } from '@/lib/phone/disposition-types'

interface ScriptSidePanelProps {
  sections: CallScriptSection[]
  currentIndex: number
  onGoToSection: (index: number) => void
  reachedSections: Set<number>
}

export function ScriptSidePanel({
  sections,
  currentIndex,
  onGoToSection,
  reachedSections,
}: ScriptSidePanelProps) {
  const activeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentIndex])

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold mb-3 sticky top-0 bg-background py-1">
        Call Script
      </h3>
      {sections.map((section, i) => {
        const isActive = i === currentIndex
        const isReached = reachedSections.has(i)
        const sectionConfig = SECTION_TYPES.find((t) => t.value === section.section_type)

        return (
          <div
            key={section.section_id}
            ref={isActive ? activeRef : undefined}
            className={cn(
              'p-3 rounded-lg border cursor-pointer transition-all',
              isActive && 'border-primary bg-primary/5 ring-1 ring-primary/20',
              !isActive && isReached && 'border-green-200 bg-green-50/50',
              !isActive && !isReached && 'border-transparent hover:border-muted hover:bg-muted/30',
            )}
            onClick={() => onGoToSection(i)}
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5 flex-shrink-0">
                {isActive ? (
                  <ArrowRight className="h-4 w-4 text-primary" />
                ) : isReached ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {sectionConfig?.label || section.section_type}
                  </Badge>
                  <span className={cn(
                    'text-xs font-medium truncate',
                    isActive && 'text-primary',
                  )}>
                    {section.title}
                  </span>
                </div>

                {/* Show body text -- full if active, truncated otherwise */}
                <p className={cn(
                  'text-xs text-muted-foreground whitespace-pre-wrap',
                  !isActive && 'line-clamp-2',
                )}>
                  {section.body_text}
                </p>

                {/* Show talking points for active section */}
                {isActive && section.talking_points && section.talking_points.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {section.talking_points.map((point, pi) => (
                      <li key={pi} className="flex items-start gap-1">
                        <ChevronDown className="h-3 w-3 mt-0.5 text-primary flex-shrink-0" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
