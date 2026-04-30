"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/lib/supabase/auth-context"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils/cn"
import { ArrowRight, AlertTriangle, BarChart3, Zap, ShieldAlert } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProgressRow {
  campaign_id: number
  last_strength_assessed_at: string | null
  last_strength_verdict: string | null
  open_decision_count: number
  active_pia_count: number
  intractable_status: string | null
  intractable_days_elapsed: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function VerdictChip({ verdict }: { verdict: string | null }) {
  if (!verdict) {
    return (
      <Badge variant="secondary" className="text-[10px] h-5 bg-slate-100 text-slate-500">
        Not assessed
      </Badge>
    )
  }
  const cls =
    verdict === "strong"
      ? "bg-green-100 text-green-700"
      : verdict === "weak"
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-700"
  return (
    <Badge variant="secondary" className={cn("text-[10px] h-5 capitalize", cls)}>
      {verdict}
    </Badge>
  )
}

function intractableIsAlert(status: string | null): boolean {
  return (
    status === "approaching" ||
    status === "eligible" ||
    status === "applied" ||
    status === "declared" ||
    status === "arbitrated"
  )
}

function intractableLabel(status: string | null, daysElapsed: number | null): string {
  if (!status) return "Not tracked"
  const months =
    daysElapsed != null ? Math.round(daysElapsed / 30.4375) : null
  const suffix = months != null ? ` (${months} mo)` : ""
  switch (status) {
    case "safe":
      return `On track${suffix}`
    case "approaching":
      return `Approaching threshold${suffix}`
    case "eligible":
      return `Threshold reached${suffix}`
    case "applied":
      return "Application filed"
    case "declared":
      return "Intractable declared"
    case "arbitrated":
      return "Arbitrated"
    default:
      return status.replace(/_/g, " ")
  }
}

// ─── Widget ───────────────────────────────────────────────────────────────────

interface BargainingInsightsWidgetProps {
  campaignId: number
}

/**
 * Compact bargaining summary card.
 * Renders only when the campaign is in current_phase = 'bargaining_to_win'.
 * Should be wrapped in a conditional check by the parent:
 *   {campaign.current_phase === 'bargaining_to_win' && <BargainingInsightsWidget ... />}
 */
export function BargainingInsightsWidget({
  campaignId,
}: BargainingInsightsWidgetProps) {
  const supabase = createClient()
  const { user } = useAuth()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, isLoading } = useQuery<any>({
    queryKey: ["bargaining-insights-widget", campaignId],
    queryFn: async (): Promise<ProgressRow | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = (supabase as any)
        .from("v_bargaining_progress")
        .select("*")
        .eq("campaign_id", campaignId)
        .maybeSingle()
      const { data, error } = await q
      if (error) return null
      return (data ?? null) as ProgressRow | null
    },
    enabled: !!user && !!campaignId,
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="animate-pulse space-y-2">
            <div className="h-3 bg-slate-200 rounded w-32" />
            <div className="h-5 bg-slate-200 rounded w-24" />
            <div className="h-3 bg-slate-200 rounded w-40" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const showIntractableAlert = row && intractableIsAlert(row.intractable_status)

  return (
    <Card className={cn(showIntractableAlert && "border-amber-300")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2 text-slate-700">
          <span className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Bargaining Summary
          </span>
          <Link
            href={`/campaigns/${campaignId}/bargaining`}
            className="flex items-center gap-1 text-xs font-normal text-blue-600 hover:underline"
          >
            Open hub
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        {!row ? (
          <p className="text-xs text-muted-foreground">
            No bargaining data yet.{" "}
            <Link
              href={`/campaigns/${campaignId}/bargaining`}
              className="underline text-blue-600"
            >
              Open the bargaining hub
            </Link>{" "}
            to get started.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {/* Strength */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                Strength
              </p>
              <VerdictChip verdict={row.last_strength_verdict} />
            </div>

            {/* Open decisions */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5 flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" />
                Open Decisions
              </p>
              {row.open_decision_count > 0 ? (
                <Badge
                  variant="secondary"
                  className="bg-amber-100 text-amber-700 text-xs h-5"
                >
                  {row.open_decision_count}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">None</span>
              )}
            </div>

            {/* Active PIA */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5 flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Active PIA
              </p>
              {row.active_pia_count > 0 ? (
                <Badge
                  variant="secondary"
                  className="bg-blue-100 text-blue-700 text-xs h-5"
                >
                  {row.active_pia_count}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">None</span>
              )}
            </div>

            {/* Intractable status */}
            <div>
              <p
                className={cn(
                  "text-[10px] uppercase tracking-wide mb-0.5 flex items-center gap-1",
                  showIntractableAlert
                    ? "text-amber-600"
                    : "text-muted-foreground"
                )}
              >
                {showIntractableAlert && (
                  <AlertTriangle className="h-3 w-3" />
                )}
                Intractable
              </p>
              <span
                className={cn(
                  "text-xs",
                  showIntractableAlert
                    ? "text-amber-700 font-medium"
                    : "text-muted-foreground"
                )}
              >
                {intractableLabel(
                  row.intractable_status,
                  row.intractable_days_elapsed
                )}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
