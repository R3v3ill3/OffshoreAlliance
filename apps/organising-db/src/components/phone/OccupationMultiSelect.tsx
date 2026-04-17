'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Check, ChevronsUpDown, X, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface OccupationOption {
  occupation: string
  count: number
}

interface Props {
  campaignId: string | number
  selected: string[]
  onChange: (values: string[]) => void
  className?: string
  placeholder?: string
  compact?: boolean
}

export function OccupationMultiSelect({
  campaignId,
  selected,
  onChange,
  className,
  placeholder = 'Select occupations…',
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false)

  const { data: options = [], isLoading } = useQuery<OccupationOption[]>({
    queryKey: ['campaign-occupations', String(campaignId)],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}/occupations`)
      if (!res.ok) return []
      return (await res.json()) as OccupationOption[]
    },
    enabled: !!campaignId,
  })

  const selectedSet = useMemo(() => new Set(selected), [selected])

  const toggle = (occupation: string) => {
    if (selectedSet.has(occupation)) {
      onChange(selected.filter((s) => s !== occupation))
    } else {
      onChange([...selected, occupation])
    }
  }

  const clearAll = () => onChange([])

  const triggerLabel =
    selected.length === 0
      ? placeholder
      : selected.length === 1
      ? selected[0]
      : `${selected.length} occupations selected`

  return (
    <div className={cn('space-y-1.5', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'w-full justify-between font-normal',
              compact ? 'h-8 text-xs' : 'h-9 text-sm',
              selected.length === 0 && 'text-muted-foreground'
            )}
          >
            <span className="flex items-center gap-1.5 truncate">
              <Briefcase className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{triggerLabel}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 flex-shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search occupations..." className="h-9" />
            <CommandList>
              {isLoading ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  Loading…
                </div>
              ) : options.length === 0 ? (
                <CommandEmpty>
                  No occupations found for workers in this campaign.
                </CommandEmpty>
              ) : (
                <>
                  <CommandEmpty>No matching occupation.</CommandEmpty>
                  <CommandGroup>
                    {options.map((o) => {
                      const isSelected = selectedSet.has(o.occupation)
                      return (
                        <CommandItem
                          key={o.occupation}
                          value={o.occupation}
                          onSelect={() => toggle(o.occupation)}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-3.5 w-3.5',
                              isSelected ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <span className="flex-1 truncate">{o.occupation}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">
                            {o.count}
                          </span>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
          {selected.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t p-2">
              <span className="text-xs text-muted-foreground">
                {selected.length} selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={clearAll}
              >
                Clear
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {selected.length > 0 && !compact && (
        <div className="flex flex-wrap gap-1">
          {selected.map((o) => (
            <Badge
              key={o}
              variant="secondary"
              className="text-[10px] gap-1 cursor-pointer"
              onClick={() => toggle(o)}
            >
              {o}
              <X className="h-2.5 w-2.5" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
