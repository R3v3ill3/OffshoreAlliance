"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  UNIT_RATING_LEVELS,
  unitRatingLevel,
  averageSubunitRating,
} from "@/lib/campaign/unit-rating";

/**
 * Subjective 1..5 organiser rating for an organising unit / sub-unit, shown in
 * the wall-chart unit card header. Mirrors the control in the Campaign units
 * view. Containers also surface the average of their sub-units' ratings.
 */
export function UnitRatingControl({
  ouId,
  rating,
  childRatings = [],
  isContainer = false,
  canWrite,
  campaignId,
}: {
  ouId: number;
  rating: number | null | undefined;
  childRatings?: (number | null | undefined)[];
  isContainer?: boolean;
  canWrite: boolean;
  campaignId: string | number;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const childAvg = averageSubunitRating(childRatings);
  const current = rating ?? null;

  const rate = useAuthAwareMutation({
    mutationFn: async (value: number | null) => {
      const scoped = supabase as unknown as {
        from: (t: string) => {
          update: (v: Record<string, unknown>) => {
            eq: (c: string, val: unknown) => Promise<{ error: Error | null }>;
          };
        };
      };
      const { error } = await scoped
        .from("campaign_organising_units")
        .update({ user_rating: value })
        .eq("ou_id", ouId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaign-ous", campaignId] }),
    onError: (e: Error) => window.alert(e.message || "Could not save rating"),
  });

  const ownLevel = unitRatingLevel(current);
  const avgLevel = unitRatingLevel(childAvg);

  return (
    <div className="flex items-center gap-1 flex-wrap print:hidden">
      <span className="text-[10px] text-muted-foreground">Rating:</span>
      {UNIT_RATING_LEVELS.map((lvl) => {
        const selected = current === lvl.value;
        return (
          <button
            key={lvl.value}
            type="button"
            disabled={!canWrite || rate.isPending}
            title={lvl.label}
            aria-label={`Rate ${lvl.value} — ${lvl.label}`}
            onClick={() => rate.mutate(selected ? null : lvl.value)}
            className={`h-5 w-5 rounded text-[10px] font-semibold ${lvl.bg} ${lvl.text} ${
              selected ? "ring-2 ring-offset-1 ring-foreground" : "opacity-50 hover:opacity-100"
            } ${canWrite ? "" : "cursor-default"}`}
          >
            {lvl.value}
          </button>
        );
      })}
      {ownLevel && (
        <Badge className={`${ownLevel.bg} ${ownLevel.text} border-transparent text-[10px]`}>
          {ownLevel.label}
        </Badge>
      )}
      {isContainer && childAvg != null && avgLevel && (
        <Badge className={`${avgLevel.bg} ${avgLevel.text} border-transparent text-[10px]`}>
          Sub-unit avg {childAvg.toFixed(1)} · {avgLevel.label}
        </Badge>
      )}
    </div>
  );
}
