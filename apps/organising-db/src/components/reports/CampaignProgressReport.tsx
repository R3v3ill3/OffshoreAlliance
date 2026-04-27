"use client"

import Link from "next/link"
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { differenceInCalendarDays, format, parseISO } from "date-fns"
import { createClient } from "@/lib/supabase/client"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CampaignRevisionHistory } from "@/components/campaigns/planning/CampaignRevisionHistory"
import { StageTimelineGantt } from "@/components/campaigns/planning/StageTimelineGantt"
import { STAGE_NAMES } from "@/types/planner-types"
import {
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  CheckCircle,
  Target,
  Link2,
  AlertTriangle,
  Calendar,
} from "lucide-react"
import { cn } from "@/lib/utils/cn"

interface CampaignProgressReportProps {
  campaignId: number
  /** Renders a slim header without the campaign name when embedded inside the campaign detail page. */
  embedded?: boolean
}

interface StageRow {
  plan_id: number
  stage_number: number
  status: string
  planned_start_date: string | null
  planned_end_date: string | null
  actual_start_date: string | null
  actual_end_date: string | null
}

interface GateRow {
  gate_id: number
  gate_number: number
  gate_name: string
  enforcement_type: string
  is_active: boolean
  gate_assessments: Array<{
    assessment_id: number
    outcome: string
    assessed_at: string
    notes: string | null
  }>
}

interface CampaignAmbitionProgressRow {
  campaign_ambition_id: number
  campaign_id: number
  category: string
  subcategory: string | null
  label: string
  target_value: string | null
  target_value_max: string | null
  target_unit: string | null
  target_date: string | null
  current_value: string | null
  current_value_overridden: boolean | null
  linked_stage_ambition_count: number
  linked_stage_ambition_achieved_count: number
  linked_stage_achievement_pct: number | null
}

interface StageAmbitionRow {
  ambition_id: number
  plan_id: number
  custom_text: string | null
  is_achieved: boolean | null
  parent_campaign_ambition_id: number | null
  ambition_options?: { option_text: string } | null
}

interface CampaignBasic {
  campaign_id: number
  name: string
  status: string
  campaign_type: string
}

const CATEGORY_LABELS: Record<string, string> = {
  membership: "Membership",
  member_leaders: "Member leaders",
  activism: "Activism",
  industrial_outcomes: "Industrial outcomes",
}

const STAGE_STATUS_VARIANT: Record<string, "secondary" | "info" | "success" | "destructive"> = {
  draft: "secondary",
  active: "info",
  completed: "success",
  blocked: "destructive",
}

function isAssessmentSuccessful(outcome: string): boolean {
  return outcome === "passed" || outcome === "override_approved"
}

/**
 * Phase 9 reporting surface: pulls together stage timelines (planned vs
 * actual), gate outcomes, campaign-level ambition rollups (Phase 3), the
 * stage→campaign linkage indicator (Phase 7), and the plan revision log
 * (Phase 6) into a single dashboard. Used both inside the campaign detail
 * page (`Insights` tab) and on the standalone `/reports/campaign-progress`
 * route.
 */
export function CampaignProgressReport({
  campaignId,
  embedded = false,
}: CampaignProgressReportProps) {
  const supabase = createClient()

  const { data: campaign } = useQuery({
    queryKey: ["progress-report", "campaign", campaignId],
    queryFn: async (): Promise<CampaignBasic | null> => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("campaign_id, name, status, campaign_type")
        .eq("campaign_id", campaignId)
        .maybeSingle()
      if (error) return null
      return (data as CampaignBasic | null) ?? null
    },
  })

  const { data: stages = [] } = useQuery<StageRow[]>({
    queryKey: ["progress-report", "stages", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_stage_plans")
        .select(
          "plan_id, stage_number, status, planned_start_date, planned_end_date, actual_start_date, actual_end_date"
        )
        .eq("campaign_id", campaignId)
        .order("stage_number", { ascending: true })
      if (error) return []
      return (data ?? []) as StageRow[]
    },
  })

  const { data: gates = [] } = useQuery<GateRow[]>({
    queryKey: ["progress-report", "gates", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gate_definitions")
        .select(
          `gate_id, gate_number, gate_name, enforcement_type, is_active,
           gate_assessments(assessment_id, outcome, assessed_at, notes)`
        )
        .eq("campaign_id", campaignId)
        .order("gate_number", { ascending: true })
      if (error) return []
      return ((data ?? []) as unknown) as GateRow[]
    },
  })

  const { data: campaignAmbitionProgress = [] } = useQuery<CampaignAmbitionProgressRow[]>({
    queryKey: ["progress-report", "campaign-ambitions", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_ambition_progress")
        .select("*")
        .eq("campaign_id", campaignId)
      if (error) return []
      return (data ?? []) as CampaignAmbitionProgressRow[]
    },
  })

  const { data: stageAmbitions = [] } = useQuery<StageAmbitionRow[]>({
    queryKey: ["progress-report", "stage-ambitions", campaignId],
    queryFn: async () => {
      // First get plan_ids for this campaign, then ambitions on those plans.
      const planIds = stages.map((s) => s.plan_id)
      if (planIds.length === 0) return []
      const { data, error } = await supabase
        .from("plan_ambitions")
        .select(
          `ambition_id, plan_id, custom_text, is_achieved, parent_campaign_ambition_id,
           ambition_options(option_text)`
        )
        .in("plan_id", planIds)
      if (error) return []
      return ((data ?? []) as unknown) as StageAmbitionRow[]
    },
    enabled: stages.length > 0,
  })

  // ── Computed metrics ────────────────────────────────────────────────────

  const summary = useMemo(() => {
    const stagesCompleted = stages.filter((s) => s.status === "completed").length
    const stagesActive = stages.filter((s) => s.status === "active").length
    const gatesPassed = gates.filter((g) =>
      g.gate_assessments?.some((a) => isAssessmentSuccessful(a.outcome))
    ).length
    const orphanAmbitions = stageAmbitions.filter(
      (a) => a.parent_campaign_ambition_id == null
    )
    const linkedAmbitions = stageAmbitions.length - orphanAmbitions.length
    const linkedPct =
      stageAmbitions.length > 0
        ? Math.round((linkedAmbitions / stageAmbitions.length) * 100)
        : null
    return {
      stagesCompleted,
      stagesActive,
      gatesPassed,
      stageAmbitionsTotal: stageAmbitions.length,
      orphanAmbitionsCount: orphanAmbitions.length,
      linkedPct,
    }
  }, [stages, gates, stageAmbitions])

  return (
    <div className="space-y-5">
      {!embedded && campaign && (
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">
            Campaign progress dashboard ·{" "}
            <Badge variant="outline" className="text-[10px] h-4 px-1">
              {campaign.campaign_type}
            </Badge>{" "}
            <Badge variant="outline" className="text-[10px] h-4 px-1">
              {campaign.status}
            </Badge>
          </p>
        </div>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryTile
          label="Stages complete"
          value={`${summary.stagesCompleted} / ${stages.length || 6}`}
          icon={<CheckCircle className="h-3.5 w-3.5" />}
        />
        <SummaryTile
          label="Currently active"
          value={summary.stagesActive}
          icon={<Calendar className="h-3.5 w-3.5" />}
        />
        <SummaryTile
          label="Gates passed"
          value={`${summary.gatesPassed} / ${gates.length || 5}`}
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
        />
        <SummaryTile
          label="Stage ambitions"
          value={summary.stageAmbitionsTotal}
          icon={<Target className="h-3.5 w-3.5" />}
        />
        <SummaryTile
          label="Linked to campaign"
          value={summary.linkedPct != null ? `${summary.linkedPct}%` : "—"}
          icon={<Link2 className="h-3.5 w-3.5" />}
          accent={
            summary.linkedPct == null
              ? undefined
              : summary.linkedPct >= 60
              ? "good"
              : "warn"
          }
        />
      </div>

      {/* Stage Gantt */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stage timeline</CardTitle>
          <CardDescription>
            Planned dates rendered to scale; check the per-stage page for
            actuals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StageTimelineGantt
            campaignId={campaignId}
            stages={stages}
            gates={gates.map((g) => ({
              gate_number: g.gate_number,
              enforcement_type: g.enforcement_type,
              is_active: g.is_active,
            }))}
          />
        </CardContent>
      </Card>

      {/* Stage planned vs actual table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Planned vs actual</CardTitle>
          <CardDescription>
            Variance days = actual end minus planned end. Empty cells mean the
            stage hasn&apos;t reached that milestone yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Planned</TableHead>
                <TableHead>Actual</TableHead>
                <TableHead className="text-right">Variance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stages.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    No stage plans yet.
                  </TableCell>
                </TableRow>
              )}
              {stages.map((s) => {
                const variance =
                  s.actual_end_date && s.planned_end_date
                    ? differenceInCalendarDays(
                        parseISO(s.actual_end_date),
                        parseISO(s.planned_end_date)
                      )
                    : null
                return (
                  <TableRow key={s.plan_id}>
                    <TableCell>
                      <Link
                        href={`/campaigns/${campaignId}/plan/stage/${s.stage_number}`}
                        className="font-medium hover:underline"
                      >
                        Stage {s.stage_number}
                      </Link>
                      <p className="text-[11px] text-muted-foreground">
                        {STAGE_NAMES[s.stage_number as keyof typeof STAGE_NAMES] ?? "—"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={STAGE_STATUS_VARIANT[s.status] ?? "secondary"}
                        className="text-[10px] h-4 px-1"
                      >
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.planned_start_date
                        ? format(parseISO(s.planned_start_date), "dd MMM")
                        : "—"}{" "}
                      →{" "}
                      {s.planned_end_date
                        ? format(parseISO(s.planned_end_date), "dd MMM yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.actual_start_date
                        ? format(parseISO(s.actual_start_date), "dd MMM")
                        : "—"}{" "}
                      →{" "}
                      {s.actual_end_date
                        ? format(parseISO(s.actual_end_date), "dd MMM yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {variance == null ? (
                        "—"
                      ) : (
                        <span
                          className={cn(
                            variance > 0
                              ? "text-amber-700"
                              : variance < 0
                              ? "text-green-700"
                              : "text-muted-foreground"
                          )}
                        >
                          {variance > 0 ? "+" : ""}
                          {variance}d
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Gate outcomes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gate outcomes</CardTitle>
          <CardDescription>
            Latest assessment per gate. Hard active gates lock adjoining stage
            overlap (Phase 6).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gate</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Latest outcome</TableHead>
                <TableHead className="text-right">Assessments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    No gates configured yet.
                  </TableCell>
                </TableRow>
              )}
              {gates.map((g) => {
                const sortedAssessments = [...(g.gate_assessments ?? [])].sort(
                  (a, b) =>
                    parseISO(b.assessed_at).getTime() -
                    parseISO(a.assessed_at).getTime()
                )
                const latest = sortedAssessments[0]
                return (
                  <TableRow key={g.gate_id}>
                    <TableCell>
                      <Link
                        href={`/campaigns/${campaignId}/plan/gate/${g.gate_number}`}
                        className="font-medium hover:underline"
                      >
                        Gate {g.gate_number}
                      </Link>
                      <p className="text-[11px] text-muted-foreground">
                        {g.gate_name}
                      </p>
                    </TableCell>
                    <TableCell>
                      {g.enforcement_type === "hard" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-red-700">
                          <ShieldAlert className="h-3 w-3" />
                          Hard {g.is_active ? "" : "(inactive)"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <ShieldOff className="h-3 w-3" />
                          Soft
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {latest ? (
                        <Badge
                          variant={
                            isAssessmentSuccessful(latest.outcome)
                              ? "success"
                              : "secondary"
                          }
                          className="text-[10px] h-4 px-1"
                        >
                          {latest.outcome.replace(/_/g, " ")}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Not assessed</span>
                      )}
                      {latest && (
                        <p className="text-[10px] text-muted-foreground">
                          {format(parseISO(latest.assessed_at), "dd MMM yyyy")}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {g.gate_assessments?.length ?? 0}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Campaign ambition rollups */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign ambitions</CardTitle>
          <CardDescription>
            Cross-stage rollup of campaign-level goals. Achievement % is the
            share of linked stage ambitions marked achieved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaignAmbitionProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No campaign-level ambitions defined yet — set them in the
              wizard&apos;s ambition step or in campaign settings.
            </p>
          ) : (
            <div className="space-y-2">
              {campaignAmbitionProgress.map((row) => (
                <div
                  key={row.campaign_ambition_id}
                  className="flex items-start gap-3 rounded-md border p-3"
                >
                  <Target className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">
                        {row.label}
                      </p>
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        {CATEGORY_LABELS[row.category] ?? row.category}
                      </Badge>
                      {row.target_value && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1">
                          Target: {row.target_value}
                          {row.target_unit ? ` ${row.target_unit}` : ""}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {row.linked_stage_ambition_count === 0
                        ? "No linked stage ambitions yet — link from a stage's Ambitions step to roll up progress."
                        : `${row.linked_stage_ambition_achieved_count} / ${row.linked_stage_ambition_count} linked stage ambitions achieved`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={cn(
                        "text-lg font-semibold tabular-nums",
                        row.linked_stage_achievement_pct == null
                          ? "text-muted-foreground"
                          : row.linked_stage_achievement_pct >= 80
                          ? "text-green-700"
                          : row.linked_stage_achievement_pct >= 40
                          ? "text-amber-700"
                          : "text-red-700"
                      )}
                    >
                      {row.linked_stage_achievement_pct != null
                        ? `${row.linked_stage_achievement_pct}%`
                        : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">achieved</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan coherence — orphan stage ambitions */}
      {summary.stageAmbitionsTotal > 0 && (
        <Card
          className={cn(
            summary.orphanAmbitionsCount > 0 ? "border-amber-200" : undefined
          )}
        >
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {summary.orphanAmbitionsCount > 0 ? (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              ) : (
                <CheckCircle className="h-4 w-4 text-green-600" />
              )}
              Plan coherence
            </CardTitle>
            <CardDescription>
              Stage ambitions without a campaign link don&apos;t roll up to the
              dashboard above. Linking them gives you cross-stage visibility.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">
              <strong>{summary.linkedPct}%</strong> of stage ambitions link to a
              campaign-level ambition ({summary.stageAmbitionsTotal -
                summary.orphanAmbitionsCount}{" "}
              of {summary.stageAmbitionsTotal}).
            </p>
            {summary.orphanAmbitionsCount > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Show {summary.orphanAmbitionsCount} unlinked stage ambitions
                </summary>
                <ul className="mt-2 space-y-1">
                  {stageAmbitions
                    .filter((a) => a.parent_campaign_ambition_id == null)
                    .map((a) => {
                      const stage = stages.find((s) => s.plan_id === a.plan_id)
                      const text =
                        a.ambition_options?.option_text ||
                        a.custom_text ||
                        `Ambition #${a.ambition_id}`
                      return (
                        <li key={a.ambition_id} className="flex items-center gap-2">
                          {stage && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1">
                              S{stage.stage_number}
                            </Badge>
                          )}
                          <span className="truncate">{text}</span>
                        </li>
                      )
                    })}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent revisions */}
      <CampaignRevisionHistory campaignId={campaignId} />
    </div>
  )
}

function SummaryTile({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: string | number
  icon?: React.ReactNode
  accent?: "good" | "warn"
}) {
  return (
    <div className="rounded-md border bg-slate-50/60 p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "text-xl font-semibold leading-tight mt-0.5",
          accent === "good" && "text-green-700",
          accent === "warn" && "text-amber-700"
        )}
      >
        {value}
      </div>
    </div>
  )
}
