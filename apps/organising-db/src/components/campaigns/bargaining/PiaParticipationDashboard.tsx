"use client"

import { useMemo } from "react"
import { format, parseISO, isValid } from "date-fns"
import { BarChart3, TrendingUp, Users, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils/cn"
import { usePiaActions } from "@/hooks/usePiaActions"
import { createClient } from "@/lib/supabase/client"
import { useQuery } from "@tanstack/react-query"
import { PIA_ACTION_TYPE_LABELS } from "@/types/pia-types"
import type { PiaAction, PiaParticipationRow } from "@/types/pia-types"

// ── Fetch all participation rows for a campaign's actions ────

function useCampaignPiaParticipation(campaignId: number) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['pia-participation-campaign', campaignId],
    queryFn: async (): Promise<PiaParticipationRow[]> => {
      const { data, error } = await supabase
        .from('v_pia_participation_by_action')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('escalation_level', { ascending: true })
      if (error) throw error
      return (data ?? []) as PiaParticipationRow[]
    },
    enabled: !!campaignId,
  })
}

// ── Summary card ─────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  sub?: string
  color?: string
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("h-4 w-4", color ?? "text-muted-foreground")} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Horizontal bar row ───────────────────────────────────────

function ParticipationTableRow({
  action,
  row,
}: {
  action: PiaAction | undefined
  row: PiaParticipationRow
}) {
  const label = action
    ? (PIA_ACTION_TYPE_LABELS[action.action_type] ?? action.action_type)
    : (PIA_ACTION_TYPE_LABELS[row.action_type] ?? row.action_type)

  const rate = Number(row.participation_rate ?? 0)
  const memberPct = Number(row.percent_membership ?? 0)

  const barColor = rate >= 70 ? "bg-emerald-500" : rate >= 40 ? "bg-amber-500" : "bg-red-400"

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
      <td className="py-2 pr-3 text-sm font-medium">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-xs text-muted-foreground">
            {row.escalation_level}
          </span>
          <span className="truncate max-w-[180px]">{label}</span>
          {row.is_concluded && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0">Done</Badge>
          )}
        </div>
      </td>
      <td className="py-2 px-2 text-sm text-right text-muted-foreground">{row.total_pledged}</td>
      <td className="py-2 px-2 text-sm text-right font-medium">{row.total_participated}</td>
      <td className="py-2 pl-3 min-w-[140px]">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", barColor)}
              style={{ width: `${Math.min(rate, 100)}%` }}
            />
          </div>
          <span className="text-xs font-medium w-10 text-right">{rate}%</span>
        </div>
      </td>
      <td className="py-2 pl-2 text-sm text-right text-muted-foreground">{memberPct}%</td>
    </tr>
  )
}

// ── Main component ───────────────────────────────────────────

export interface PiaParticipationDashboardProps {
  campaignId: number
  className?: string
}

export function PiaParticipationDashboard({ campaignId, className }: PiaParticipationDashboardProps) {
  const { data: actions, isLoading: actionsLoading } = usePiaActions(campaignId)
  const { data: participation, isLoading: partLoading } = useCampaignPiaParticipation(campaignId)

  const isLoading = actionsLoading || partLoading

  // Build an action lookup map
  const actionMap = useMemo(() => {
    if (!actions) return new Map<number, PiaAction>()
    return new Map(actions.map((a) => [a.action_id, a]))
  }, [actions])

  // Summary stats
  const stats = useMemo(() => {
    if (!participation) return null
    const totalActions = participation.length
    const concludedActions = participation.filter((r) => r.is_concluded).length
    const totalPledged = participation.reduce((s, r) => s + (r.total_pledged ?? 0), 0)
    const totalParticipated = participation.reduce((s, r) => s + (r.total_participated ?? 0), 0)
    const avgRate = totalPledged > 0
      ? Math.round((totalParticipated / totalPledged) * 100)
      : 0
    const peakAction = [...participation].sort(
      (a, b) => Number(b.participation_rate) - Number(a.participation_rate)
    )[0]
    return { totalActions, concludedActions, totalPledged, totalParticipated, avgRate, peakAction }
  }, [participation])

  if (isLoading) {
    return (
      <div className={cn("flex flex-col gap-4 animate-pulse", className)}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted" />
          ))}
        </div>
        <div className="h-48 rounded-xl bg-muted" />
      </div>
    )
  }

  if (!participation || participation.length === 0) {
    return (
      <div className={cn(
        "rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground",
        className
      )}>
        No participation data yet. Record activity ratings to see stats here.
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {/* Summary cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard
            icon={Zap}
            label="Total actions"
            value={stats.totalActions}
            sub={`${stats.concludedActions} concluded`}
          />
          <SummaryCard
            icon={Users}
            label="Total pledged"
            value={stats.totalPledged}
            color="text-blue-500"
          />
          <SummaryCard
            icon={TrendingUp}
            label="Total participated"
            value={stats.totalParticipated}
            color="text-emerald-600"
          />
          <SummaryCard
            icon={BarChart3}
            label="Avg conversion rate"
            value={`${stats.avgRate}%`}
            sub={stats.peakAction
              ? `Peak: ${PIA_ACTION_TYPE_LABELS[stats.peakAction.action_type] ?? stats.peakAction.action_type}`
              : undefined}
            color="text-amber-500"
          />
        </div>
      )}

      {/* Participation table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 pt-4 pb-2 border-b">
          <h3 className="text-sm font-semibold">Participation by action</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px]">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground">Pledged</th>
                <th className="py-2 px-2 text-right text-xs font-medium text-muted-foreground">Participated</th>
                <th className="py-2 pl-3 text-left text-xs font-medium text-muted-foreground">Conversion rate</th>
                <th className="py-2 pl-2 text-right text-xs font-medium text-muted-foreground">% members</th>
              </tr>
            </thead>
            <tbody className="px-1">
              {participation.map((row) => (
                <ParticipationTableRow
                  key={row.action_id}
                  action={actionMap.get(row.action_id)}
                  row={row}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
