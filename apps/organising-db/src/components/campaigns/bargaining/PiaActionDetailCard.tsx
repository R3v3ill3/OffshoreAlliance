"use client"

import { format, parseISO, isValid, formatDistanceToNow } from "date-fns"
import { AlertCircle, Calendar, CheckCircle2, Clock, Users, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils/cn"
import { usePiaParticipation } from "@/hooks/usePiaActions"
import { PIA_ACTION_TYPE_LABELS } from "@/types/pia-types"
import type { PiaAction } from "@/types/pia-types"

// ── Helpers ──────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = parseISO(iso)
  return isValid(d) ? format(d, 'd MMM yyyy HH:mm') : '—'
}

function formatDateOnly(iso: string | null): string {
  if (!iso) return '—'
  const d = parseISO(iso)
  return isValid(d) ? format(d, 'd MMM yyyy') : '—'
}

function noticeDaysRemaining(noticeDateIso: string | null): string | null {
  if (!noticeDateIso) return null
  const d = parseISO(noticeDateIso)
  if (!isValid(d)) return null
  if (d < new Date()) return 'Notice period elapsed'
  return `Notice period expires ${formatDistanceToNow(d, { addSuffix: true })}`
}

// ── Stat row ─────────────────────────────────────────────────

function StatRow({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-medium", highlight && "text-emerald-600")}>{value}</span>
    </div>
  )
}

// ── Participation section ────────────────────────────────────

function ParticipationStats({ actionId }: { actionId: number }) {
  const { data, isLoading } = usePiaParticipation(actionId)

  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-lg bg-muted" />
  }

  if (!data) {
    return (
      <div className="text-sm text-muted-foreground py-3">
        No participation data recorded yet.
      </div>
    )
  }

  const rate = Number(data.participation_rate ?? 0)
  const memberPct = Number(data.percent_membership ?? 0)

  return (
    <div className="flex flex-col gap-1">
      <StatRow label="Pledged (expected)" value={data.total_pledged} />
      <StatRow label="Participated (actual)" value={data.total_participated} highlight={data.total_participated > 0} />
      <StatRow label="Pledge conversion rate" value={`${rate}%`} highlight={rate >= 70} />
      <StatRow label="% of campaign membership" value={`${memberPct}%`} highlight={memberPct >= 50} />

      {/* Participation bar */}
      <div className="mt-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Pledge conversion</span>
          <span className="font-medium">{rate}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              rate >= 70 ? "bg-emerald-500" : rate >= 40 ? "bg-amber-500" : "bg-red-400"
            )}
            style={{ width: `${Math.min(rate, 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────

export interface PiaActionDetailCardProps {
  action: PiaAction
  className?: string
}

export function PiaActionDetailCard({ action, className }: PiaActionDetailCardProps) {
  const label = PIA_ACTION_TYPE_LABELS[action.action_type] ?? action.action_type
  const noticeNote = noticeDaysRemaining(action.notice_given_at)

  const statusBadge = action.is_concluded ? (
    <Badge variant="secondary" className="gap-1">
      <CheckCircle2 className="h-3 w-3" />
      Concluded
    </Badge>
  ) : action.notice_given_at ? (
    <Badge variant="default" className="gap-1">
      <AlertCircle className="h-3 w-3" />
      Notice given
    </Badge>
  ) : action.action_starts_at ? (
    <Badge variant="outline" className="gap-1">
      <Clock className="h-3 w-3" />
      Scheduled
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1">
      <Zap className="h-3 w-3" />
      Planned
    </Badge>
  )

  return (
    <div className={cn("rounded-xl border bg-card p-5 shadow-sm flex flex-col gap-5", className)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Level {action.escalation_level}
            </span>
            {statusBadge}
          </div>
          <h3 className="text-lg font-semibold">{label}</h3>
        </div>
      </div>

      {/* Dates */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
          <span className="text-muted-foreground">Notice given:</span>
          <span className="font-medium">{formatDateOnly(action.notice_given_at)}</span>
        </div>
        {noticeNote && (
          <p className="text-xs text-amber-600 ml-6">{noticeNote}</p>
        )}
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-blue-500 flex-shrink-0" />
          <span className="text-muted-foreground">Starts:</span>
          <span className="font-medium">{formatDate(action.action_starts_at)}</span>
        </div>
        {action.action_ends_at && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground">Ends:</span>
            <span className="font-medium">{formatDate(action.action_ends_at)}</span>
          </div>
        )}
      </div>

      {/* Target population */}
      {action.target_population_definition && (
        <div>
          <div className="flex items-center gap-2 mb-1 text-sm font-medium">
            <Users className="h-4 w-4 text-muted-foreground" />
            Target population
          </div>
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs font-mono text-muted-foreground break-all">
            {JSON.stringify(action.target_population_definition, null, 2)}
          </div>
        </div>
      )}

      {/* Participation stats */}
      <div>
        <p className="text-sm font-semibold mb-2">Participation</p>
        <ParticipationStats actionId={action.action_id} />
      </div>

      {/* Outcome summary */}
      {action.is_concluded && action.outcome_summary && (
        <div>
          <p className="text-sm font-semibold mb-2">Outcome</p>
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs font-mono text-muted-foreground break-all">
            {JSON.stringify(action.outcome_summary, null, 2)}
          </div>
        </div>
      )}

      {/* Notes */}
      {action.notes && (
        <div>
          <p className="text-sm font-semibold mb-1">Notes</p>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{action.notes}</p>
        </div>
      )}

      {/* Concluded at */}
      {action.is_concluded && action.concluded_at && (
        <p className="text-xs text-muted-foreground">
          Concluded {formatDate(action.concluded_at)}
        </p>
      )}
    </div>
  )
}
