'use client'

/**
 * One table for every action, whatever its channel or scope. Filters
 * are chips — owner (Mine / All), kind, status bucket — plus a scope
 * selector and a search box. The parent owns every filter value
 * because they all live in the URL, so a link can land on "mine,
 * live" or "campaign 12, finished".
 *
 * A blast that is a launch text says so under its name and offers its
 * relay in the row menu — the two are one piece of work. Archive,
 * un-archive and delete are offered for SMS rows only: no other source
 * table has an archived_at column, and deletion of an email list or a
 * call list belongs to the surface that owns it.
 */
import Link from 'next/link'
import { useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import {
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  ClipboardList,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  MessagesSquare,
  MoreHorizontal,
  Phone,
  Search,
  Send,
  Trash2,
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
  scopeLabelFor,
  HUB_ACTION_BUCKETS,
  HUB_ACTION_KINDS,
  HUB_BUCKET_LABEL,
  HUB_KIND_LABEL,
  type HubActionBucket,
  type HubActionKind,
  type HubActionRow,
} from '@/lib/actions/hub-rows'
import { ShowArchivedToggle, SmsActionOpsLauncher } from '@/components/sms/SmsArchiveDeleteControls'

export const STATUS_TONE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  generating: 'bg-slate-100 text-slate-700',
  approved: 'bg-slate-100 text-slate-700',
  queued: 'bg-sky-100 text-sky-800',
  sending: 'bg-sky-100 text-sky-800',
  open: 'bg-emerald-100 text-emerald-800',
  active: 'bg-emerald-100 text-emerald-800',
  sent: 'bg-blue-100 text-blue-800',
  completed: 'bg-blue-100 text-blue-800',
  paused: 'bg-amber-100 text-amber-800',
  closed: 'bg-slate-100 text-slate-500',
  ended: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-rose-100 text-rose-800',
  failed: 'bg-rose-100 text-rose-800',
  archived: 'bg-slate-200 text-slate-600',
}

/**
 * Icon and tone per kind. The four SMS entries match
 * SMS_ACTION_KIND_META; email and calls use the same two icons the
 * campaigns strip used for its Email and Phone wizard links, so the
 * association survives the move.
 */
export const HUB_KIND_META: Record<
  HubActionKind,
  { icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  sms_blast: { icon: Send, tone: 'text-blue-500' },
  sms_chat: { icon: MessagesSquare, tone: 'text-emerald-500' },
  sms_survey: { icon: ClipboardList, tone: 'text-purple-500' },
  sms_relay: { icon: ArrowRightLeft, tone: 'text-amber-500' },
  email_send: { icon: Mail, tone: 'text-sky-500' },
  call_list: { icon: Phone, tone: 'text-rose-500' },
}

export interface ActionsTableFilters {
  mine: boolean
  kind: HubActionKind | 'all'
  bucket: HubActionBucket | 'all'
  search: string
}

export function ActionsTable({
  rows,
  totalRows,
  isLoading = false,
  canWrite = false,
  filters,
  counts,
  onMineChange,
  onKindChange,
  onBucketChange,
  onSearchChange,
  onOpen,
  onDuplicate,
  onOpenRelay,
  scopeControl,
  emptyHint,
  showArchived = false,
  onShowArchivedChange,
  archivedTotal = 0,
  unknownOwnerCount = 0,
}: {
  /** Already filtered and sorted by the parent. */
  rows: HubActionRow[]
  /** Everything the parent has before its filters — tells "empty" from "no match". */
  totalRows: number
  isLoading?: boolean
  canWrite?: boolean
  filters: ActionsTableFilters
  counts: {
    byKind: Record<string, number>
    byBucket: Record<string, number>
    /**
     * Archived rows are only fetched on demand. While they are not,
     * the Archived chip shows "…" rather than a number that would be
     * the one count ignoring the filters the others respect.
     */
    archivedUnknown?: boolean
  }
  onMineChange: (mine: boolean) => void
  onKindChange: (kind: HubActionKind | 'all') => void
  onBucketChange: (bucket: HubActionBucket | 'all') => void
  onSearchChange: (search: string) => void
  onOpen: (row: HubActionRow) => void
  onDuplicate: (row: HubActionRow) => void
  /** Open the relay a launch text belongs to (the parent owns the sheet). */
  onOpenRelay?: (relayId: number) => void
  /** Scope selector rendered in the filter row (owned by the parent). */
  scopeControl?: React.ReactNode
  emptyHint?: React.ReactNode
  showArchived?: boolean
  onShowArchivedChange?: (next: boolean) => void
  /** SMS only — no other source table has an archived_at column. */
  archivedTotal?: number
  /** Rows hidden by "Mine" because nobody is recorded as their owner. */
  unknownOwnerCount?: number
}) {
  const [ops, setOps] = useState<{
    row: HubActionRow
    intent: 'archive' | 'unarchive' | 'delete'
  } | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-xs"
            placeholder="Search by name, campaign or number…"
            value={filters.search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search actions"
          />
        </div>
        {scopeControl}
        {onShowArchivedChange && (
          <ShowArchivedToggle
            checked={showArchived}
            onCheckedChange={(next) => {
              onShowArchivedChange(next)
              if (!next && filters.bucket === 'archived') onBucketChange('all')
            }}
            archivedCount={archivedTotal}
          />
        )}
        {isLoading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Owner first: it is the default that hides the most, so it is
            the first thing an organiser should be able to see and undo. */}
        <ChipRow
          label="Owner"
          value={filters.mine ? 'mine' : 'all'}
          onChange={(v) => onMineChange(v === 'mine')}
          options={[
            { value: 'mine', label: 'Mine' },
            { value: 'all', label: 'All' },
          ]}
        />
        <ChipRow
          label="Kind"
          value={filters.kind}
          onChange={(v) => onKindChange(v as HubActionKind | 'all')}
          options={[
            { value: 'all', label: 'All', count: counts.byKind.all ?? 0 },
            ...HUB_ACTION_KINDS.map((k) => ({
              value: k,
              label: HUB_KIND_LABEL[k],
              count: counts.byKind[k] ?? 0,
            })),
          ]}
        />
        <ChipRow
          label="Status"
          value={filters.bucket}
          onChange={(v) => {
            const next = v as HubActionBucket | 'all'
            if (next === 'archived' && !showArchived) onShowArchivedChange?.(true)
            onBucketChange(next)
          }}
          options={[
            ...HUB_ACTION_BUCKETS.map((b) => ({
              value: b,
              label: HUB_BUCKET_LABEL[b],
              count:
                b === 'archived' && counts.archivedUnknown
                  ? '…'
                  : (counts.byBucket[b] ?? 0),
            })),
            { value: 'all', label: 'All', count: counts.byBucket.all ?? 0 },
          ]}
        />
      </div>

      {filters.mine && unknownOwnerCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {unknownOwnerCount} older action{unknownOwnerCount === 1 ? ' has' : 's have'} no
          recorded owner.{' '}
          <button
            type="button"
            className="underline underline-offset-4"
            onClick={() => onMineChange(false)}
          >
            Switch to All
          </button>{' '}
          to see {unknownOwnerCount === 1 ? 'it' : 'them'}.
        </p>
      )}

      {!isLoading && rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {totalRows === 0 ? (emptyHint ?? 'No actions yet.') : 'Nothing matches these filters.'}
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
              {rows.map((row) => {
                const meta = HUB_KIND_META[row.kind]
                const isSms = row.smsRef != null
                return (
                  <TableRow
                    key={row.key}
                    className="cursor-pointer"
                    onClick={() => onOpen(row)}
                  >
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        <meta.icon className={cn('h-4 w-4 shrink-0', meta.tone)} aria-hidden />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {row.subtitle}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge
                          variant="secondary"
                          className={cn('text-[10px]', STATUS_TONE[row.statusLabel] ?? '')}
                        >
                          {row.statusLabel}
                        </Badge>
                        {row.pendingModerationCount > 0 && (
                          <Badge
                            variant="secondary"
                            className="bg-amber-100 text-[10px] text-amber-800"
                          >
                            {row.pendingModerationCount} to review
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-48">
                      <span
                        className={cn(
                          'block truncate text-xs',
                          row.scope.kind !== 'campaign' && 'text-muted-foreground',
                        )}
                      >
                        {scopeLabelFor(row.scope)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {row.senderPhone ? (
                        <>
                          <span className="font-mono">{toDisplay(row.senderPhone)}</span>
                          {row.senderLabel && (
                            <span className="ml-1 text-muted-foreground">{row.senderLabel}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {row.results}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[11px] text-muted-foreground">
                      {formatDistanceToNowStrict(new Date(row.updatedAt), { addSuffix: true })}
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
                            {row.kind === 'sms_chat' ? 'Open board' : 'Open'}
                          </DropdownMenuItem>
                          {canWrite && isSms && (
                            <DropdownMenuItem onSelect={() => onDuplicate(row)}>
                              <Copy className="mr-2 h-3.5 w-3.5" />
                              Duplicate…
                            </DropdownMenuItem>
                          )}
                          {row.relayId != null && onOpenRelay && (
                            <DropdownMenuItem
                              onSelect={() => onOpenRelay(row.relayId as number)}
                            >
                              <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
                              Open relay
                            </DropdownMenuItem>
                          )}
                          {canWrite && isSms && (
                            <>
                              <DropdownMenuSeparator />
                              {row.archivedAt ? (
                                <DropdownMenuItem
                                  onSelect={() => setOps({ row, intent: 'unarchive' })}
                                >
                                  <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
                                  Un-archive
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onSelect={() => setOps({ row, intent: 'archive' })}
                                >
                                  <Archive className="mr-2 h-3.5 w-3.5" />
                                  Archive
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={() => setOps({ row, intent: 'delete' })}
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                          {row.campaignHref && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <Link href={row.campaignHref}>
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
      {rows.length > 0 && (
        // The routes cap each channel's read, so a very long history is
        // not all here. Said out loud rather than left to be noticed.
        <p className="text-[11px] text-muted-foreground">
          Showing the latest 200 actions per channel. Older ones stay where they live.
        </p>
      )}
      {ops && ops.row.smsRef && (
        <SmsActionOpsLauncher
          kind={ops.row.smsRef.kind}
          id={ops.row.smsRef.id}
          campaignId={
            ops.row.scope.kind === 'campaign'
              ? ops.row.scope.campaignId
              : ops.row.smsRef.kind === 'relay'
                ? null
                : ops.row.smsRef.campaignId
          }
          intent={ops.intent}
          onClose={() => setOps(null)}
        />
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
  /** `count` is a string when the number is not yet knowable ("…"). */
  options: Array<{ value: string; label: string; count?: number | string }>
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
          {o.count != null && (
            <span className="text-[10px] text-muted-foreground">{o.count}</span>
          )}
        </Button>
      ))}
    </div>
  )
}
