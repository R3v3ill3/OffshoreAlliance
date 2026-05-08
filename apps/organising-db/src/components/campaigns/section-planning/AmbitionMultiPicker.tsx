'use client'

import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils/cn'

interface AmbitionOption {
  id: number
  label: string
}

interface AmbitionMultiPickerProps {
  options: AmbitionOption[]
  value: number[]
  onChange: (next: number[]) => void
  disabled?: boolean
  placeholder?: string
  emptyLabel?: string
  /** Optional set of inherited ids — rendered with a subtle "(inherited)" suffix when not in `value`. */
  inheritedIds?: number[]
  buttonClassName?: string
}

/**
 * Multi-select ambition picker rendered as a pill cluster + popover.
 * - Pills show the currently-selected ambitions (and inherited ones grey-style).
 * - Popover lets you toggle each option with a checkbox.
 *
 * Used at both the section-header level and the per-row level. When used at
 * the row level, pass the section's section-default ambitions as
 * `inheritedIds` so the row UI shows them as inherited until overridden.
 */
export function AmbitionMultiPicker({
  options,
  value,
  onChange,
  disabled,
  placeholder = 'No ambitions linked',
  emptyLabel = 'No ambitions to choose from',
  inheritedIds,
  buttonClassName,
}: AmbitionMultiPickerProps) {
  const [open, setOpen] = useState(false)
  const valueSet = new Set(value)
  const inheritedSet = new Set(inheritedIds ?? [])
  const inheritedOnly = (inheritedIds ?? []).filter((id) => !valueSet.has(id))

  const toggle = (id: number) => {
    if (valueSet.has(id)) onChange(value.filter((v) => v !== id))
    else onChange([...value, id])
  }

  const selectedLabels = options
    .filter((o) => valueSet.has(o.id))
    .map((o) => o.label)
  const inheritedLabels = options
    .filter((o) => inheritedOnly.includes(o.id))
    .map((o) => o.label)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selectedLabels.map((label, i) => (
        <Badge key={`sel-${i}`} variant="info" className="text-[10px]">
          {label}
        </Badge>
      ))}
      {inheritedLabels.map((label, i) => (
        <Badge
          key={`inh-${i}`}
          variant="secondary"
          className="text-[10px] opacity-70"
          title="Inherited from section default"
        >
          {label} <span className="ml-1 italic">(section)</span>
        </Badge>
      ))}
      {selectedLabels.length === 0 && inheritedLabels.length === 0 && (
        <span className="text-xs text-muted-foreground italic">{placeholder}</span>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className={cn('h-6 px-2 text-xs', buttonClassName)}
          >
            <ChevronDown className="h-3 w-3 mr-1" />
            Edit
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          {options.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">{emptyLabel}</p>
          ) : (
            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {options.map((o) => {
                const checked = valueSet.has(o.id)
                const inherited = inheritedSet.has(o.id) && !checked
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => toggle(o.id)}
                      className="w-full flex items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(o.id)}
                        className="mt-0.5"
                      />
                      <span
                        className={cn(
                          'flex-1',
                          inherited && 'text-muted-foreground italic',
                        )}
                      >
                        {o.label}
                        {inherited && (
                          <span className="ml-1 text-[10px]">(inherited)</span>
                        )}
                      </span>
                      {checked && <Check className="h-3.5 w-3.5 text-primary mt-0.5" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
