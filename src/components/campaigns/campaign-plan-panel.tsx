"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, CheckCircle2, XCircle, Clock, AlertCircle, Circle } from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";

const OA_PLANNER_URL = process.env.NEXT_PUBLIC_OA_PLANNER_URL ?? "https://oaplanner.uconstruct.app";

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
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
}

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

function StageRail({ stages }: { stages: StagePlan[] }) {
  if (!stages.length) return null;
  const sorted = [...stages].sort((a, b) => a.stage_number - b.stage_number);

  return (
    <div className="space-y-1.5">
      {sorted.map((stage) => {
        const config = STAGE_STATUS_CONFIG[stage.status] ?? STAGE_STATUS_CONFIG.draft;
        const Icon = config.icon;
        return (
          <div key={stage.plan_id} className="flex items-center gap-3">
            <Icon className={`h-4 w-4 shrink-0 ${stage.status === "completed" ? "text-green-500" : stage.status === "active" ? "text-blue-500" : stage.status === "blocked" ? "text-destructive" : "text-muted-foreground/40"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-14 shrink-0">
                  Stage {stage.stage_number}
                </span>
                <span className={`text-sm font-medium truncate ${stage.status === "draft" ? "text-muted-foreground" : ""}`}>
                  {stage.stage_name}
                </span>
              </div>
              {(stage.planned_start_date || stage.actual_start_date) && (
                <div className="text-xs text-muted-foreground ml-[3.5rem]">
                  {stage.actual_start_date
                    ? `Started ${formatDateShort(stage.actual_start_date)}`
                    : `Planned ${formatDateShort(stage.planned_start_date)}`}
                  {stage.actual_end_date
                    ? ` → completed ${formatDateShort(stage.actual_end_date)}`
                    : stage.planned_end_date
                    ? ` → ${formatDateShort(stage.planned_end_date)}`
                    : ""}
                </div>
              )}
            </div>
            <Badge variant={config.badgeVariant} className="shrink-0 text-xs">
              {config.label}
            </Badge>
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
          "plan_id, stage_number, stage_name, status, planned_start_date, planned_end_date, actual_start_date, actual_end_date"
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

  const isLoading = stagesLoading || gatesLoading || timelineLoading;
  const hasPlan = (stages?.length ?? 0) > 0;

  const plannerUrl = `${OA_PLANNER_URL}/campaigns/${campaignId}`;
  const createPlanUrl = [
    `${OA_PLANNER_URL}/campaigns/new`,
    `?campaign_id=${campaignId}`,
    organiserId ? `&organiser_id=${organiserId}` : "",
  ].join("");

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
          <a href={createPlanUrl}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Create Campaign Plan in OA Planner
          </a>
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
          <a href={plannerUrl}>
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Open in OA Planner
          </a>
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

      {/* Stage Progress */}
      {stages && stages.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Stage Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <StageRail stages={stages} />
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
