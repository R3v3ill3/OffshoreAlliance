'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

export interface WashListOverlap {
  list_id: number
  name: string
  kind: 'worker_list' | 'sms_list'
  overlap_ids: number[]
}

export function washListKey(list: WashListOverlap): string {
  return `${list.kind}:${list.list_id}`
}

export function idsExcludedByWash(
  lists: WashListOverlap[],
  selectedKeys: Set<string>,
): Set<number> {
  const excluded = new Set<number>()
  for (const list of lists) {
    if (!selectedKeys.has(washListKey(list))) continue
    for (const id of list.overlap_ids) excluded.add(id)
  }
  return excluded
}

export function AudienceWashLists({
  lists,
  selectedKeys,
  onChange,
  disabled,
}: {
  lists: WashListOverlap[]
  selectedKeys: Set<string>
  onChange: (next: Set<string>) => void
  disabled?: boolean
}) {
  if (lists.length === 0) return null

  const toggle = (key: string, checked: boolean) => {
    const next = new Set(selectedKeys)
    if (checked) next.add(key)
    else next.delete(key)
    onChange(next)
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">Wash against existing lists</p>
      <p className="text-xs text-muted-foreground">
        Exclude people already on the lists you tick. New contacts are kept.
      </p>
      <div className="max-h-40 space-y-1.5 overflow-y-auto">
        {lists.map((list) => {
          const key = washListKey(list)
          return (
            <label
              key={key}
              className="flex items-start gap-2 text-sm cursor-pointer"
            >
              <Checkbox
                checked={selectedKeys.has(key)}
                disabled={disabled}
                onCheckedChange={(v) => toggle(key, v === true)}
              />
              <span className="min-w-0 leading-snug">
                <span className="font-medium">{list.name}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {list.overlap_ids.length} overlap
                  {list.kind === 'sms_list' ? ' (SMS)' : ''}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
