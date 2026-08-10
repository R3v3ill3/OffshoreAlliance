'use client'

/**
 * Outreach → SMS sub-tab panel (4th sibling of Comms / Phone Ops / SOC,
 * modelled on InlinePhoneOpsPanel).
 *
 * Overview cards + blast table from vw_sms_campaign_summary, a "New
 * SMS blast" sheet (audience + composer), and a per-list detail sheet:
 * draft lists open the composer with Save / Queue; queued+ lists show
 * the funnel and per-recipient statuses with failure reasons, plus
 * pause / resume / cancel.
 *
 * Arriving with ?sms_list=<id> (the fire/sms redirect) auto-opens that
 * list's sheet.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api/fetch-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Loader2,
  MessageSquare,
  Pause,
  Play,
  Plus,
  Send,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useCreateSmsBlast,
  useSmsListAction,
  useSmsListDetail,
  useSmsLists,
  useUpdateSmsBlast,
  type SmsListDetail,
} from '@/lib/hooks/useSmsBroadcast'
import {
  SmsComposer,
  smsComposerBlockers,
  type SmsComposerValue,
} from '@/components/sms/SmsComposer'
import type { VwSmsCampaignSummaryRow } from '@/types/sms'
import { toDisplay } from '@/lib/phone/normalise-phone'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  queued: 'bg-indigo-100 text-indigo-700',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  paused: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-slate-100 text-slate-500',
}

const ITEM_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700',
  queued: 'bg-indigo-100 text-indigo-700',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  skipped: 'bg-slate-100 text-slate-500',
  opted_out: 'bg-amber-100 text-amber-800',
  blocked: 'bg-amber-100 text-amber-800',
}

const EMPTY_COMPOSER: SmsComposerValue = {
  body: '',
  sender_number_id: null,
  timezone: 'Australia/Perth',
  blackout_override: false,
  blackout_override_reason: '',
  scheduled_for: null,
}

/** datetime-local string → ISO (browser-local interpretation). */
function localToIso(local: string | null): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** ISO → datetime-local string for editing. */
function isoToLocal(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`
}

interface WorkerListOption {
  list_id: number
  name: string
  status: string
  items_count: { count: number }[] | null
}

interface InlineSmsOpsPanelProps {
  campaignId: string | number
}

export function InlineSmsOpsPanel({ campaignId }: InlineSmsOpsPanelProps) {
  const id = String(campaignId)
  const searchParams = useSearchParams()
  const { data: lists, isLoading } = useSmsLists(id)
  const [newOpen, setNewOpen] = useState(false)
  const [detailListId, setDetailListId] = useState<number | null>(null)

  // fire/sms redirect lands with ?sms_list=<id>.
  useEffect(() => {
    const raw = searchParams?.get('sms_list')
    const lid = raw ? parseInt(raw, 10) : NaN
    if (Number.isFinite(lid)) setDetailListId(lid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totals = useMemo(() => {
    const rows = lists ?? []
    const sum = (fn: (r: VwSmsCampaignSummaryRow) => number) =>
      rows.reduce((acc, r) => acc + fn(r), 0)
    return {
      blasts: rows.length,
      recipients: sum((r) => Number(r.item_count)),
      sent: sum((r) => Number(r.sent_count) + Number(r.delivered_count) + Number(r.failed_count)),
      delivered: sum((r) => Number(r.delivered_count)),
      failed: sum((r) => Number(r.failed_count)),
      optedOut: sum((r) => Number(r.opted_out_count) + Number(r.blocked_count)),
    }
  }, [lists])

  return (
    <div className="space-y-6">
      {/* Primary CTA */}
      <div className="flex items-center justify-between gap-3">
        <Button size="lg" onClick={() => setNewOpen(true)}>
          <MessageSquare className="h-5 w-5 mr-2" />
          New SMS blast
        </Button>
      </div>

      <div>
        <h3 className="font-semibold">SMS Broadcasts</h3>
        <p className="text-sm text-muted-foreground">
          Bulk SMS to campaign cohorts with delivery tracking. Replies and
          conversations arrive in a later phase.
        </p>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Blasts" value={totals.blasts} />
        <StatCard label="Recipients" value={totals.recipients} />
        <StatCard label="Sent" value={totals.sent} />
        <StatCard label="Delivered" value={totals.delivered} />
        <StatCard label="Failed" value={totals.failed} />
        <StatCard label="Opt-outs" value={totals.optedOut} />
      </div>

      {/* Blast table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : lists && lists.length > 0 ? (
        <div className="space-y-2">
          {lists.map((list) => (
            <BlastCard
              key={list.list_id}
              campaignId={id}
              list={list}
              onOpen={() => setDetailListId(list.list_id)}
            />
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-4 text-center">
            <MessageSquare className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              No SMS blasts yet. Start one here or fire a saved worker list into
              SMS from the wall chart.
            </p>
            <Button variant="outline" size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New SMS blast
            </Button>
          </CardContent>
        </Card>
      )}

      <NewBlastSheet
        campaignId={id}
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(listId) => {
          setNewOpen(false)
          setDetailListId(listId)
        }}
      />

      <ListDetailSheet
        campaignId={id}
        listId={detailListId}
        onOpenChange={(open) => {
          if (!open) setDetailListId(null)
        }}
      />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}

function BlastCard({
  campaignId,
  list,
  onOpen,
}: {
  campaignId: string
  list: VwSmsCampaignSummaryRow
  onOpen: () => void
}) {
  const action = useSmsListAction(campaignId)
  const dispatched =
    Number(list.sent_count) + Number(list.delivered_count) + Number(list.failed_count)
  const total = Number(list.total_items) || 0
  const progressPct = total > 0 ? Math.round((dispatched / total) * 100) : 0

  const runAction = (a: 'queue' | 'pause' | 'resume' | 'cancel') => {
    action.mutate(
      { listId: list.list_id, action: a },
      {
        onSuccess: (res) => {
          if (a === 'queue') {
            toast.success(`Queued ${res.queued ?? ''} messages for dispatch`)
          } else {
            toast.success(`Blast ${a === 'cancel' ? 'cancelled' : `${a}d`}`)
          }
        },
        onError: (err: Error) => toast.error(err.message),
      },
    )
  }

  return (
    <Card className="hover:bg-muted/30 transition-colors">
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <button type="button" className="flex-1 min-w-0 text-left" onClick={onOpen}>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium truncate">{list.list_name}</p>
              <Badge
                className={STATUS_COLORS[list.list_status] || ''}
                variant="secondary"
              >
                {list.list_status}
              </Badge>
              {list.blackout_override && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                  window override
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>
                {dispatched}/{total} sent
              </span>
              <span>{Number(list.delivered_count)} delivered</span>
              {Number(list.failed_count) > 0 && (
                <span className="text-red-600">
                  {Number(list.failed_count)} failed
                </span>
              )}
              {Number(list.opted_out_count) + Number(list.blocked_count) > 0 && (
                <span>
                  {Number(list.opted_out_count) + Number(list.blocked_count)} opted
                  out
                </span>
              )}
              {list.scheduled_for && list.list_status === 'queued' && (
                <span>scheduled {new Date(list.scheduled_for).toLocaleString()}</span>
              )}
            </div>
            {total > 0 && list.list_status !== 'draft' && (
              <Progress value={progressPct} className="h-1 mt-2" />
            )}
          </button>
          <div className="flex items-center gap-1">
            {list.list_status === 'draft' && (
              <Button size="sm" onClick={onOpen}>
                <Send className="h-3 w-3 mr-1" />
                Compose
              </Button>
            )}
            {(list.list_status === 'queued' || list.list_status === 'sending') && (
              <Button
                size="sm"
                variant="ghost"
                title="Pause"
                disabled={action.isPending}
                onClick={() => runAction('pause')}
              >
                <Pause className="h-3 w-3" />
              </Button>
            )}
            {list.list_status === 'paused' && (
              <Button
                size="sm"
                variant="ghost"
                title="Resume"
                disabled={action.isPending}
                onClick={() => runAction('resume')}
              >
                <Play className="h-3 w-3" />
              </Button>
            )}
            {['draft', 'queued', 'sending', 'paused'].includes(list.list_status) && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                title="Cancel blast"
                disabled={action.isPending}
                onClick={() => runAction('cancel')}
              >
                <XCircle className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function NewBlastSheet({
  campaignId,
  open,
  onOpenChange,
  onCreated,
}: {
  campaignId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (listId: number) => void
}) {
  const [name, setName] = useState('')
  const [audience, setAudience] = useState<string>('campaign')
  const [composer, setComposer] = useState<SmsComposerValue>(EMPTY_COMPOSER)
  const create = useCreateSmsBlast(campaignId)

  const { data: workerLists } = useQuery({
    queryKey: ['worker-lists-for-sms', campaignId],
    queryFn: async () => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/worker-lists`)
      if (!res.ok) throw new Error('Failed to fetch worker lists')
      return res.json() as Promise<WorkerListOption[]>
    },
    enabled: open,
  })

  const submit = () => {
    if (!name.trim()) {
      toast.error('Give the blast a name')
      return
    }
    create.mutate(
      {
        name,
        body: composer.body,
        sender_number_id: composer.sender_number_id ?? undefined,
        timezone: composer.timezone,
        blackout_override: composer.blackout_override,
        blackout_override_reason: composer.blackout_override_reason,
        scheduled_for: localToIso(composer.scheduled_for),
        audience:
          audience === 'campaign'
            ? { type: 'campaign' }
            : { type: 'worker_list', worker_list_id: Number(audience) },
      },
      {
        onSuccess: (res) => {
          const notes: string[] = []
          if (res.opted_out > 0) notes.push(`${res.opted_out} opted out`)
          if (res.skipped_no_phone > 0) notes.push(`${res.skipped_no_phone} without a mobile`)
          toast.success(
            `Blast created — ${res.total_items} recipients${
              notes.length ? ` (${notes.join(', ')} excluded)` : ''
            }`,
          )
          setName('')
          setComposer(EMPTY_COMPOSER)
          onCreated(res.sms_list_id)
        },
        onError: (err: Error) => toast.error(err.message),
      },
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>New SMS blast</SheetTitle>
          <SheetDescription>
            Pick the audience, write the message, then queue it from the blast
            card. Opted-out workers and workers without a mobile are excluded
            automatically.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 pb-8">
          <div className="space-y-1.5">
            <Label htmlFor="sms-blast-name">Name</Label>
            <Input
              id="sms-blast-name"
              placeholder="e.g. EBA meeting reminder"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Audience</Label>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="campaign">
                  Whole campaign (all members)
                </SelectItem>
                {(workerLists ?? []).map((wl) => (
                  <SelectItem key={wl.list_id} value={String(wl.list_id)}>
                    List: {wl.name} ({wl.items_count?.[0]?.count ?? 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <SmsComposer
            campaignId={campaignId}
            value={composer}
            onChange={setComposer}
          />

          <Button
            className="w-full"
            disabled={create.isPending || !name.trim()}
            onClick={submit}
          >
            {create.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Create blast
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ListDetailSheet({
  campaignId,
  listId,
  onOpenChange,
}: {
  campaignId: string
  listId: number | null
  onOpenChange: (open: boolean) => void
}) {
  const { data: detail, isLoading } = useSmsListDetail(campaignId, listId)

  return (
    <Sheet open={listId != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {isLoading || !detail ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : detail.list.status === 'draft' ? (
          <DraftDetail campaignId={campaignId} detail={detail} />
        ) : (
          <SentDetail detail={detail} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function DraftDetail({
  campaignId,
  detail,
}: {
  campaignId: string
  detail: SmsListDetail
}) {
  const update = useUpdateSmsBlast(campaignId)
  const action = useSmsListAction(campaignId)
  const [composer, setComposer] = useState<SmsComposerValue>({
    body: detail.draft?.body ?? '',
    sender_number_id: detail.list.sender_number_id,
    timezone: detail.list.timezone || 'Australia/Perth',
    blackout_override: detail.list.blackout_override,
    blackout_override_reason: detail.list.blackout_override_reason ?? '',
    scheduled_for: isoToLocal(detail.list.scheduled_for),
  })

  const blockers = smsComposerBlockers(composer)
  const pendingCount = detail.items.filter((i) => i.status === 'pending').length

  const save = (then?: () => void) => {
    update.mutate(
      {
        listId: detail.list.list_id,
        body: composer.body,
        sender_number_id: composer.sender_number_id,
        timezone: composer.timezone,
        blackout_override: composer.blackout_override,
        blackout_override_reason: composer.blackout_override_reason || null,
        scheduled_for: localToIso(composer.scheduled_for),
      },
      {
        onSuccess: () => then?.(),
        onError: (err: Error) => toast.error(err.message),
      },
    )
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{detail.list.name}</SheetTitle>
        <SheetDescription>
          Draft blast — {pendingCount} sendable recipient
          {pendingCount === 1 ? '' : 's'}
          {detail.items.length !== pendingCount &&
            ` (${detail.items.length - pendingCount} excluded)`}
          .
        </SheetDescription>
      </SheetHeader>
      <div className="mt-4 space-y-4 pb-8">
        <SmsComposer
          campaignId={campaignId}
          value={composer}
          onChange={setComposer}
          disabled={update.isPending || action.isPending}
        />

        {blockers.length > 0 && (
          <ul className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={update.isPending}
            onClick={() => save(() => toast.success('Draft saved'))}
          >
            {update.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save draft
          </Button>
          <Button
            className="flex-1"
            disabled={update.isPending || action.isPending || blockers.length > 0}
            onClick={() =>
              save(() =>
                action.mutate(
                  { listId: detail.list.list_id, action: 'queue' },
                  {
                    onSuccess: (res) =>
                      toast.success(`Queued ${res.queued} messages for dispatch`),
                    onError: (err: Error) => toast.error(err.message),
                  },
                ),
              )
            }
          >
            {action.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Queue for sending
          </Button>
        </div>

        <ItemsTable detail={detail} />
      </div>
    </>
  )
}

function SentDetail({ detail }: { detail: SmsListDetail }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const it of detail.items) c[it.status] = (c[it.status] ?? 0) + 1
    return c
  }, [detail.items])

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {detail.list.name}
          <Badge
            className={STATUS_COLORS[detail.list.status] || ''}
            variant="secondary"
          >
            {detail.list.status}
          </Badge>
        </SheetTitle>
        <SheetDescription>
          {detail.items.length} recipients
          {detail.list.blackout_override &&
            ` — send-window override recorded: ${
              detail.list.blackout_override_reason ?? 'no reason given'
            }`}
        </SheetDescription>
      </SheetHeader>
      <div className="mt-4 space-y-4 pb-8">
        {detail.draft?.body && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
            {detail.draft.body}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(counts).map(([status, n]) => (
            <Badge
              key={status}
              variant="secondary"
              className={ITEM_STATUS_COLORS[status] || ''}
            >
              {status.replace('_', ' ')}: {n}
            </Badge>
          ))}
        </div>
        <ItemsTable detail={detail} />
      </div>
    </>
  )
}

function ItemsTable({ detail }: { detail: SmsListDetail }) {
  return (
    <div className="rounded-md border divide-y max-h-96 overflow-y-auto">
      {detail.items.map((it) => (
        <div key={it.item_id} className="flex items-center gap-2 px-3 py-2 text-sm">
          <div className="flex-1 min-w-0">
            <p className="truncate font-medium">{it.worker_name}</p>
            <p className="text-xs text-muted-foreground">
              {it.phone_e164 ? toDisplay(it.phone_e164) : 'no mobile'}
              {it.failure_reason && (
                <span className="text-red-600"> — {it.failure_reason}</span>
              )}
            </p>
          </div>
          <Badge
            variant="secondary"
            className={ITEM_STATUS_COLORS[it.status] || ''}
          >
            {it.status.replace('_', ' ')}
          </Badge>
        </div>
      ))}
      {detail.items.length === 0 && (
        <p className="p-3 text-sm text-muted-foreground">No recipients.</p>
      )}
    </div>
  )
}
