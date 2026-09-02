'use client'

/**
 * SMS hub — the one place to see every SMS action, start a new one
 * and get into any existing one.
 *
 * Layout, top to bottom, in the order an organiser needs it:
 *   1. What is happening: snapshot tiles (live, drafts & paused, awaiting
 *      review, finished, numbers).
 *   2. Start something: the four kinds as cards → the create wizard.
 *   3. Everything: the unified actions table with kind / status / scope
 *      filters. Opening a blast, survey or relay uses the same detail
 *      sheets the campaign tabs use, right here; a chat board opens
 *      its workspace.
 *
 * `?open=<ref>` deep-links a detail sheet (the wizard lands here after
 * creating); `?scope=` presets the scope filter.
 */
import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/lib/supabase/auth-context'
import { useSmsActivity, useSmsHubCampaigns, useSmsNumbers, type SmsActivityRow } from '@/lib/hooks/useSmsHub'
import {
  decodeSmsActionRef,
  encodeSmsActionRef,
  parseScopeParam,
  scopeToParam,
  smsActionHref,
  smsActionStatusGroup,
  smsCreateHref,
  SMS_ACTION_KINDS,
  type SmsActionRef,
  type SmsActionScope,
} from '@/lib/sms/hub-actions'
import { ListDetailSheet } from '@/components/sms/InlineSmsOpsPanel'
import { SurveyDetailSheet } from '@/components/sms/surveys/SmsSurveysPanel'
import { RelayDetailSheet } from '@/components/sms/relays/SmsRelaysPanel'
import { SmsHubHeader } from './SmsHubNav'
import { SmsActionsTable, rowToRef } from './SmsActionsTable'
import { SMS_ACTION_KIND_META } from './SmsActionKindPicker'
import { cn } from '@/lib/utils/cn'

interface OpenState {
  ref: SmsActionRef
  standalone: boolean
}

export function SmsHubPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { canWrite } = useAuth()

  const scope = useMemo(() => parseScopeParam(searchParams.get('scope')), [searchParams])
  const { data, isLoading } = useSmsActivity()
  const { data: campaigns = [], isLoading: campaignsLoading } = useSmsHubCampaigns()
  const { data: numbers } = useSmsNumbers()

  const allRows = useMemo(
    () => [
      ...(data?.blasts ?? []),
      ...(data?.chats ?? []),
      ...(data?.surveys ?? []),
      ...(data?.relays ?? []),
    ],
    [data],
  )

  const rows = useMemo(() => {
    if (!scope) return allRows
    if (scope.type === 'standalone') return allRows.filter((r) => r.scope === 'standalone')
    if (scope.type === 'org') return allRows.filter((r) => r.scope === 'org')
    return allRows.filter(
      (r) => r.campaign_id === scope.campaignId || (r.kind === 'relay' && r.scope === 'org'),
    )
  }, [allRows, scope])

  // ── Snapshot ──────────────────────────────────────────────────
  const snapshot = useMemo(() => {
    let live = 0
    let pending = 0
    let finished = 0
    let review = 0
    for (const r of allRows) {
      const g = smsActionStatusGroup(r.kind, r.status)
      if (g === 'live') live += 1
      else if (g === 'pending') pending += 1
      else finished += 1
      review += r.pending_moderation_count ?? 0
    }
    const activeNumbers = (numbers?.numbers ?? []).filter((n) => n.status === 'active')
    const spare = activeNumbers.filter((n) => n.purpose === 'spare' && n.live.length === 0).length
    return { live, pending, finished, review, numbers: activeNumbers.length, spare }
  }, [allRows, numbers])

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
      (r) => r.kind === open.ref.kind && r.id === open.ref.id && r.scope === 'standalone',
    )
  }, [allRows, open])

  const closeOpen = useCallback(() => {
    setOpen(null)
    if (searchParams.get('open')) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('open')
      params.delete('standalone')
      const qs = params.toString()
      router.replace(qs ? `/sms?${qs}` : '/sms', { scroll: false })
    }
  }, [router, searchParams])

  const openRow = useCallback(
    (row: SmsActivityRow) => {
      const ref = rowToRef(row)
      if (ref.kind === 'chat') {
        router.push(smsActionHref(ref))
        return
      }
      setOpen({ ref, standalone: row.scope === 'standalone' })
      const params = new URLSearchParams(searchParams.toString())
      params.set('open', encodeSmsActionRef(ref))
      if (row.scope === 'standalone') params.set('standalone', '1')
      else params.delete('standalone')
      router.replace(`/sms?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  const duplicateRow = useCallback(
    (row: SmsActivityRow) => {
      const sourceScope: SmsActionScope =
        row.scope === 'standalone'
          ? { type: 'standalone' }
          : row.scope === 'org' || row.campaign_id == null
            ? { type: 'org' }
            : { type: 'campaign', campaignId: row.campaign_id }
      router.push(
        smsCreateHref({ kind: row.kind, scope: sourceScope, duplicateFrom: rowToRef(row) }),
      )
    },
    [router],
  )

  const setScope = useCallback(
    (next: SmsActionScope | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (next) params.set('scope', scopeToParam(next))
      else params.delete('scope')
      const qs = params.toString()
      router.replace(qs ? `/sms?${qs}` : '/sms', { scroll: false })
    },
    [router, searchParams],
  )

  const scopeSelectValue = scope ? scopeToParam(scope) : '__all__'
  // Narrowed once here; inside JSX callbacks TS forgets the discriminant.
  const openSurvey = open?.ref.kind === 'survey' ? open.ref : null

  return (
    <div className="space-y-6">
      <SmsHubHeader
        current="actions"
        title="SMS"
        description="Blasts, chat boards, surveys and relays — standalone or linked to a campaign. See what is running, start something new, or pick up where you left off."
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
      {canWrite && (
        <section aria-label="Start a new SMS action" className="space-y-2">
          <h2 className="text-sm font-medium">Start something</h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {SMS_ACTION_KINDS.map((kind) => {
              const meta = SMS_ACTION_KIND_META[kind]
              return (
                <Link
                  key={kind}
                  href={smsCreateHref({ kind })}
                  className="group flex items-start gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  <meta.icon className={cn('mt-0.5 h-5 w-5 shrink-0', meta.tone)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      New {meta.label.toLowerCase()}
                    </p>
                    <p className="text-xs text-muted-foreground">{meta.headline}</p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* 3. Everything */}
      <section aria-label="All SMS actions" className="space-y-2">
        <h2 className="text-sm font-medium">All SMS actions</h2>
        <SmsActionsTable
          rows={rows}
          isLoading={isLoading}
          canWrite={!!canWrite}
          onOpen={openRow}
          onDuplicate={duplicateRow}
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
                <SelectItem value="org">Org-wide relays</SelectItem>
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
            canWrite ? (
              <>
                No SMS actions yet.{' '}
                <Link href={smsCreateHref({})} className="underline underline-offset-4">
                  Start one
                </Link>
                .
              </>
            ) : (
              'No SMS actions yet.'
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
