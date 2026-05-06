"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type {
  AssessmentSelection,
  WallChartAssessmentOption,
} from "./types";

export const CUMULATIVE_VALUE = "__cumulative__";
export const INHERIT_VALUE = "__inherit__";

export async function fetchWallChartAssessmentOptions(
  supabase: SupabaseClient,
  campaignId: string
): Promise<WallChartAssessmentOption[]> {
  const { data: activities, error: actErr } = await supabase
    .from("campaign_activities")
    .select(
      `activity_id, title, is_binary, supporter_outcome_value, created_at,
       activity_ambitions(plan_ambition_id)`
    )
    .eq("campaign_id", campaignId)
    .eq("activity_kind", "assessment");
  if (actErr) throw actErr;

  const rows = (activities ?? []) as Array<{
    activity_id: number;
    title: string;
    is_binary: boolean | null;
    supporter_outcome_value: string | null;
    created_at: string | null;
    activity_ambitions:
      | { plan_ambition_id: number }[]
      | { plan_ambition_id: number }
      | null;
  }>;

  const byId = new Map<number, WallChartAssessmentOption>();
  for (const r of rows) {
    const ambitions = r.activity_ambitions;
    const hasLinked =
      Array.isArray(ambitions) ? ambitions.length > 0 : ambitions != null;
    const existing = byId.get(r.activity_id);
    if (existing) {
      existing.has_linked_ambition = existing.has_linked_ambition || hasLinked;
      continue;
    }
    byId.set(r.activity_id, {
      activity_id: r.activity_id,
      title: r.title,
      is_binary: Boolean(r.is_binary),
      supporter_outcome_value: r.supporter_outcome_value,
      created_at: r.created_at,
      last_rated_at: null,
      has_linked_ambition: hasLinked,
    });
  }

  const ids = Array.from(byId.keys());
  if (ids.length === 0) return [];

  const { data: ratings, error: rErr } = await supabase
    .from("campaign_activity_ratings")
    .select("activity_id, rated_at")
    .in("activity_id", ids)
    .order("rated_at", { ascending: false });
  if (rErr) throw rErr;

  const latestByActivity = new Map<number, string>();
  for (const row of (ratings ?? []) as Array<{
    activity_id: number;
    rated_at: string | null;
  }>) {
    if (row.rated_at == null) continue;
    if (!latestByActivity.has(row.activity_id)) {
      latestByActivity.set(row.activity_id, row.rated_at);
    }
  }
  for (const opt of byId.values()) {
    opt.last_rated_at = latestByActivity.get(opt.activity_id) ?? null;
  }

  return Array.from(byId.values()).sort((a, b) => {
    const aKey = a.last_rated_at ?? "";
    const bKey = b.last_rated_at ?? "";
    if (aKey !== bKey) return aKey < bKey ? 1 : -1;
    const aCreated = a.created_at ?? "";
    const bCreated = b.created_at ?? "";
    if (aCreated !== bCreated) return aCreated < bCreated ? 1 : -1;
    return a.title.localeCompare(b.title);
  });
}

export function useWallChartAssessmentOptions(campaignId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["campaign-assessments-rated", campaignId],
    queryFn: () => fetchWallChartAssessmentOptions(supabase, campaignId),
  });
}

export type AssessmentSelectorProps = {
  campaignId: string;
  value: AssessmentSelection;
  onChange: (next: AssessmentSelection) => void;
};

/**
 * Campaign-level dropdown: cumulative vs a specific assessment (drives default
 * for all units unless a unit overrides).
 */
export function AssessmentSelector({
  campaignId,
  value,
  onChange,
}: AssessmentSelectorProps) {
  const { data: options = [], isLoading } = useWallChartAssessmentOptions(campaignId);

  const selectValue =
    value.kind === "cumulative" ? CUMULATIVE_VALUE : String(value.activityId);

  const handleChange = (next: string) => {
    if (next === CUMULATIVE_VALUE) {
      onChange({ kind: "cumulative" });
      return;
    }
    const id = Number(next);
    const opt = options.find((o) => o.activity_id === id);
    if (!opt) return;
    onChange({
      kind: "assessment",
      activityId: opt.activity_id,
      title: opt.title,
      isBinary: opt.is_binary,
      supporterOutcomeValue: opt.supporter_outcome_value,
    });
  };

  const groupedAssessments = useMemo(() => {
    const withRatings = options.filter((o) => o.last_rated_at != null);
    const withoutRatings = options.filter((o) => o.last_rated_at == null);
    return { withRatings, withoutRatings };
  }, [options]);

  return (
    <div className="flex flex-col gap-1 min-w-[14rem]">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Assessment view (campaign default)
      </Label>
      <Select value={selectValue} onValueChange={handleChange} disabled={isLoading}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={isLoading ? "Loading…" : "Select assessment view…"} />
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 ? (
            <SelectGroup>
              <SelectLabel className="text-[10px]">No assessments in this campaign</SelectLabel>
              <SelectItem value={CUMULATIVE_VALUE}>Cumulative</SelectItem>
            </SelectGroup>
          ) : (
            <>
              {groupedAssessments.withRatings.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-[10px]">Assessments</SelectLabel>
                  {groupedAssessments.withRatings.map((opt) => (
                    <SelectItem
                      key={opt.activity_id}
                      value={String(opt.activity_id)}
                    >
                      {opt.title}
                      {opt.is_binary ? " (binary)" : ""}
                      {!opt.has_linked_ambition ? " · no plan link" : ""}
                      {opt.last_rated_at
                        ? ` · ${new Date(opt.last_rated_at).toLocaleDateString()}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {groupedAssessments.withoutRatings.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-[10px]">Not yet rated</SelectLabel>
                  {groupedAssessments.withoutRatings.map((opt) => (
                    <SelectItem
                      key={opt.activity_id}
                      value={String(opt.activity_id)}
                    >
                      {opt.title}
                      {opt.is_binary ? " (binary)" : ""}
                      {!opt.has_linked_ambition ? " · no plan link" : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              <SelectSeparator />
              <SelectGroup>
                <SelectItem value={CUMULATIVE_VALUE}>Cumulative</SelectItem>
              </SelectGroup>
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

export type UnitAssessmentViewControlProps = {
  campaignId: string;
  /** Campaign-level default (for labels when inheriting). */
  campaignDefault: AssessmentSelection;
  /** When undefined, this unit uses `campaignDefault`. */
  override: AssessmentSelection | undefined;
  onChangeOverride: (next: AssessmentSelection | undefined) => void;
};

function campaignDefaultShortLabel(s: AssessmentSelection): string {
  return s.kind === "cumulative" ? "Cumulative" : s.title;
}

/**
 * Per-unit override: inherit campaign default, cumulative, or a specific assessment.
 */
export function UnitAssessmentViewControl({
  campaignId,
  campaignDefault,
  override,
  onChangeOverride,
}: UnitAssessmentViewControlProps) {
  const { data: options = [], isLoading } = useWallChartAssessmentOptions(campaignId);

  const effective = override ?? campaignDefault;
  const selectValue =
    override === undefined
      ? INHERIT_VALUE
      : effective.kind === "cumulative"
        ? CUMULATIVE_VALUE
        : String(effective.activityId);

  const handleChange = (next: string) => {
    if (next === INHERIT_VALUE) {
      onChangeOverride(undefined);
      return;
    }
    if (next === CUMULATIVE_VALUE) {
      onChangeOverride({ kind: "cumulative" });
      return;
    }
    const id = Number(next);
    const opt = options.find((o) => o.activity_id === id);
    if (!opt) return;
    onChangeOverride({
      kind: "assessment",
      activityId: opt.activity_id,
      title: opt.title,
      isBinary: opt.is_binary,
      supporterOutcomeValue: opt.supporter_outcome_value,
    });
  };

  const groupedAssessments = useMemo(() => {
    const withRatings = options.filter((o) => o.last_rated_at != null);
    const withoutRatings = options.filter((o) => o.last_rated_at == null);
    return { withRatings, withoutRatings };
  }, [options]);

  const inheritHint = campaignDefaultShortLabel(campaignDefault);

  return (
    <div className="flex flex-col gap-0.5 min-w-[10rem] max-w-[12rem]">
      <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">
        View
      </Label>
      <Select value={selectValue} onValueChange={handleChange} disabled={isLoading}>
        <SelectTrigger className="h-7 text-[10px] px-2">
          <SelectValue placeholder={isLoading ? "…" : "View"} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel className="text-[10px]">Unit</SelectLabel>
            <SelectItem value={INHERIT_VALUE}>
              Default ({inheritHint})
            </SelectItem>
          </SelectGroup>
          {options.length > 0 && (
            <>
              {groupedAssessments.withRatings.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-[10px]">Assessments</SelectLabel>
                  {groupedAssessments.withRatings.map((opt) => (
                    <SelectItem key={opt.activity_id} value={String(opt.activity_id)}>
                      {opt.title}
                      {opt.is_binary ? " (bin)" : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {groupedAssessments.withoutRatings.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-[10px]">Not rated</SelectLabel>
                  {groupedAssessments.withoutRatings.map((opt) => (
                    <SelectItem key={opt.activity_id} value={String(opt.activity_id)}>
                      {opt.title}
                      {opt.is_binary ? " (bin)" : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </>
          )}
          <SelectSeparator />
          <SelectGroup>
            <SelectItem value={CUMULATIVE_VALUE}>Cumulative only</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
