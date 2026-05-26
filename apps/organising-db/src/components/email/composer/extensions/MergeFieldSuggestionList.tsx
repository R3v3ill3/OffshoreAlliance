'use client'

import { forwardRef, useImperativeHandle, useState } from 'react'
import { cn } from '@/lib/utils/cn'
import type { TemplateVariable } from '@/lib/comms/template-variables'

export interface SuggestionListRef {
  onKeyDown: (e: { event: KeyboardEvent }) => boolean
}

interface Props {
  items: TemplateVariable[]
  command: (item: { id: string }) => void
}

export const MergeFieldSuggestionList = forwardRef<SuggestionListRef, Props>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [storedItems, setStoredItems] = useState(items)
    if (storedItems !== items) {
      setStoredItems(items)
      setSelectedIndex(0)
    }

    const select = (index: number) => {
      const item = items[index]
      if (item) command({ id: item.key })
    }

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i + items.length - 1) % items.length)
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length)
          return true
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          select(selectedIndex)
          return true
        }
        return false
      },
    }))

    if (items.length === 0) {
      return (
        <div className="rounded-md border bg-popover text-popover-foreground shadow-md p-2 text-xs text-muted-foreground min-w-[220px]">
          No matching merge field.
        </div>
      )
    }

    const recipient = items.filter((i) => i.tier === 'recipient')
    const campaign = items.filter((i) => i.tier === 'campaign')

    return (
      <div className="rounded-md border bg-popover text-popover-foreground shadow-md min-w-[260px] max-h-64 overflow-auto p-1">
        {recipient.length > 0 && (
          <Section
            label="Recipient (resolved per-contact by Action Network)"
            items={recipient}
            startIndex={0}
            selectedIndex={selectedIndex}
            onSelect={select}
          />
        )}
        {campaign.length > 0 && (
          <Section
            label="Campaign context"
            items={campaign}
            startIndex={recipient.length}
            selectedIndex={selectedIndex}
            onSelect={select}
          />
        )}
      </div>
    )
  },
)

MergeFieldSuggestionList.displayName = 'MergeFieldSuggestionList'

function Section({
  label,
  items,
  startIndex,
  selectedIndex,
  onSelect,
}: {
  label: string
  items: TemplateVariable[]
  startIndex: number
  selectedIndex: number
  onSelect: (i: number) => void
}) {
  return (
    <div className="py-1">
      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {items.map((item, i) => {
        const globalIndex = startIndex + i
        const isSelected = selectedIndex === globalIndex
        return (
          <button
            type="button"
            key={item.key}
            className={cn(
              'w-full text-left px-2 py-1.5 rounded-sm text-sm flex items-center justify-between gap-3',
              isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
            )}
            onClick={() => onSelect(globalIndex)}
            onMouseEnter={() => {
              // No state update on hover — keyboard arrows drive selection.
            }}
          >
            <span className="font-medium truncate">{item.label}</span>
            <code className="text-[10px] text-muted-foreground font-mono">
              {`{{${item.key}}}`}
            </code>
          </button>
        )
      })}
    </div>
  )
}
