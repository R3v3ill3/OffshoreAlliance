import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { trackWallchartGroupSelected } from "@/lib/analytics/events";
import {
  groupParamValue,
  orderGroups,
  parseGroupParam,
  resolveGroupSelection,
  type GroupSelection,
  type GroupSelectionSource,
} from "@/lib/campaign/groups/resolve-group-selection";
import type { SetWallChartPrefs } from "@/lib/hooks/useUserCampaignPrefs";
import type { WallChartOU } from "../types";
import type { WallChartShellV2Env } from "./use-wall-chart-shell-v2";

/** One `campaign_groups` row as the wall chart reads it (wp2.4.md §3.3). */
export type CampaignGroupRow = {
  group_id: number;
  kind: string;
  name: string;
  display_order: number;
};

export const CAMPAIGN_GROUPS_QUERY_KEY = "campaign-groups";

/**
 * WP2.4 — which Group the chart shows (wp2.4.md §3.4 A′ addition, §3.11).
 *
 * Reads `campaign_groups` (RLS, no writes), resolves the selection through
 * the pure precedence chain (`?ou=` → `?group=` → prefs → first → none), and
 * owns the setter: a change writes `?group=` (preserving every other param,
 * dropping `?ou=` so the focused unit's group stops winning), writes the
 * prefs document, records the telemetry and clears the selection.
 *
 * On first render, once groups, units and prefs are known, the resolved
 * selection is written to the URL when `?group=` is absent or invalid, so a
 * copied link always carries the view. A change made in this mount stays in
 * force until the URL catches up (Next's `router.replace` re-renders with the
 * new params; a test double may never do so), and is dropped the moment the
 * URL names a different group.
 */
export function useWallChartGroups({
  campaignId,
  env,
  prefsGroup,
  prefsSettled,
  setWallChart,
  clearSelection,
}: {
  campaignId: string;
  env: Pick<WallChartShellV2Env, "supabase" | "router" | "pathname" | "searchParams">;
  prefsGroup: GroupSelection | null | undefined;
  /** The prefs read has resolved (success or error). */
  prefsSettled: boolean;
  setWallChart: SetWallChartPrefs;
  clearSelection: () => void;
}) {
  const { supabase, router, pathname, searchParams } = env;

  // The units query of the legacy block C, same key and same fetch, issued
  // here because the `?ou=` step of the resolution needs the units' groups
  // before the group view (which consumes the selection) can run.
  const ousQuery = useQuery({
    queryKey: ["campaign-ous", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WallChartOU[];
    },
  });
  const ous = useMemo(() => ousQuery.data ?? [], [ousQuery.data]);
  const ousLoaded = ousQuery.isSuccess;

  const query = useQuery({
    queryKey: [CAMPAIGN_GROUPS_QUERY_KEY, campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_groups")
        .select("group_id, kind, name, display_order")
        .eq("campaign_id", Number(campaignId))
        .order("display_order", { ascending: true })
        .order("group_id", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CampaignGroupRow[];
    },
  });
  const groupsLoaded = query.isSuccess;
  const groups = useMemo(() => orderGroups(query.data ?? []), [query.data]);
  const groupById = useMemo(() => {
    const m = new Map<number, CampaignGroupRow>();
    for (const g of groups) m.set(g.group_id, g);
    return m;
  }, [groups]);
  const groupNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of groups) m.set(g.group_id, g.name);
    return m;
  }, [groups]);

  const ouParam = searchParams.get("ou");
  const groupParam = searchParams.get("group");
  const ready = groupsLoaded && ousLoaded && prefsSettled;

  const resolved = useMemo(
    () => resolveGroupSelection({ groups, ous, ouParam, groupParam, prefsGroup }),
    [groups, ous, ouParam, groupParam, prefsGroup]
  );

  // A change made here, remembered together with the `?group=` it was made
  // under: it applies while the URL still shows that value (or none) and is
  // superseded as soon as the URL names something else.
  const [chosen, setChosen] = useState<{ selection: GroupSelection; underParam: string | null } | null>(null);
  const chosenApplies =
    chosen !== null &&
    (chosen.underParam === groupParam || groupParam === groupParamValue(chosen.selection)) &&
    (chosen.selection === "none" || groupById.has(chosen.selection));
  const selection: GroupSelection = chosenApplies ? chosen.selection : resolved.selection;
  const source: GroupSelectionSource = chosenApplies ? "url" : resolved.source;

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  // First render: put the resolved view in the URL when the param is absent
  // or names nothing (§3.11). Once per resolved value, never in a loop.
  const written = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || chosen !== null) return;
    const fromUrl = parseGroupParam(groupParam);
    const valid = fromUrl !== null && (fromUrl === "none" || groupById.has(fromUrl));
    if (valid) return;
    const value = groupParamValue(resolved.selection);
    if (written.current === value) return;
    written.current = value;
    replaceParams((params) => params.set("group", value));
  }, [ready, chosen, groupParam, groupById, resolved.selection, replaceParams]);

  const setSelection = useCallback(
    (next: GroupSelection) => {
      if (next === selection) return;
      const previous = selection === "none" ? null : (groupById.get(selection)?.kind ?? null);
      trackWallchartGroupSelected({
        campaign_id: Number(campaignId),
        ou_type: next === "none" ? null : (groupById.get(next)?.kind ?? null),
        previous_ou_type: previous,
        group_count: groups.length,
        control: "group_selector",
      });
      setChosen({ selection: next, underParam: groupParam });
      replaceParams((params) => {
        params.set("group", groupParamValue(next));
        params.delete("ou");
      });
      setWallChart({ group: next });
      clearSelection();
    },
    [selection, groupById, campaignId, groups.length, groupParam, replaceParams, setWallChart, clearSelection]
  );

  const selectedGroup = selection === "none" ? null : (groupById.get(selection) ?? null);

  return {
    ous,
    ousLoaded,
    groups,
    groupsLoaded,
    groupById,
    groupNameById,
    /** `true` once groups, units and prefs are all known: the selection is final. */
    ready,
    selection,
    source,
    selectedGroup,
    setSelection,
  };
}

export type WallChartGroupsState = ReturnType<typeof useWallChartGroups>;
