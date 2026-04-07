"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Clock, AlertCircle, Circle, ListTodo, Users } from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";
import Link from "next/link";

const STAGE_STATUS_CONFIG: Record<
  string,
  { label: string; badgeVariant: "success" | "info" | "secondary" | "warning" | "destructive"; icon: React.ComponentType<{ className?: string }> }
> = {
  active: { label: "Active", badgeVariant: "info", icon: Clock },
  completed: { label: "Completed", badgeVariant: "success", icon: CheckCircle2 },
  blocked: { label: "Blocked", badgeVariant: "destructive", icon: XCircle },
  draft: { label: "Draft", badgeVariant: "secondary", icon: Circle },
};

const GATE_STAGE_MAP: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
};

interface StagePlan {
  plan_id: number;
  stage_number: number;
  stage_name: string;
  status: string;
  workplan_status: string | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
}

interface WorkplanProgressRow {
  campaign_id: number;
  stage_number: number;
  plan_ambition_id: number | null;
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  blocked_tasks: number;
  planned_tasks: number;
  cancelled_tasks: number;
  completion_pct: number;
}

interface OuCoverageRow {
  campaign_id: number;
  total_ous: number;
  sized_ous: number;
  ous_with_contact: number;
  ous_with_activist: number;
  ous_with_delegate: number;
  ous_with_anchor: number;
  total_estimated_workers: number;
  total_assigned_workers: number;
}

const WORKPLAN_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  not_started: { label: "Not started", color: "text-muted-foreground" },
  in_progress: { label: "In progress", color: "text-blue-600" },
  completed: { label: "Done", color: "text-green-600" },
};

interface GateCriterion {
  criterion_id: number;
  is_met: boolean;
}

interface GateDefinition {
  gate_id: number;
  gate_number: number;
  gate_name: string;
  enforcement_type: string;
  gate_criteria: GateCriterion[];
}

interface CampaignTimeline {
  timeline_id: number;
  agreement_expiry_date: string | null;
  pabo_available_date: string | null;
  peak_engagement_target_date: string | null;
  agreements: { agreement_name: string; short_name: string | null } | null;
}

function formatDateShort(d: string | null) {
  if (!d) return null;
  try {
    return format(parseISO(d), "d MMM yyyy");
  } catch {
    return d;
  }
}

function DaysCountdown({ date, label }: { date: string; label: string }) {
  const days = differenceInDays(parseISO(date), new Date());
  const isOverdue = days < 0;
  const isUrgent = days >= 0 && days <= 60;

  return (
    <div className="flex flex-col items-center text-center">
      <span
        className={
          isOverdue
            ? "text-2xl font-bold text-destructive"
            : isUrgent
            ? "text-2xl font-bold text-amber-500"
            : "text-2xl font-bold text-foreground"
        }
      >
        {isOverdue ? Math.abs(days) : days}
      </span>
      <span className="text-xs text-muted-foreground">
        {isOverdue ? "days overdue" : "days"}
      </span>
      <span className="text-xs font-medium mt-0.5">{label}</span>
      <span className="text-xs text-muted-foreground">{formatDateShort(date)}</span>
    </div>
  );
}

function StageRail({
  stages,
  workplanProgress,
}: {
  stages: StagePlan[];
  workplanProgress: WorkplanProgressRow[];
}) {
  if (!stages.length) return null;
  const sorted = [...stages].sort((a, b) => a.stage_number - b.stage_number);

  function stageWorkplanSummary(stageNumber: number) {
    const rows = workplanProgress.filter((r) => r.stage_number === stageNumber);
    if (rows.length === 0) return null;
    const total = rows.reduce((s, r) => s + r.total_tasks, 0);
    const completed = rows.reduce((s, r) => s + r.completed_tasks, 0);
    const cancelled = rows.reduce((s, r) => s + r.cancelled_tasks, 0);
    const active = total - cancelled;
    if (active === 0) return null;
    const pct = Math.round((completed / active) * 100);
    return { total: active, completed, pct };
  }

  return (
    <div className="space-y-2.5">
      {sorted.map((stage) => {
        const config = STAGE_STATUS_CONFIG[stage.status] ?? STAGE_STATUS_CONFIG.draft;
        const Icon = config.icon;
        const wp = stageWorkplanSummary(stage.stage_number);
        const wpLabel = stage.workplan_status
          ? WORKPLAN_STATUS_LABELS[stage.workplan_status]
          : null;

        return (
          <div key={stage.plan_id} className="flex items-start gap-3">
            <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${stage.status === "completed" ? "text-green-500" : stage.status === "active" ? "text-blue-500" : stage.status === "blocked" ? "text-destructive" : "text-muted-foreground/40"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-14 shrink-0">
                  Stage {stage.stage_number}
                </span>
                <span className={`text-sm font-medium truncate ${stage.status === "draft" ? "text-muted-foreground" : ""}`}>
                  {stage.stage_name}
                </span>
              </div>
              <div className="flex items-center gap-3 ml-[3.5rem] mt-0.5 flex-wrap">
                {(stage.planned_start_date || stage.actual_start_date) && (
                  <span className="text-xs text-muted-foreground">
                    {stage.actual_start_date
                      ? `Started ${formatDateShort(stage.actual_start_date)}`
                      : `Planned ${formatDateShort(stage.planned_start_date)}`}
                    {stage.actual_end_date
                      ? ` → ${formatDateShort(stage.actual_end_date)}`
                      : stage.planned_end_date
                      ? ` → ${formatDateShort(stage.planned_end_date)}`
                      : ""}
                  </span>
                )}
                {wp && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ListTodo className="h-3 w-3" />
                    {wp.completed}/{wp.total} tasks ({wp.pct}%)
                  </span>
                )}
              </div>
              {wp && wp.total > 0 && (
                <div className="ml-[3.5rem] mt-1">
                  <Progress value={wp.pct} className="h-1" />
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <Badge variant={config.badgeVariant} className="text-xs">
                {config.label}
              </Badge>
              {wpLabel && stage.workplan_status !== "not_started" && (
                <span className={`text-[10px] ${wpLabel.color}`}>
                  {wpLabel.label}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GateCards({ gates }: { gates: GateDefinition[] }) {
  if (!gates.length) return null;
  const sorted = [...gates].sort((a, b) => a.gate_number - b.gate_number);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {sorted.map((gate) => {
        const total = gate.gate_criteria.length;
        const met = gate.gate_criteria.filter((c) => c.is_met).length;
        const allMet = total > 0 && met === total;
        const partiallyMet = met > 0 && !allMet;

        return (
          <div
            key={gate.gate_id}
            className={`rounded-lg border p-3 space-y-1.5 ${
              allMet
                ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"
                : partiallyMet
                ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
                : "border-border bg-muted/30"
            }`}
          >
            <div className="flex items-center gap-2">
              {allMet ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              ) : partiallyMet ? (
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              )}
              <span className="text-xs font-semibold">Gate {gate.gate_number}</span>
              <Badge
                variant={gate.enforcement_type === "hard" ? "destructive" : "secondary"}
                className="text-xs ml-auto"
              >
                {gate.enforcement_type}
              </Badge>
            </div>
            <p className="text-xs font-medium leading-snug">{gate.gate_name}</p>
            {total > 0 && (
              <p className="text-xs text-muted-foreground">
                {met}/{total} criteria met
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CampaignPlanPanel({
  campaignId,
  organiserId,
}: {
  campaignId: number;
  organiserId?: number | null;
}) {
  const supabase = createClient();

  const { data: stages, isLoading: stagesLoading } = useQuery({
    queryKey: ["campaign-stage-plans", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_stage_plans")
        .select(
          "plan_id, stage_number, stage_name, status, workplan_status, planned_start_date, planned_end_date, actual_start_date, actual_end_date"
        )
        .eq("campaign_id", campaignId)
        .order("stage_number");
      if (error) throw error;
      return (data ?? []) as StagePlan[];
    },
  });

  const { data: gates, isLoading: gatesLoading } = useQuery({
    queryKey: ["campaign-gate-definitions", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gate_definitions")
        .select("gate_id, gate_number, gate_name, enforcement_type, gate_criteria(criterion_id, is_met)")
        .eq("campaign_id", campaignId)
        .order("gate_number");
      if (error) throw error;
      return (data ?? []) as GateDefinition[];
    },
  });

  const { data: timeline, isLoading: timelineLoading } = useQuery({
    queryKey: ["campaign-timeline", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_timelines")
        .select(
          "timeline_id, agreement_expiry_date, pabo_available_date, peak_engagement_target_date, agreements(agreement_name, short_name)"
        )
        .eq("campaign_id", campaignId)
        .maybeSingle();
      if (error) throw error;
      return data as CampaignTimeline | null;
    },
  });

  const { data: workplanProgress = [] } = useQuery({
    queryKey: ["campaign-workplan-progress", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_stage_workplan_progress")
        .select("*")
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return (data ?? []) as WorkplanProgressRow[];
    },
  });

  const { data: ouCoverage } = useQuery({
    queryKey: ["campaign-ou-coverage-panel", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_ou_coverage_summary")
        .select("*")
        .eq("campaign_id", campaignId)
        .maybeSingle();
      if (error) throw error;
      return data as OuCoverageRow | null;
    },
  });

  const isLoading = stagesLoading || gatesLoading || timelineLoading;
  const hasPlan = (stages?.length ?? 0) > 0;

  const plannerUrl = `/campaigns/${campaignId}/plan`;
  const createPlanUrl = `/campaigns/new?campaign_id=${campaignId}${organiserId ? `&organiser_id=${organiserId}` : ""}`;

  if (isLoading) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        Loading campaign plan…
      </div>
    );
  }

  if (!hasPlan) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <div className="rounded-full bg-muted/50 p-4">
          <ExternalLink className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-lg">No campaign plan yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            This campaign does not have a strategic plan in OA Planner. Create one to track
            stage progress, gate assessments, and your Theory of Winning.
          </p>
        </div>
        <Button asChild>
          <Link href={createPlanUrl}>
            Create Campaign Plan
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with OAPlanner link */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Campaign Plan</h3>
          {timeline?.agreements && (
            <p className="text-sm text-muted-foreground">
              {timeline.agreements.short_name ?? timeline.agreements.agreement_name}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={plannerUrl}>
            View Full Plan
          </Link>
        </Button>
      </div>

      {/* Timeline Countdown */}
      {timeline && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Key Dates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6 flex-wrap">
              {timeline.agreement_expiry_date && (
                <DaysCountdown
                  date={timeline.agreement_expiry_date}
                  label="to expiry"
                />
              )}
              {timeline.pabo_available_date && (
                <DaysCountdown
                  date={timeline.pabo_available_date}
                  label="to PABO"
                />
              )}
              {timeline.peak_engagement_target_date && (
                <DaysCountdown
                  date={timeline.peak_engagement_target_date}
                  label="to peak engagement"
                />
              )}
              {!timeline.agreement_expiry_date &&
                !timeline.pabo_available_date &&
                !timeline.peak_engagement_target_date && (
                  <p className="text-sm text-muted-foreground">No key dates set</p>
                )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stage Progress with workplan */}
      {stages && stages.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Stage Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <StageRail stages={stages} workplanProgress={workplanProgress} />
          </CardContent>
        </Card>
      )}

      {/* OU Coverage Summary */}
      {ouCoverage && ouCoverage.total_ous > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Organising Unit Coverage</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xl font-bold">{ouCoverage.total_ous}</p>
                <p className="text-xs text-muted-foreground">Units defined</p>
              </div>
              <div>
                <p className="text-xl font-bold">
                  {ouCoverage.ous_with_contact}/{ouCoverage.total_ous}
                </p>
                <p className="text-xs text-muted-foreground">Have contact</p>
              </div>
              <div>
                <p className="text-xl font-bold">
                  {ouCoverage.ous_with_activist}/{ouCoverage.total_ous}
                </p>
                <p className="text-xs text-muted-foreground">Have activist</p>
              </div>
              <div>
                <p className="text-xl font-bold">
                  {ouCoverage.total_assigned_workers}
                </p>
                <p className="text-xs text-muted-foreground">
                  Workers assigned (of {ouCoverage.total_estimated_workers} est.)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gate Assessment Summary */}
      {gates && gates.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Gate Assessments</CardTitle>
          </CardHeader>
          <CardContent>
            <GateCards gates={gates} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
