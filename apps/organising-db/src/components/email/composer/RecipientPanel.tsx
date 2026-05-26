'use client'

/**
 * RecipientPanel — collapsible drawer at the bottom of the composer
 * showing the email's recipient list. Reuses the email_list_items
 * source when a list is pre-attached, falls back to campaign
 * membership otherwise.
 *
 * Sticky live count is rendered by the parent in SendActions; this panel
 * focuses on selection management.
 */

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ChevronDown, ChevronUp, Users, Settings, Search, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface RecipientRow {
  worker_id: number
  first_name: string
  last_name: string
  email: string | null
  occupation: string | null
  employer_name: string | null
  worksite_name: string | null
  source_label: string
  /** Set to 'invalid' when a bounce has been detected for this address. */
  email_status?: string | null
}

interface Props {
  recipients: RecipientRow[]
  isLoading: boolean
  selectedIds: Set<number>
  onChangeSelected: (next: Set<number>) => void
  emailListId: number | null
  onEditSetup?: () => void
  defaultOpen?: boolean
}

export function RecipientPanel({
  recipients,
  isLoading,
  selectedIds,
  onChangeSelected,
  emailListId,
  onEditSetup,
  defaultOpen,
}: Props) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const [search, setSearch] = useState('')
  const [includeBounced, setIncludeBounced] = useState(false)

  const bouncedCount = useMemo(
    () => recipients.filter((r) => r.email_status === 'invalid').length,
    [recipients],
  )

  // Apply bounce filter before passing to other derived lists.
  const visibleRecipients = useMemo(
    () =>
      includeBounced
        ? recipients
        : recipients.filter((r) => r.email_status !== 'invalid'),
    [recipients, includeBounced],
  )

  const withEmail = useMemo(
    () => visibleRecipients.filter((r) => r.email && r.email.trim()),
    [visibleRecipients],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return visibleRecipients
    return visibleRecipients.filter((r) => {
      const hay =
        `${r.first_name} ${r.last_name} ${r.email ?? ''} ${r.employer_name ?? ''} ${r.worksite_name ?? ''} ${r.occupation ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [visibleRecipients, search])

  const selectedCount = selectedIds.size
  const totalWithEmail = withEmail.length

  return (
    <div className="border rounded-md bg-card">
      <div className="flex items-center gap-2 px-4 py-2 text-sm">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left"
          aria-expanded={open}
          aria-controls="recipient-panel-body"
        >
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}
          <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="font-medium">Recipients</span>
          <Badge variant="secondary" className="text-xs">
            {selectedCount} of {totalWithEmail} selected
          </Badge>
          {emailListId ? (
            <span className="text-xs text-muted-foreground truncate">
              Source: list #{emailListId}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground truncate">
              Source: campaign membership
            </span>
          )}
        </button>
        {onEditSetup && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1 flex-shrink-0"
            onClick={onEditSetup}
          >
            <Settings className="h-3 w-3" />
            Setup
          </Button>
        )}
      </div>

      {open && (
        <div id="recipient-panel-body" className="border-t px-4 py-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search recipients…"
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() =>
                onChangeSelected(new Set(withEmail.map((w) => w.worker_id)))
              }
              disabled={isLoading}
            >
              Select all with email
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onChangeSelected(new Set())}
              disabled={isLoading || selectedCount === 0}
            >
              Deselect all
            </Button>
          </div>

          {bouncedCount > 0 && (
            <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
              <span className="text-amber-800 flex-1">
                {bouncedCount} worker{bouncedCount === 1 ? '' : 's'} with
                bounced email{bouncedCount === 1 ? '' : 's'} excluded.
              </span>
              <div className="flex items-center gap-1.5">
                <Switch
                  id="include-bounced"
                  checked={includeBounced}
                  onCheckedChange={setIncludeBounced}
                  className="h-4 w-7"
                />
                <Label htmlFor="include-bounced" className="text-xs cursor-pointer">
                  Include
                </Label>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : recipients.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              No recipients available. Use &ldquo;Setup&rdquo; above to attach a
              list or build one from the wall chart.
            </div>
          ) : (
            <div className="max-h-72 overflow-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs sticky top-0">
                  <tr>
                    <th className="w-10 p-2"></th>
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2">Email</th>
                    <th className="text-left p-2 hidden md:table-cell">
                      Employer / Worksite
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const has = !!r.email && r.email.trim() !== ''
                    const isBounced = r.email_status === 'invalid'
                    const selected = selectedIds.has(r.worker_id)
                    return (
                      <tr
                        key={r.worker_id}
                        className={cn(
                          'border-t hover:bg-muted/30',
                          !has && 'opacity-50',
                          isBounced && 'bg-destructive/5',
                        )}
                      >
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={!has}
                            onChange={() => {
                              const next = new Set(selectedIds)
                              if (next.has(r.worker_id)) next.delete(r.worker_id)
                              else if (has) next.add(r.worker_id)
                              onChangeSelected(next)
                            }}
                            className="h-3.5 w-3.5 accent-primary"
                            aria-label={`Select ${r.first_name} ${r.last_name}`}
                          />
                        </td>
                        <td className="p-2">
                          <p className="truncate max-w-[200px]">
                            {r.first_name} {r.last_name}
                          </p>
                          {r.occupation && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              {r.occupation}
                            </p>
                          )}
                        </td>
                        <td className="p-2 truncate max-w-[220px] text-xs">
                          {isBounced ? (
                            <span className="text-destructive flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                              {r.email ?? '—'}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {r.email ?? '—'}
                            </span>
                          )}
                        </td>
                        <td className="p-2 truncate max-w-[260px] text-xs text-muted-foreground hidden md:table-cell">
                          {r.employer_name ?? '—'}
                          {r.worksite_name ? ` · ${r.worksite_name}` : ''}
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="p-6 text-center text-sm text-muted-foreground"
                      >
                        No recipients match &ldquo;{search}&rdquo;.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
