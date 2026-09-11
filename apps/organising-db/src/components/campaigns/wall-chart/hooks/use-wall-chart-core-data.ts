import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  useCampaignDataFields,
  useCampaignFacts,
  factsByWorkerField,
} from "@/lib/hooks/useCampaignDataFields";
import { useCampaignWorkerListActivity } from "@/lib/hooks/useCampaignWorkerListActivity";
import { collapseActivityRatingsToWorkerMap } from "@/lib/utils/collapse-activity-ratings";
import { useCoverageMap, useWocRepresentationByUnit } from "../../activists/use-coverage-data";
import type { CoverageMapRow } from "../../activists/types";
import { useWallChartAssessmentOptions } from "../assessment-selector";
import type { AssessmentFilterLookup, WallChartFilterState } from "../filters";
import { fetchCampaignMembersFull, type RawCampaignMemberRow } from "../normalize-members";
import { useAllLeaderLinks } from "../use-leader-links";
import type { AssessmentFilterOption } from "../wall-chart-filter-bar";
import { activityIdsForWallChartSelections } from "../wall-chart-model";
import type {
  ActivityRating,
  AssessmentSelection,
  ListActivityChannel,
  WallChartRatingSummary,
} from "../types";
import type { WallChartShellEnv } from "./use-wall-chart-shell-state";

/**
 * WP2.3 block B — the wall chart's core data, moved verbatim out of
 * `campaign-wall-chart.tsx` (`WC:370–523`). Leader links, the units container
 * ref, coverage signals, the members and rating-summary queries, campaign data
 * fields and facts, all per-scope assessment / filter / badge state, the
 * assessment option derivations and the activity-ratings query.
 *
 * The block's internal order is preserved exactly, including the per-scope
 * state being declared above the ratings query it feeds. `unitsContainerRef`
 * (`WC:371`) is the one line of the block that stays with the shell: nothing in
 * this hook reads it, only the shell's JSX and `RelationshipOverlay` do, and a
 * hook that returns a ref makes `react-hooks/refs` treat every sibling output
 * as a ref read during render.
 */
export function useWallChartCoreData({
  campaignId,
  env,
}: {
  campaignId: string;
  env: WallChartShellEnv;
}) {
  const { supabase } = env;

  const { data: allLinks = [] } = useAllLeaderLinks(campaignId);

  // Coverage Map + WOC representation signals for unit-card badges
  // (own query keys — never the canonical ["campaign-ous"] cache).
  const { data: coverageRows = [] } = useCoverageMap(campaignId);
  const { byUnit: wocRepByUnit } = useWocRepresentationByUnit(campaignId);
  const coverageByOu = useMemo(() => {
    const m = new Map<number, CoverageMapRow>();
    for (const r of coverageRows) {
      if (r.ou_id != null) m.set(r.ou_id, r);
    }
    return m;
  }, [coverageRows]);

  const { data: members = [] } = useQuery({
    queryKey: ["campaign-members-full", campaignId],
    queryFn: async () => {
      return (await fetchCampaignMembersFull(supabase, campaignId)) as RawCampaignMemberRow[];
    },
  });

  const { data: ratingSummary = [] } = useQuery({
    queryKey: ["campaign-rating-summary", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_rating_summary")
        .select("*")
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return (data ?? []) as WallChartRatingSummary[];
    },
  });

  const { data: dataFieldsCat } = useCampaignDataFields(campaignId);
  const dataFields = dataFieldsCat?.fields ?? [];
  const { data: campaignFacts = [] } = useCampaignFacts(campaignId);
  const factsByWorker = useMemo(
    () => factsByWorkerField(campaignFacts),
    [campaignFacts]
  );

  const [campaignAssessmentDefault, setCampaignAssessmentDefault] =
    useState<AssessmentSelection>({ kind: "cumulative" });
  const [unitAssessmentOverride, setUnitAssessmentOverride] = useState<
    Map<number, AssessmentSelection>
  >(() => new Map());

  // Per-unit filter state. Key 0 = unassigned, positive = ou_id. Declared here
  // (above the ratings query) so a per-assessment rating filter can pull that
  // assessment's ratings into the query below.
  const [filterByScope, setFilterByScope] = useState<
    Map<number, WallChartFilterState>
  >(() => new Map());

  // Assessment metadata for the filter bar's per-assessment rating filters and
  // for evaluating them (binary-aware). Shares the cached selector query.
  const { data: assessmentOptions = [] } =
    useWallChartAssessmentOptions(campaignId);

  const assessmentFilterOptions = useMemo<AssessmentFilterOption[]>(
    () =>
      assessmentOptions.map((o) => ({
        activityId: o.activity_id,
        title: o.title,
        isBinary: o.is_binary,
      })),
    [assessmentOptions]
  );

  const assessmentSelectionByActivity = useMemo(() => {
    const m = new Map<
      number,
      Extract<AssessmentSelection, { kind: "assessment" }>
    >();
    for (const o of assessmentOptions) {
      m.set(o.activity_id, {
        kind: "assessment",
        activityId: o.activity_id,
        title: o.title,
        isBinary: o.is_binary,
        supporterOutcomeValue: o.supporter_outcome_value,
        ratingLabels: o.rating_labels,
      });
    }
    return m;
  }, [assessmentOptions]);

  // Which list-activity badges (phone / email / activist list / sms) show on
  // worker tiles. Campaign-level default, overridable per unit (undefined =
  // inherit default). Default off so tiles stay uncluttered until opted in.
  const [campaignBadgeDefault, setCampaignBadgeDefault] = useState<
    Set<ListActivityChannel>
  >(() => new Set());
  const [unitBadgeOverride, setUnitBadgeOverride] = useState<
    Map<number, Set<ListActivityChannel> | undefined>
  >(() => new Map());

  const { byWorker: listActivityByWorker } =
    useCampaignWorkerListActivity(campaignId);

  // Assessment ids whose ratings must be loaded: the campaign/unit view
  // selections plus any per-assessment rating filter across scopes.
  const activityIdsForRatings = useMemo(() => {
    const set = new Set<number>(
      activityIdsForWallChartSelections(
        campaignAssessmentDefault,
        unitAssessmentOverride
      )
    );
    for (const st of filterByScope.values()) {
      for (const af of st.assessmentFilters) {
        if (af.buckets.size > 0) set.add(af.activityId);
      }
    }
    return [...set].sort((a, b) => a - b);
  }, [campaignAssessmentDefault, unitAssessmentOverride, filterByScope]);

  const activityIdsKey = activityIdsForRatings.join(",");

  const { data: activityRatingsByActivityId = new Map<number, Map<number, ActivityRating>>() } =
    useQuery({
      queryKey: ["campaign-activity-ratings", campaignId, activityIdsKey],
      enabled: activityIdsForRatings.length > 0,
      queryFn: async () => {
        const { data, error } = await supabase
          .from("campaign_activity_ratings")
          .select(
            "rating_id, worker_id, activity_id, rating, binary_value, rating_phase, rated_at, source, notes"
          )
          .in("activity_id", activityIdsForRatings);
        if (error) throw error;

        const byActivityRows = new Map<number, ActivityRating[]>();
        for (const row of (data ?? []) as ActivityRating[]) {
          const list = byActivityRows.get(row.activity_id) ?? [];
          list.push(row);
          byActivityRows.set(row.activity_id, list);
        }
        const out = new Map<number, Map<number, ActivityRating>>();
        for (const id of activityIdsForRatings) {
          const rows = byActivityRows.get(id) ?? [];
          out.set(id, collapseActivityRatingsToWorkerMap(rows));
        }
        return out;
      },
    });

  const assessmentFilterLookup = useMemo<AssessmentFilterLookup>(
    () => ({
      ratingsByActivity: activityRatingsByActivityId,
      selectionByActivity: assessmentSelectionByActivity,
    }),
    [activityRatingsByActivityId, assessmentSelectionByActivity]
  );

  return {
    leaderLinks: allLinks,
    coverage: { coverageRows, coverageByOu, wocRepByUnit },
    rawMembers: members,
    ratingSummary,
    dataFields,
    facts: { factsByWorker },
    listActivityByWorker,
    scopeState: {
      campaignAssessmentDefault,
      setCampaignAssessmentDefault,
      unitAssessmentOverride,
      setUnitAssessmentOverride,
      filterByScope,
      setFilterByScope,
      campaignBadgeDefault,
      setCampaignBadgeDefault,
      unitBadgeOverride,
      setUnitBadgeOverride,
    },
    assessmentOptions: {
      options: assessmentOptions,
      filterOptions: assessmentFilterOptions,
      selectionByActivity: assessmentSelectionByActivity,
    },
    activityRatings: activityRatingsByActivityId,
    activityRatingLookup: assessmentFilterLookup,
  };
}

export type WallChartCoreData = ReturnType<typeof useWallChartCoreData>;
export type WallChartScopeState = WallChartCoreData["scopeState"];
export type WallChartAssessmentOptionSet = WallChartCoreData["assessmentOptions"];
