'use client'

import { useState, useMemo } from 'react'
import { Check, Plus, Search, X, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { sortByPopularity, formatCategoryLabel } from '@/lib/utils/option-sorting'

export interface SelectableOption {
  id: number
  text: string
  description?: string | null
  category?: string
  use_count: number | null
  is_system_default?: boolean | null
}

interface OptionSelectorProps {
  options: SelectableOption[]
  selectedIds: number[]
  onSelect: (option: SelectableOption) => void
  onDeselect: (optionId: number) => void
  onAddCustom?: (text: string, category?: string) => void
  sortBy?: 'use_count' | 'alphabetical' | 'category'
  allowCustom?: boolean
  showCategories?: boolean
  multiSelect?: boolean
  placeholder?: string
  customCategory?: string
  maxHeight?: string
  className?: string
}

export function OptionSelector({
  options,
  selectedIds,
  onSelect,
  onDeselect,
  onAddCustom,
  sortBy = 'use_count',
  allowCustom = true,
  showCategories = false,
  multiSelect = true,
  placeholder = 'Search options...',
  customCategory,
  maxHeight = '400px',
  className,
}: OptionSelectorProps) {
  const [search, setSearch] = useState('')
  const [customText, setCustomText] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

  const sortedOptions = useMemo(() => {
    let sorted = [...options]

    if (sortBy === 'use_count') {
      sorted = sortByPopularity(sorted.map((o) => ({ ...o, option_text: o.text })))
    } else if (sortBy === 'alphabetical') {
      sorted = sorted.sort((a, b) => a.text.localeCompare(b.text))
    }

    return sorted
  }, [options, sortBy])

  const filteredOptions = useMemo(() => {
    if (!search) return sortedOptions
    const s = search.toLowerCase()
    return sortedOptions.filter(
      (o) =>
        o.text.toLowerCase().includes(s) ||
        (o.description && o.description.toLowerCase().includes(s)) ||
        (o.category && o.category.toLowerCase().includes(s))
    )
  }, [sortedOptions, search])

  const selectedOptions = useMemo(
    () => filteredOptions.filter((o) => selectedIds.includes(o.id)),
    [filteredOptions, selectedIds]
  )
  const unselectedOptions = useMemo(
    () => filteredOptions.filter((o) => !selectedIds.includes(o.id)),
    [filteredOptions, selectedIds]
  )

  const grouped = useMemo(() => {
    if (!showCategories) return null

    const groups: Record<string, SelectableOption[]> = {}
    unselectedOptions.forEach((o) => {
      const cat = o.category || 'Other'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(o)
    })
    return groups
  }, [unselectedOptions, showCategories])

  function toggleCategory(category: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  function handleAddCustom() {
    if (!customText.trim() || !onAddCustom) return
    onAddCustom(customText.trim(), customCategory)
    setCustomText('')
    setShowCustomInput(false)
  }

  function handleToggle(option: SelectableOption) {
    if (selectedIds.includes(option.id)) {
      onDeselect(option.id)
    } else {
      if (!multiSelect && selectedIds.length > 0) {
        onDeselect(selectedIds[0])
      }
      onSelect(option)
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Selected options — pinned to top */}
      {selectedOptions.length > 0 && (
        <div className="space-y-1">
          {selectedOptions.map((option) => (
            <OptionRow
              key={option.id}
              option={option}
              selected
              onToggle={() => handleToggle(option)}
            />
          ))}
        </div>
      )}

      {/* Divider if both selected and unselected exist */}
      {selectedOptions.length > 0 && unselectedOptions.length > 0 && (
        <div className="border-t my-1" />
      )}

      {/* Unselected options */}
      <div
        className="overflow-y-auto space-y-1 pr-1"
        style={{ maxHeight }}
      >
        {showCategories && grouped ? (
          Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <button
                className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground"
                onClick={() => toggleCategory(category)}
              >
                {collapsedCategories.has(category) ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronUp className="h-3 w-3" />
                )}
                {formatCategoryLabel(category)}
                <span className="text-muted-foreground font-normal">({items.length})</span>
              </button>
              {!collapsedCategories.has(category) && (
                <div className="space-y-1 ml-2">
                  {items.map((option) => (
                    <OptionRow
                      key={option.id}
                      option={option}
                      selected={false}
                      onToggle={() => handleToggle(option)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        ) : (
          unselectedOptions.map((option) => (
            <OptionRow
              key={option.id}
              option={option}
              selected={false}
              onToggle={() => handleToggle(option)}
            />
          ))
        )}

        {filteredOptions.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {search ? `No options matching "${search}"` : 'No options available'}
          </p>
        )}
      </div>

      {/* Add custom option */}
      {allowCustom && onAddCustom && (
        <div className="border-t pt-2">
          {showCustomInput ? (
            <div className="flex gap-2">
              <Input
                placeholder="Enter custom option..."
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
                autoFocus
                className="flex-1"
              />
              <Button size="sm" onClick={handleAddCustom} disabled={!customText.trim()}>
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setShowCustomInput(false); setCustomText('') }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setShowCustomInput(true)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full px-2 py-1.5 rounded-md hover:bg-accent"
            >
              <Plus className="h-4 w-4" />
              Add custom option
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function OptionRow({
  option,
  selected,
  onToggle,
}: {
  option: SelectableOption
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'flex items-start gap-3 w-full text-left px-3 py-2.5 rounded-lg border transition-colors text-sm',
        selected
          ? 'bg-blue-50 border-blue-200 hover:bg-blue-100'
          : 'bg-white border-transparent hover:bg-accent hover:border-border'
      )}
    >
      <div
        className={cn(
          'flex-shrink-0 w-4 h-4 rounded border mt-0.5 flex items-center justify-center',
          selected ? 'bg-blue-600 border-blue-600' : 'border-input'
        )}
      >
        {selected && <Check className="h-3 w-3 text-white" />}
      </div>

      <div className="flex-1 min-w-0">
        <span className={cn('font-medium', selected ? 'text-blue-900' : 'text-foreground')}>
          {option.text}
        </span>
        {option.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{option.description}</p>
        )}
      </div>

      {(option.use_count ?? 0) > 0 && (
        <Badge variant="secondary" className="flex-shrink-0 text-xs">
          {option.use_count}x
        </Badge>
      )}
    </button>
  )
}
