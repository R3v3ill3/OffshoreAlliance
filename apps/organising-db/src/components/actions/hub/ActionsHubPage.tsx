'use client'

/**
 * Actions hub — the one place to see every action an organiser runs,
 * whatever channel it goes out on, start a new one, and get back into
 * an existing one.
 *
 * Layout, top to bottom, in the order an organiser needs it:
 *   1. What is happening: snapshot tiles (live, drafts & paused,
 *      awaiting review, finished, numbers).
 *   2. Start something: SMS, email and calls as cards → the flows that
 *      exist today.
 *   3. Everything: the unified actions table with owner / kind /
 *      status / scope filters. Opening an SMS blast, survey or relay
 *      uses the same detail sheets the campaign tabs use, right here;
 *      a chat board opens its workspace; an email or call list opens
 *      where it lives.
 *
 * Every filter lives in the URL — `?mine=`, `?kind=`, `?bucket=`,
 * `?scope=`, `?q=` — so a view can be linked, and `?open=<ref>` still
 * deep-links an SMS detail sheet (the create wizard lands here).
 *
 * "Mine" is the default and it is the only filter that hides rows
 * without the organiser having asked. Rows with no recorded owner are
 * counted and announced above the table rather than silently dropped.
 */
import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/lib/supabase/auth-context'
import { useSmsHubCampaigns, useSmsNumbers } from '@/lib/hooks/useSmsHub'
import { useHubActionRows } from '@/lib/hooks/useActionsHub'
import {
  ACTIONS_HUB_PATH,
  countBy,
  countUnknownOwnerRows,
  filterHubRows,
  isHubActionBucket,
  isHubActionKind,
  pendingModerationTotal,
  smsKindForHubKind,
  type HubActionBucket,
  type HubActionKind,
  type HubActionRow,
} from '@/lib/actions/hub-rows'
import {
  decodeSmsActionRef,
  encodeSmsActionRef,
  parseScopeParam,
  scopeToParam,
  smsActionHref,
  smsCreateHref,
  type SmsActionRef,
  type SmsActionScope,
} from '@/lib/sms/hub-actions'
import { ListDetailSheet } from '@/components/sms/InlineSmsOpsPanel'
import { SurveyDetailSheet } from '@/components/sms/surveys/SmsSurveysPanel'
import { RelayDetailSheet } from '@/components/sms/relays/SmsRelaysPanel'
import { SmsHubHeader } from '@/components/sms/hub/SmsHubNav'
import { ActionsTable } from './ActionsTable'
import { StartSomethingCards } from './StartSomethingCards'
import { cn } from '@/lib/utils/cn'

interface OpenState {
  ref: SmsActionRef
  standalone: boolean
}

export function ActionsHubPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { canWrite } = useAuth()

  const scope = useMemo(() => parseScopeParam(searchParams.get('scope')), [searchParams])
  // `mine=0` is the only way out of the default; anything else is Mine.
  const mine = searchParams.get('mine') !== '0'
  const kindParam = searchParams.get('kind')
  const kind: HubActionKind | 'all' = isHubActionKind(kindParam) ? kindParam : 'all'
  const bucketParam = searchParams.get('bucket')
  const bucket: HubActionBucket | 'all' = isHubActionBucket(bucketParam) ? bucketParam : 'all'
  const search = searchParams.get('q') ?? ''

  const [showArchived, setShowArchived] = useState(bucket === 'archived')
  const {
    rows: allRows,
    isLoading,
    smsError,
    emailError,
    callsError,
    refetchSms,
    refetchEmail,
    refetchCalls,
    archivedTotal,
  } = useHubActionRows({ showArchived, mine })

  // Named channels, so a failure says which list is short rather than
  // leaving the organiser to wonder whether the gap is real. Memoised
  // because the empty-state hint reads it: a fresh array every render
  // would defeat the compiler's memoisation of the whole subtree.
  const failedSources = useMemo(() => {
    const failed: string[] = []
    if (smsError) failed.push('SMS actions')
    if (emailError) failed.push('email sends')
    if (callsError) failed.push('call lists')
    return failed
  }, [smsError, emailError, callsError])
  const { data: campaigns = [], isLoading: campaignsLoading } = useSmsHubCampaigns()
  const { data: numbers } = useSmsNumbers()

  /** Scope is applied before everything else — it is the page's subject. */
  const scopedRows = useMemo(() => {
    if (!scope) return allRows
    if (scope.type === 'standalone' || scope.type === 'org') {
      return allRows.filter((r) => r.scope.kind === 'standalone')
    }
    return allRows.filter(
      (r) =>
        (r.scope.kind === 'campaign' && r.scope.campaignId === scope.campaignId) ||
        // An action with no campaign at all shows on every campaign's
        // Relays tab, so it belongs in a campaign-scoped view too.
        (r.kind === 'sms_relay' && r.scope.kind === 'standalone'),
    )
  }, [allRows, scope])

  const mineRows = useMemo(
    () => filterHubRows(scopedRows, { mine, bucket: 'all', kind: 'all', search }),
    [scopedRows, mine, search],
  )

  const visible = useMemo(
    () => filterHubRows(scopedRows, { mine, bucket, kind, search }),
    [scopedRows, mine, bucket, kind, search],
  )

  // Chip numbers describe what that chip would show: taken after Mine
  // and search, and before the filter the chip itself drives.
  const counts = useMemo(() => {
    const forBuckets = countBy(
      filterHubRows(scopedRows, { mine, bucket: 'all', kind, search }),
    )
    const forKinds = countBy(
      filterHubRows(scopedRows, { mine, bucket, kind: 'all', search }),
    )
    return {
      byKind: forKinds.byKind,
      byBucket: { ...forBuckets.byBucket },
      // Archived rows are only fetched once the toggle is on. Until
      // then the filtered count is unknowable, and the server's
      // org-wide total would be the one chip ignoring the filters
      // every other chip respects — so the chip says "…" instead.
      archivedUnknown: !showArchived,
    }
  }, [scopedRows, mine, bucket, kind, search, showArchived])

  const unknownOwnerCount = useMemo(
    () => (mine ? countUnknownOwnerRows(scopedRows, { bucket, kind, search }) : 0),
    [scopedRows, mine, bucket, kind, search],
  )

  // ── Snapshot ──────────────────────────────────────────────────
  // Live / drafts / finished follow the owner filter, so the tiles and
  // the table below them always describe the same set. Awaiting review
  // does not: moderation is a duty over every relay, whoever set it up.
  const snapshot = useMemo(() => {
    let live = 0
    let pending = 0
    let finished = 0
    for (const r of mineRows) {
      if (r.bucket === 'archived') continue
      if (r.bucket === 'live') live += 1
      else if (r.bucket === 'drafts_paused') pending += 1
      else finished += 1
    }
    // Archived relays are put away; their queue is not a live duty.
    const review = pendingModerationTotal(allRows)
    const activeNumbers = (numbers?.numbers ?? []).filter((n) => n.status === 'active')
    const spare = activeNumbers.filter((n) => n.purpose === 'spare' && n.live.length === 0).length
    return { live, pending, finished, review, numbers: activeNumbers.length, spare }
  }, [mineRows, allRows, numbers])

  // ── URL helpers ───────────────────────────────────────────────
  const setParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString())
      mutate(params)
      const qs = params.toString()
      router.replace(qs ? `${ACTIONS_HUB_PATH}?${qs}` : ACTIONS_HUB_PATH, { scroll: false })
    },
    [router, searchParams],
  )

  const setMine = useCallback(
    (next: boolean) => setParams((p) => (next ? p.delete('mine') : p.set('mine', '0'))),
    [setParams],
  )
  const setKind = useCallback(
    (next: HubActionKind | 'all') =>
      setParams((p) => (next === 'all' ? p.delete('kind') : p.set('kind', next))),
    [setParams],
  )
  const setBucket = useCallback(
    (next: HubActionBucket | 'all') =>
      setParams((p) => (next === 'all' ? p.delete('bucket') : p.set('bucket', next))),
    [setParams],
  )
  const setSearch = useCallback(
    (next: string) => setParams((p) => (next ? p.set('q', next) : p.delete('q'))),
    [setParams],
  )
  const setScope = useCallback(
    (next: SmsActionScope | null) =>
      setParams((p) => (next ? p.set('scope', scopeToParam(next)) : p.delete('scope'))),
    [setParams],
  )

  // ── Open / deep link ──────────────────────────────────────────
  const [open, setOpen] = useState<OpenState | null>(() => {
    const ref = decodeSmsActionRef(searchParams.get('open'))
    return ref ? { ref, standalone: searchParams.get('standalone') === '1' } : null
  })

  // A deep link may not carry the scope; once rows arrive, derive it.
  const openStandalone = useMemo(() => {
    if (!open) return false
    if (open.standalone || open.ref.kind === 'relay') return open.standalone
    return allRows.some(
      (r) =>
        smsKindForHubKind(r.kind) === open.ref.kind &&
        r.smsRef?.kind !== 'relay' &&
        r.smsRef?.id === open.ref.id &&
        r.scope.kind === 'standalone',
    )
  }, [allRows, open])

  const closeOpen = useCallback(() => {
    setOpen(null)
    if (searchParams.get('open')) {
      setParams((p) => {
        p.delete('open')
        p.delete('standalone')
      })
    }
  }, [searchParams, setParams])

  const openRow = useCallback(
    (row: HubActionRow) => {
      const ref = row.smsRef
      if (!ref) {
        // Email sends and call lists open where they live.
        router.push(row.href)
        return
      }
      if (ref.kind === 'chat') {
        router.push(smsActionHref(ref))
        return
      }
      const standalone = row.scope.kind === 'standalone'
      setOpen({ ref, standalone })
      setParams((p) => {
        p.set('open', encodeSmsActionRef(ref))
        if (standalone) p.set('standalone', '1')
        else p.delete('standalone')
      })
    },
    [router, setParams],
  )

  /** From a launch text's row menu — the relay opens in the same page. */
  const openRelay = useCallback(
    (relayId: number) => {
      const ref: SmsActionRef = { kind: 'relay', id: relayId }
      setOpen({ ref, standalone: false })
      setParams((p) => {
        p.set('open', encodeSmsActionRef(ref))
        p.delete('standalone')
      })
    },
    [setParams],
  )

  const duplicateRow = useCallback(
    (row: HubActionRow) => {
      const smsKind = smsKindForHubKind(row.kind)
      if (!smsKind || !row.smsRef) return
      const sourceScope: SmsActionScope =
        row.scope.kind === 'campaign'
          ? { type: 'campaign', campaignId: row.scope.campaignId }
          : smsKind === 'relay'
            ? { type: 'org' }
            : { type: 'standalone' }
      router.push(
        smsCreateHref({ kind: smsKind, scope: sourceScope, duplicateFrom: row.smsRef }),
      )
    },
    [router],
  )

  const scopeSelectValue = scope ? scopeToParam(scope) : '__all__'
  // Narrowed once here; inside JSX callbacks TS forgets the discriminant.
  const openSurvey = open?.ref.kind === 'survey' ? open.ref : null

  return (
    <div className="space-y-6">
      <SmsHubHeader
        current="actions"
        title="Actions"
        description="SMS, email and calls — standalone or linked to a campaign. See what is running, start something new, or pick up where you left off."
        actions={
          canWrite ? (
            <Button asChild>
              <Link href={smsCreateHref({})}>
                <Plus className="mr-1.5 h-4 w-4" />
                New SMS action
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* 1. What is happening */}
      <section aria-label="Snapshot" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Live now" value={snapshot.live} tone="text-emerald-700" />
        <StatTile label="Drafts & paused" value={snapshot.pending} />
        <StatTile
          label="Awaiting review"
          value={snapshot.review}
          tone={snapshot.review > 0 ? 'text-amber-700' : undefined}
          hint="Relay messages held for moderation"
        />
        <StatTile label="Finished" value={snapshot.finished} />
        <StatTile
          label="Numbers"
          value={snapshot.numbers}
          hint={numbers ? `${snapshot.spare} spare` : undefined}
          href="/sms/numbers"
        />
      </section>

      {/* 2. Start something */}
      {canWrite && <StartSomethingCards />}

      {/* 3. Everything */}
      <section aria-label="All actions" className="space-y-2">
        <h2 className="text-sm font-medium">All actions</h2>
        {smsError && (
          <ErrorStrip label="SMS actions could not be loaded." onRetry={refetchSms} />
        )}
        {emailError && (
          <ErrorStrip label="Email sends could not be loaded." onRetry={refetchEmail} />
        )}
        {callsError && (
          <ErrorStrip label="Call lists could not be loaded." onRetry={refetchCalls} />
        )}
        <ActionsTable
          rows={visible}
          totalRows={scopedRows.length}
          isLoading={isLoading}
          canWrite={!!canWrite}
          filters={{ mine, kind, bucket, search }}
          counts={counts}
          onMineChange={setMine}
          onKindChange={setKind}
          onBucketChange={setBucket}
          onSearchChange={setSearch}
          onOpen={openRow}
          onDuplicate={duplicateRow}
          onOpenRelay={openRelay}
          showArchived={showArchived}
          onShowArchivedChange={setShowArchived}
          archivedTotal={archivedTotal}
          unknownOwnerCount={unknownOwnerCount}
          scopeControl={
            <Select
              value={scopeSelectValue}
              onValueChange={(v) => setScope(v === '__all__' ? null : parseScopeParam(v))}
            >
              <SelectTrigger className="h-8 w-full text-xs sm:w-64" aria-label="Scope filter">
                <SelectValue placeholder="All scopes" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value="__all__">All scopes</SelectItem>
                <SelectItem value="standalone">Standalone only</SelectItem>
                {campaignsLoading && (
                  <SelectItem value="__loading__" disabled>
                    Loading campaigns…
                  </SelectItem>
                )}
                {campaigns.map((c) => (
                  <SelectItem key={c.campaign_id} value={String(c.campaign_id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          emptyHint={
            // An empty table after a failed read is not an empty
            // universe. Say which channel is missing rather than
            // inviting the organiser to start something they may
            // already have.
            failedSources.length > 0 ? (
              `Nothing could be listed: ${joinWords(failedSources)} could not be loaded. Retry above.`
            ) : canWrite ? (
              <>
                No actions yet.{' '}
                <Link href={smsCreateHref({})} className="underline underline-offset-4">
                  Start one
                </Link>
                . Sends made with the standalone Email wizard go straight to Action Network and
                are not recorded here.
              </>
            ) : (
              'No actions yet.'
            )
          }
        />
      </section>

      {/* Detail sheets — the same ones the campaign tabs use. */}
      {open?.ref.kind === 'blast' && (
        <ListDetailSheet
          campaignId={String(open.ref.campaignId)}
          listId={open.ref.id}
          standaloneMode={openStandalone}
          onOpenChange={(o) => {
            if (!o) closeOpen()
          }}
        />
      )}
      {open && openSurvey && (
        <SurveyDetailSheet
          campaignId={String(openSurvey.campaignId)}
          surveyId={openSurvey.id}
          hideAssessments={openStandalone}
          onOpenChange={(o) => {
            if (!o) closeOpen()
          }}
          onPromoted={(newId) =>
            setOpen({
              ref: { kind: 'survey', campaignId: openSurvey.campaignId, id: newId },
              standalone: openStandalone,
            })
          }
        />
      )}
      {open?.ref.kind === 'relay' && (
        <RelayDetailSheet
          relayId={open.ref.id}
          onOpenChange={(o) => {
            if (!o) closeOpen()
          }}
        />
      )}
    </div>
  )
}

/** "a", "a and b", "a, b and c" — for naming the channels that failed. */
function joinWords(items: string[]): string {
  if (items.length < 2) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function ErrorStrip({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      {label}{' '}
      <button type="button" className="underline underline-offset-4" onClick={onRetry}>
        Retry
      </button>
    </p>
  )
}

function StatTile({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: string
  value: number
  hint?: string
  tone?: string
  href?: string
}) {
  const body = (
    <CardContent className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-semibold', tone)}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </CardContent>
  )
  if (href) {
    return (
      <Card className="transition-colors hover:bg-muted/40">
        <Link href={href} className="block" aria-label={`${label}: ${value}. Open numbers`}>
          {body}
        </Link>
      </Card>
    )
  }
  return <Card>{body}</Card>
}
