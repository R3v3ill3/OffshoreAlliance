'use client'

/**
 * One table for every SMS action, whatever its kind or scope. Filters
 * are chips (kind, status bucket) plus a scope selector the parent
 * owns (it lives in the URL), so a link can land on "standalone,
 * live" or "campaign 12, finished".
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNowStrict } from 'date-fns'
import {
  Copy,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Search,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils/cn'
import { toDisplay } from '@/lib/phone/normalise-phone'
import {
  SMS_ACTION_KIND_LABEL,
  SMS_ACTION_KINDS,
  SMS_STATUS_GROUP_LABEL,
  smsActionCampaignHref,
  smsActionStatusGroup,
  smsActionStatusLabel,
  type SmsActionKind,
  type SmsActionRef,
  type SmsActionStatusGroup,
} from '@/lib/sms/hub-actions'
import type { SmsActivityRow } from '@/lib/hooks/useSmsHub'
import { SMS_ACTION_KIND_META } from './SmsActionKindPicker'

export const STATUS_TONE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  queued: 'bg-sky-100 text-sky-800',
  sending: 'bg-sky-100 text-sky-800',
  open: 'bg-emerald-100 text-emerald-800',
  active: 'bg-emerald-100 text-emerald-800',
  sent: 'bg-blue-100 text-blue-800',
  paused: 'bg-amber-100 text-amber-800',
  closed: 'bg-slate-100 text-slate-500',
  ended: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-rose-100 text-rose-800',
}

export function rowToRef(row: SmsActivityRow): SmsActionRef {
  return row.kind === 'relay'
    ? { kind: 'relay', id: row.id }
    : { kind: row.kind, campaignId: row.campaign_id as number, id: row.id }
}

export function scopeLabel(row: Pick<SmsActivityRow, 'scope' | 'campaign_name'>): string {
  if (row.scope === 'standalone') return 'Standalone'
  if (row.scope === 'org') return 'Org-wide'
  return row.campaign_name ?? 'Campaign'
}

function progressLabel(row: SmsActivityRow): string {
  switch (row.kind) {
    case 'survey':
      return `${row.question_count ?? 0}q · ${row.progress_count}/${row.audience_count} completed`
    case 'relay':
      return `${row.progress_count}/${row.audience_count} target${row.audience_count === 1 ? '' : 's'} active`
    default:
      return `${row.progress_count}/${row.audience_count} messaged`
  }
}

export function SmsActionsTable({
  rows,
  isLoading = false,
  canWrite = false,
  onOpen,
  onDuplicate,
  scopeControl,
  emptyHint,
}: {
  rows: SmsActivityRow[]
  isLoading?: boolean
  canWrite?: boolean
  onOpen: (row: SmsActivityRow) => void
  onDuplicate: (row: SmsActivityRow) => void
  /** Scope selector rendered in the filter row (owned by the parent). */
  scopeControl?: React.ReactNode
  emptyHint?: React.ReactNode
}) {
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<SmsActionKind | 'all'>('all')
  const [group, setGroup] = useState<SmsActionStatusGroup | 'all'>('all')

  const counts = useMemo(() => {
    const byKind: Record<string, number> = { all: rows.length }
    const byGroup: Record<string, number> = { all: rows.length }
    for (const r of rows) {
      byKind[r.kind] = (byKind[r.kind] ?? 0) + 1
      const g = smsActionStatusGroup(r.kind, r.status)
      byGroup[g] = (byGroup[g] ?? 0) + 1
    }
    return { byKind, byGroup }
  }, [rows])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows
      .filter((r) => kind === 'all' || r.kind === kind)
      .filter((r) => group === 'all' || smsActionStatusGroup(r.kind, r.status) === group)
      .filter(
        (r) =>
          !term ||
          r.name.toLowerCase().includes(term) ||
          (r.campaign_name ?? '').toLowerCase().includes(term) ||
          (r.sender_phone ?? '').includes(term) ||
          (r.sender_label ?? '').toLowerCase().includes(term),
      )
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }, [rows, kind, group, search])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-xs"
            placeholder="Search by name, campaign or number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search SMS actions"
          />
        </div>
        {scopeControl}
        {isLoading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ChipRow
          label="Kind"
          value={kind}
          onChange={(v) => setKind(v as SmsActionKind | 'all')}
          options={[
            { value: 'all', label: 'All', count: counts.byKind.all ?? 0 },
            ...SMS_ACTION_KINDS.map((k) => ({
              value: k,
              label: k === 'chat' ? 'Chats' : `${SMS_ACTION_KIND_LABEL[k]}s`,
              count: counts.byKind[k] ?? 0,
            })),
          ]}
        />
        <ChipRow
          label="Status"
          value={group}
          onChange={(v) => setGroup(v as SmsActionStatusGroup | 'all')}
          options={[
            { value: 'all', label: 'Any', count: counts.byGroup.all ?? 0 },
            ...(['live', 'pending', 'finished'] as SmsActionStatusGroup[]).map((g) => ({
              value: g,
              label: SMS_STATUS_GROUP_LABEL[g],
              count: counts.byGroup[g] ?? 0,
            })),
          ]}
        />
      </div>

      {!isLoading && visible.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? (emptyHint ?? 'No SMS actions yet.') : 'Nothing matches these filters.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-56">Action</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead className="whitespace-nowrap">Updated</TableHead>
                <TableHead className="w-10 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => {
                const meta = SMS_ACTION_KIND_META[row.kind]
                const status = smsActionStatusLabel(row.kind, row.status)
                const ref = rowToRef(row)
                const campaignHref =
                  row.scope === 'campaign'
                    ? smsActionCampaignHref(ref, row.campaign_id)
                    : null
                return (
                  <TableRow
                    key={`${row.kind}:${row.id}`}
                    className="cursor-pointer"
                    onClick={() => onOpen(row)}
                  >
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        <meta.icon className={cn('h-4 w-4 shrink-0', meta.tone)} aria-hidden />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {meta.label}
                            {row.is_test ? ' · test' : ''}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge
                          variant="secondary"
                          className={cn('text-[10px]', STATUS_TONE[status] ?? '')}
                        >
                          {status}
                        </Badge>
                        {(row.pending_moderation_count ?? 0) > 0 && (
                          <Badge
                            variant="secondary"
                            className="bg-amber-100 text-[10px] text-amber-800"
                          >
                            {row.pending_moderation_count} to review
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-48">
                      <span
                        className={cn(
                          'block truncate text-xs',
                          row.scope !== 'campaign' && 'text-muted-foreground',
                        )}
                      >
                        {scopeLabel(row)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {row.sender_phone ? (
                        <>
                          <span className="font-mono">{toDisplay(row.sender_phone)}</span>
                          {row.sender_label && (
                            <span className="ml-1 text-muted-foreground">{row.sender_label}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {progressLabel(row)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[11px] text-muted-foreground">
                      {formatDistanceToNowStrict(new Date(row.updated_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            aria-label={`Actions for ${row.name}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => onOpen(row)}>
                            {row.kind === 'chat' ? 'Open board' : 'Open'}
                          </DropdownMenuItem>
                          {canWrite && (
                            <DropdownMenuItem onSelect={() => onDuplicate(row)}>
                              <Copy className="mr-2 h-3.5 w-3.5" />
                              Duplicate…
                            </DropdownMenuItem>
                          )}
                          {campaignHref && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <Link href={campaignHref}>
                                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                                  Open in campaign
                                </Link>
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function ChipRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string; count: number }>
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      <span className="mr-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {options.map((o) => (
        <Button
          key={o.value}
          type="button"
          size="sm"
          variant={value === o.value ? 'secondary' : 'outline'}
          className="h-7 gap-1 px-2 text-xs"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          <span className="text-[10px] text-muted-foreground">{o.count}</span>
        </Button>
      ))}
    </div>
  )
}
