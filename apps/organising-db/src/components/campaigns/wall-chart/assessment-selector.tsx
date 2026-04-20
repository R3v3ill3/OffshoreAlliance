"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
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

const CUMULATIVE_VALUE = "__cumulative__";

export type AssessmentSelectorProps = {
  campaignId: string;
  value: AssessmentSelection;
  onChange: (next: AssessmentSelection) => void;
};

/**
 * Prominent dropdown that controls which rating source drives the wall chart
 * tile colour, the unit summary metrics, and the inline rating popover.
 *
 * Lists assessments (campaign_activities with activity_kind='assessment') that
 * have at least one linked ambition via activity_ambitions — these are what
 * the user calls "assessments with rating capacity attached". Plus a single
 * "Cumulative" option at the bottom of the list.
 *
 * On first load, when the selection is Cumulative and there is at least one
 * assessment with ratings, auto-selects the assessment with the most recent
 * rated_at (the "latest assessment").
 */
export function AssessmentSelector({
  campaignId,
  value,
  onChange,
}: AssessmentSelectorProps) {
  const supabase = createClient();

  const { data: options = [], isLoading } = useQuery({
    queryKey: ["campaign-assessments-rated", campaignId],
    queryFn: async () => {
      // 1. Pull all assessment activities for this campaign that have at least
      //    one row in activity_ambitions.
      const { data: activities, error: actErr } = await supabase
        .from("campaign_activities")
        .select(
          `activity_id, title, is_binary, supporter_outcome_value, created_at,
           activity_ambitions!inner(plan_ambition_id)`
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
      }>;

      // Deduplicate by activity_id (inner join may emit one row per ambition).
      const byId = new Map<number, WallChartAssessmentOption>();
      for (const r of rows) {
        if (byId.has(r.activity_id)) continue;
        byId.set(r.activity_id, {
          activity_id: r.activity_id,
          title: r.title,
          is_binary: Boolean(r.is_binary),
          supporter_outcome_value: r.supporter_outcome_value,
          created_at: r.created_at,
          last_rated_at: null,
        });
      }

      const ids = Array.from(byId.keys());
      if (ids.length === 0) return [] as WallChartAssessmentOption[];

      // 2. Pull the most recent rated_at per activity.
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
    },
  });

  // Auto-pick the latest rated assessment once the options load, unless the
  // user (or parent) has already chosen something.
  useEffect(() => {
    if (isLoading) return;
    if (value.kind !== "cumulative") return;
    const firstWithRating = options.find((o) => o.last_rated_at != null);
    if (firstWithRating) {
      onChange({
        kind: "assessment",
        activityId: firstWithRating.activity_id,
        title: firstWithRating.title,
        isBinary: firstWithRating.is_binary,
      });
    }
    // We intentionally omit `value` from deps — only run on options load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, options]);

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
        Assessment view
      </Label>
      <Select value={selectValue} onValueChange={handleChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select assessment view…" />
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 ? (
            <SelectGroup>
              <SelectLabel className="text-[10px]">
                No assessments with rating capacity
              </SelectLabel>
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
