"use client"

import { useQuery } from "@tanstack/react-query"
import { format, parseISO } from "date-fns"
import { History, ArrowDownRight } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { PlanRevisionNoteRow, PlanRevisionType } from "@/types/database"

const REVISION_LABELS: Record<PlanRevisionType, string> = {
  schedule_change: "Schedule",
  scope_change: "Scope",
  ambition_change: "Ambitions",
  capacity_change: "Capacities",
  management_change: "Management",
  where_to_play_change: "Where-to-play",
  theory_change: "Theory of winning",
  other: "Other",
}

interface CampaignRevisionHistoryProps {
  campaignId: number
}

/**
 * Append-only audit feed of `plan_revision_notes` entries for a campaign.
 * Renders newest-first; surfaces the revision type, the affected stage,
 * the free-text rationale, and a downstream-shift indicator. Phase 9
 * reporting will pull from the same source.
 */
export function CampaignRevisionHistory({
  campaignId,
}: CampaignRevisionHistoryProps) {
  const supabase = createClient()
  const { data: revisions = [], isLoading } = useQuery({
    queryKey: ["plan-revision-notes", campaignId],
    queryFn: async (): Promise<PlanRevisionNoteRow[]> => {
      const { data, error } = await supabase
        .from("plan_revision_notes")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("revised_at", { ascending: false })
        .limit(50)
      if (error) {
        // Degrade gracefully on environments where the migration isn't
        // applied yet — empty list rather than render-break.
        return []
      }
      return (data ?? []) as PlanRevisionNoteRow[]
    },
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            Plan refinement history
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Plan refinement history
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Edits to active / completed stages are captured here so the plan
          stays explainable as the campaign unfolds.
        </p>
      </CardHeader>
      <CardContent>
        {revisions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No refinements recorded yet. Edits to a stage that&apos;s already
            started will prompt for a quick written note explaining what
            changed and why.
          </p>
        ) : (
          <ul className="space-y-3">
            {revisions.map((r) => (
              <li
                key={r.revision_id}
                className="border-l-2 border-amber-200 pl-3 py-1"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                    Stage {r.stage_number_affected}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                    {REVISION_LABELS[r.revision_type] ?? r.revision_type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(r.revised_at), "dd MMM yyyy · HH:mm")}
                  </span>
                  {r.triggers_downstream_shift && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
                      <ArrowDownRight className="h-3 w-3" />
                      Shifts downstream stages
                    </span>
                  )}
                </div>
                <p className="text-sm mt-1 whitespace-pre-wrap">{r.notes}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
