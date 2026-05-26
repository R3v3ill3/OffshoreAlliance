'use client'

import { forwardRef, useImperativeHandle, useState } from 'react'
import { cn } from '@/lib/utils/cn'
import {
  Sparkles,
  Wand2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Megaphone,
  Heart,
  BookOpen,
  Variable,
  type LucideIcon,
} from 'lucide-react'
import type { SlashCommand } from './slash-menu'
import type { SuggestionListRef } from './MergeFieldSuggestionList'

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  rewrite: Wand2,
  shorten: ArrowDownToLine,
  lengthen: ArrowUpFromLine,
  militant: Megaphone,
  solidarity: Heart,
  plain: BookOpen,
  variable: Variable,
}

interface Props {
  items: SlashCommand[]
  command: (item: SlashCommand) => void
}

export const SlashCommandList = forwardRef<SuggestionListRef, Props>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [storedItems, setStoredItems] = useState(items)
    if (storedItems !== items) {
      setStoredItems(items)
      setSelectedIndex(0)
    }

    const select = (i: number) => {
      const item = items[i]
      if (item) command(item)
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
        if (event.key === 'Enter') {
          select(selectedIndex)
          return true
        }
        return false
      },
    }))

    if (items.length === 0) {
      return (
        <div className="rounded-md border bg-popover text-popover-foreground shadow-md p-2 text-xs text-muted-foreground min-w-[260px]">
          No matching command.
        </div>
      )
    }

    return (
      <div className="rounded-md border bg-popover text-popover-foreground shadow-md min-w-[280px] max-h-72 overflow-auto p-1">
        <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Editor commands
        </div>
        {items.map((item, i) => {
          const isSelected = selectedIndex === i
          const Icon = (item.iconKey && ICONS[item.iconKey]) || Sparkles
          return (
            <button
              type="button"
              key={item.title}
              className={cn(
                'w-full text-left px-2 py-2 rounded-sm flex items-start gap-3',
                isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
              )}
              onClick={() => select(i)}
            >
              <Icon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            </button>
          )
        })}
      </div>
    )
  },
)

SlashCommandList.displayName = 'SlashCommandList'
