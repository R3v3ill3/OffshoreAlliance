"use client"

import { format, parseISO, isValid, isPast, isFuture, isWithinInterval } from "date-fns"
import { AlertCircle, CheckCircle2, ChevronRight, Clock, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils/cn"
import { usePiaActions, usePiaParticipation } from "@/hooks/usePiaActions"
import { PIA_ACTION_TYPE_LABELS } from "@/types/pia-types"
import type { PiaAction } from "@/types/pia-types"

// ── Helpers ──────────────────────────────────────────────────

function getActionStatus(action: PiaAction): 'concluded' | 'active' | 'upcoming' | 'notice' {
  if (action.is_concluded) return 'concluded'

  const now = new Date()
  if (action.action_starts_at && action.action_ends_at) {
    const start = parseISO(action.action_starts_at)
    const end = parseISO(action.action_ends_at)
    if (isValid(start) && isValid(end) && isWithinInterval(now, { start, end })) {
      return 'active'
    }
  }
  if (action.action_starts_at) {
    const start = parseISO(action.action_starts_at)
    if (isValid(start) && isFuture(start)) {
      // Check notice deadline — if notice given, show 'notice'
      if (action.notice_given_at) return 'notice'
      return 'upcoming'
    }
  }
  return 'upcoming'
}

function statusConfig(status: ReturnType<typeof getActionStatus>) {
  switch (status) {
    case 'concluded':
      return {
        icon: CheckCircle2,
        label: 'Concluded',
        badgeVariant: 'secondary' as const,
        className: 'text-muted-foreground',
      }
    case 'active':
      return {
        icon: Zap,
        label: 'Active',
        badgeVariant: 'destructive' as const,
        className: 'text-red-600',
      }
    case 'notice':
      return {
        icon: AlertCircle,
        label: 'Notice given',
        badgeVariant: 'default' as const,
        className: 'text-amber-600',
      }
    case 'upcoming':
    default:
      return {
        icon: Clock,
        label: 'Upcoming',
        badgeVariant: 'outline' as const,
        className: 'text-muted-foreground',
      }
  }
}

// ── Participation mini-bar ───────────────────────────────────

function ParticipationBar({ actionId }: { actionId: number }) {
  const { data } = usePiaParticipation(actionId)

  if (!data || (data.total_pledged === 0 && data.total_participated === 0)) {
    return <span className="text-xs text-muted-foreground">No data</span>
  }

  const rate = Number(data.participation_rate ?? 0)
  const pledged = data.total_pledged
  const participated = data.total_participated

  return (
    <div className="flex flex-col gap-0.5 min-w-[100px]">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span>{participated} / {pledged} pledged</span>
        <span className="font-medium text-foreground">({rate}%)</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
    </div>
  )
}

// ── Row ──────────────────────────────────────────────────────

interface ActionRowProps {
  action: PiaAction
  onClick: (action: PiaAction) => void
}

function ActionRow({ action, onClick }: ActionRowProps) {
  const status = getActionStatus(action)
  const config = statusConfig(status)
  const StatusIcon = config.icon
  const label = PIA_ACTION_TYPE_LABELS[action.action_type] ?? action.action_type

  return (
    <button
      type="button"
      onClick={() => onClick(action)}
      className={cn(
        "w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left",
        "hover:bg-accent hover:border-accent-foreground/20 transition-colors",
        status === 'concluded' && "opacity-60",
        status === 'active' && "border-red-200 bg-red-50"
      )}
    >
      {/* Escalation level badge */}
      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
        {action.escalation_level}
      </span>

      {/* Action type label */}
      <div className="flex-1 min-w-0">
        <p className={cn("font-medium truncate", config.className)}>{label}</p>
        {action.action_starts_at && (
          <p className="text-xs text-muted-foreground">
            {format(parseISO(action.action_starts_at), "d MMM yyyy")}
            {action.action_ends_at && (
              <> – {format(parseISO(action.action_ends_at), "d MMM yyyy")}</>
            )}
          </p>
        )}
        {action.notice_given_at && (
          <p className="text-xs text-muted-foreground">
            Notice: {format(parseISO(action.notice_given_at), "d MMM yyyy")}
          </p>
        )}
      </div>

      {/* Participation */}
      <div className="flex-shrink-0 hidden sm:block">
        <ParticipationBar actionId={action.action_id} />
      </div>

      {/* Status badge */}
      <Badge variant={config.badgeVariant} className="flex-shrink-0 hidden sm:flex gap-1 items-center">
        <StatusIcon className="h-3 w-3" />
        {config.label}
      </Badge>

      <ChevronRight className="flex-shrink-0 h-4 w-4 text-muted-foreground" />
    </button>
  )
}

// ── Main component ───────────────────────────────────────────

export interface PiaActionLadderProps {
  campaignId: number
  onSelectAction?: (action: PiaAction) => void
}

export function PiaActionLadder({ campaignId, onSelectAction }: PiaActionLadderProps) {
  const { data: actions, isLoading, isError } = usePiaActions(campaignId)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 animate-pulse">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Failed to load industrial actions.
      </div>
    )
  }

  if (!actions || actions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        No industrial actions recorded yet. Use a seed pack or add actions manually.
      </div>
    )
  }

  const handleClick = (action: PiaAction) => {
    onSelectAction?.(action)
  }

  // Group by concluded status for visual separation
  const active = actions.filter((a) => !a.is_concluded)
  const concluded = actions.filter((a) => a.is_concluded)

  return (
    <div className="flex flex-col gap-1">
      {active.map((action) => (
        <ActionRow key={action.action_id} action={action} onClick={handleClick} />
      ))}
      {concluded.length > 0 && active.length > 0 && (
        <div className="my-2 flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex-1 h-px bg-border" />
          <span>Concluded</span>
          <div className="flex-1 h-px bg-border" />
        </div>
      )}
      {concluded.map((action) => (
        <ActionRow key={action.action_id} action={action} onClick={handleClick} />
      ))}
    </div>
  )
}
