'use client'

/**
 * Number allocations — which platform number is doing what.
 *
 * One row per number: purpose and owner, whether replies can land in
 * OA, what is live on it right now, what is set up and waiting, how
 * many inbox threads sit on it, and (expanded) the history. Admins
 * reassign purpose / organiser and retire numbers here; everyone
 * else reads. Adding a number stays in Administration → SMS.
 */
import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNowStrict } from 'date-fns'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Settings,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchApi } from '@/lib/api/fetch-api'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'
import { useSmsNumbers, SMS_NUMBERS_QUERY_KEY } from '@/lib/hooks/useSmsHub'
import { toDisplay } from '@/lib/phone/normalise-phone'
import { cn } from '@/lib/utils/cn'
import { smsActionHref, smsActionStatusLabel } from '@/lib/sms/hub-actions'
import type { SmsNumberActionRef, SmsNumberAllocationRow } from '@/app/api/sms/numbers/route'
import { SmsHubHeader } from './SmsHubNav'
import { SMS_ACTION_KIND_META } from './SmsActionKindPicker'
import { STATUS_TONE } from './SmsActionsTable'

const PURPOSES = ['organiser', 'relay', 'survey', 'spare'] as const

const PURPOSE_TONE: Record<string, string> = {
  organiser: 'bg-blue-100 text-blue-800',
  relay: 'bg-amber-100 text-amber-800',
  survey: 'bg-purple-100 text-purple-800',
  spare: 'bg-slate-100 text-slate-700',
}

const PURPOSE_HELP: Record<string, string> = {
  organiser: 'Blasts and chat boards send from it; replies land in that organiser’s inbox.',
  relay: 'Reserved for one live relay at a time.',
  survey: 'Reserved for survey sessions so answers never mix with inbox threads.',
  spare: 'Unassigned. Relays draw from this pool.',
}

/** Something worth a glance on this row. */
function attention(n: SmsNumberAllocationRow): string | null {
  if (n.status !== 'active') {
    return n.live.length > 0 ? 'Retired while something is still live on it' : null
  }
  const liveKinds = new Set(n.live.map((a) => a.kind))
  if (n.purpose === 'organiser' && (liveKinds.has('survey') || liveKinds.has('relay'))) {
    return 'A live survey or relay is claiming this inbox number — replies are routed to it, not the inbox'
  }
  if ((n.purpose === 'relay' || n.purpose === 'survey') && n.live.length === 0 && n.pending.length === 0) {
    return `Reserved for ${n.purpose}s but nothing is set up on it`
  }
  if (n.supports_inbound === false && (n.purpose !== 'spare' || n.live.length > 0)) {
    return 'The provider says replies to this number cannot reach OA'
  }
  return null
}

export function SmsNumbersPage() {
  const { data, isLoading, error } = useSmsNumbers()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const numbers = useMemo(() => data?.numbers ?? [], [data])
  const summary = useMemo(() => {
    const active = numbers.filter((n) => n.status === 'active')
    return {
      active: active.length,
      inUse: active.filter((n) => n.live.length > 0).length,
      spare: active.filter((n) => n.purpose === 'spare' && n.live.length === 0).length,
      retired: numbers.length - active.length,
      threads: numbers.reduce((acc, n) => acc + n.conversations.open, 0),
    }
  }, [numbers])

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="space-y-6">
      <SmsHubHeader
        current="numbers"
        title="SMS numbers"
        description="Which platform number is doing what — who owns it, what is live on it, and what has run on it before."
        actions={
          data?.can_manage ? (
            <Button variant="outline" asChild>
              <Link href="/administration">
                <Settings className="mr-1.5 h-4 w-4" />
                Add numbers in Administration
              </Link>
            </Button>
          ) : undefined
        }
      />

      <section aria-label="Summary" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile label="Active numbers" value={summary.active} />
        <Tile label="In live use" value={summary.inUse} tone="text-emerald-700" />
        <Tile label="Spare" value={summary.spare} />
        <Tile label="Open inbox threads" value={summary.threads} />
        <Tile label="Retired" value={summary.retired} />
      </section>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load numbers'}
        </p>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : numbers.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No platform numbers recorded yet.
          {data?.can_manage && (
            <>
              {' '}
              <Link href="/administration" className="underline underline-offset-4">
                Add one in Administration → SMS
              </Link>
              .
            </>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Number</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Organiser</TableHead>
                <TableHead>Replies</TableHead>
                <TableHead className="min-w-56">Live now</TableHead>
                <TableHead className="min-w-40">Set up</TableHead>
                <TableHead className="whitespace-nowrap">Threads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {numbers.map((n) => {
                const isOpen = expanded.has(n.number_id)
                const note = attention(n)
                return (
                  <Fragment key={n.number_id}>
                    <TableRow
                      className={cn('cursor-pointer', n.status !== 'active' && 'opacity-60')}
                      onClick={() => toggle(n.number_id)}
                      aria-expanded={isOpen}
                    >
                      <TableCell className="pr-0">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="font-mono text-sm">{toDisplay(n.phone_e164)}</p>
                        {n.label && <p className="text-xs text-muted-foreground">{n.label}</p>}
                        {n.status !== 'active' && (
                          <Badge variant="outline" className="mt-1 text-[10px]">
                            {n.status}
                          </Badge>
                        )}
                        {note && (
                          <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-700">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            {note}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={cn('text-[10px]', PURPOSE_TONE[n.purpose] ?? '')}
                          title={PURPOSE_HELP[n.purpose]}
                        >
                          {n.purpose}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {n.organiser_name ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {n.supports_inbound == null ? (
                          <span className="text-muted-foreground">Unknown</span>
                        ) : n.supports_inbound ? (
                          'Land in OA'
                        ) : (
                          <span className="text-amber-700">Not received</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <ActionChips actions={n.live} empty="Nothing live" />
                      </TableCell>
                      <TableCell>
                        <ActionChips actions={n.pending} empty="—" />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {n.conversations.open} open
                        <span className="text-muted-foreground"> / {n.conversations.total}</span>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={8} className="p-0">
                          <NumberDetail
                            number={n}
                            canManage={!!data?.can_manage}
                            organisers={data?.organisers ?? []}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Purposes: <strong>organiser</strong> — {PURPOSE_HELP.organiser}{' '}
        <strong>relay</strong> — {PURPOSE_HELP.relay} <strong>survey</strong> —{' '}
        {PURPOSE_HELP.survey} <strong>spare</strong> — {PURPOSE_HELP.spare}
      </p>
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-lg font-semibold', tone)}>{value}</p>
      </CardContent>
    </Card>
  )
}

function actionRefHref(a: SmsNumberActionRef): string {
  return a.kind === 'relay'
    ? smsActionHref({ kind: 'relay', id: a.id })
    : smsActionHref(
        { kind: a.kind, campaignId: a.campaign_id as number, id: a.id },
        { standalone: a.scope === 'standalone' },
      )
}

function ActionChips({
  actions,
  empty,
  max = 3,
}: {
  actions: SmsNumberActionRef[]
  empty: string
  max?: number
}) {
  const router = useRouter()
  if (actions.length === 0) {
    return <span className="text-xs text-muted-foreground">{empty}</span>
  }
  const shown = actions.slice(0, max)
  const rest = actions.length - shown.length
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((a) => {
        const meta = SMS_ACTION_KIND_META[a.kind]
        return (
          <button
            key={`${a.kind}:${a.id}`}
            type="button"
            className="inline-flex max-w-56 items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] hover:bg-muted"
            title={`${meta.label} · ${smsActionStatusLabel(a.kind, a.status)}${a.campaign_name ? ` · ${a.campaign_name}` : a.scope === 'standalone' ? ' · standalone' : a.scope === 'org' ? ' · org-wide' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              router.push(actionRefHref(a))
            }}
          >
            <meta.icon className={cn('h-3 w-3 shrink-0', meta.tone)} aria-hidden />
            <span className="truncate">{a.name}</span>
          </button>
        )
      })}
      {rest > 0 && <span className="self-center text-[11px] text-muted-foreground">+{rest}</span>}
    </div>
  )
}

function NumberDetail({
  number: n,
  canManage,
  organisers,
}: {
  number: SmsNumberAllocationRow
  canManage: boolean
  organisers: Array<{ organiser_id: number; organiser_name: string }>
}) {
  const queryClient = useQueryClient()
  const [purpose, setPurpose] = useState(n.purpose)
  const [organiserId, setOrganiserId] = useState<string>(
    n.organiser_id != null ? String(n.organiser_id) : '',
  )

  const act = useAuthAwareMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetchApi('/api/admin/sms/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Action failed' }))
        throw new Error((err as { error?: string }).error ?? 'Action failed')
      }
    },
    onSuccess: () => {
      toast.success('Number updated')
      void queryClient.invalidateQueries({ queryKey: SMS_NUMBERS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: ['admin-sms-status'] })
      void queryClient.invalidateQueries({ queryKey: ['sms-senders'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Action failed'),
  })

  const history = [...n.live, ...n.pending, ...n.finished]
  const dirty = purpose !== n.purpose || (purpose === 'organiser' && organiserId !== String(n.organiser_id ?? ''))

  return (
    <div className="grid gap-4 px-4 py-3 md:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          On this number ({n.action_count})
        </p>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has run on this number yet.</p>
        ) : (
          <ul className="divide-y rounded-md border bg-background">
            {history.map((a) => {
              const meta = SMS_ACTION_KIND_META[a.kind]
              const status = smsActionStatusLabel(a.kind, a.status)
              return (
                <li key={`${a.kind}:${a.id}`}>
                  <Link
                    href={actionRefHref(a)}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-sm hover:bg-muted/50"
                  >
                    <meta.icon className={cn('h-3.5 w-3.5 shrink-0', meta.tone)} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <Badge variant="secondary" className={cn('text-[10px]', STATUS_TONE[status] ?? '')}>
                      {status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {a.scope === 'standalone'
                        ? 'Standalone'
                        : a.scope === 'org'
                          ? 'Org-wide'
                          : (a.campaign_name ?? 'Campaign')}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDistanceToNowStrict(new Date(a.updated_at), { addSuffix: true })}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
        {n.notes && <p className="text-xs text-muted-foreground">Notes: {n.notes}</p>}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Allocation
        </p>
        {canManage ? (
          n.status === 'active' ? (
            <div className="space-y-2 rounded-md border bg-background p-3">
              <div className="flex flex-wrap gap-2">
                <Select value={purpose} onValueChange={setPurpose}>
                  <SelectTrigger className="h-8 w-32 text-xs" aria-label="Purpose">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PURPOSES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {purpose === 'organiser' && (
                  <Select value={organiserId} onValueChange={setOrganiserId}>
                    <SelectTrigger className="h-8 w-44 text-xs" aria-label="Organiser">
                      <SelectValue placeholder="Select organiser" />
                    </SelectTrigger>
                    <SelectContent>
                      {organisers.map((o) => (
                        <SelectItem key={o.organiser_id} value={String(o.organiser_id)}>
                          {o.organiser_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">{PURPOSE_HELP[purpose]}</p>
              {n.live.length > 0 && dirty && (
                <p className="flex items-start gap-1 text-[11px] text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  Something is live on this number. Reassigning changes where replies go.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={act.isPending || !dirty || (purpose === 'organiser' && !organiserId)}
                  onClick={() =>
                    act.mutate({
                      action: 'assign',
                      number_id: n.number_id,
                      purpose,
                      organiser_id: purpose === 'organiser' && organiserId ? Number(organiserId) : null,
                    })
                  }
                >
                  {act.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  Save allocation
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={act.isPending || n.live.length > 0}
                  title={n.live.length > 0 ? 'End or finish what is live on it first' : undefined}
                  onClick={() =>
                    act.mutate({ action: 'set_status', number_id: n.number_id, status: 'retired' })
                  }
                >
                  Retire number
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 rounded-md border bg-background p-3">
              <p className="text-xs text-muted-foreground">
                Retired. Re-enable it to assign a purpose again.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={act.isPending}
                onClick={() =>
                  act.mutate({ action: 'set_status', number_id: n.number_id, status: 'active' })
                }
              >
                Re-enable number
              </Button>
            </div>
          )
        ) : (
          <p className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
            Purpose and organiser are set by an admin in Administration → SMS.
          </p>
        )}
      </div>
    </div>
  )
}
