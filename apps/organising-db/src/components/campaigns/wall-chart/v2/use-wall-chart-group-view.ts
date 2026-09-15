import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { toast } from "sonner";

import { structureApi } from "@/lib/campaign/structure-api";
import { structureErrorMessage } from "@/lib/campaign/structure-error-message";
import {
  deriveGroupView,
  notInAnyGroup,
  unitsByWorker as unitsByWorkerAllGroups,
  unitsOfGroup,
} from "@/lib/campaign/groups/derive-group-view";
import type { GroupSelection } from "@/lib/campaign/groups/resolve-group-selection";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import type { SetWallChartPrefs } from "@/lib/hooks/useUserCampaignPrefs";
import { useFirstUseHint } from "@/lib/hints/use-first-use-hint";
import type { RatingHintAnchor } from "@/lib/hints/pick-rating-hint-anchor";
import { fetchOuAssignments, normalizeCampaignMemberRows } from "../normalize-members";
import { useBuildList } from "../use-build-list";
import type { WorkerSearchItem } from "../worker-search";
import { ouDisplayName } from "../types";
import type {
  WallChartMemberRow,
  WallChartOU,
  WallChartOUAssignment,
  WallChartRatingSummary,
  WallChartWorker,
} from "../types";
import type { WallChartCoreData } from "../hooks/use-wall-chart-core-data";
import type { CampaignGroupRow } from "./use-wall-chart-groups";
import type { HighlightKey, WallChartShellV2Env } from "./use-wall-chart-shell-v2";

/** `data-ou-id` values the v2 chart puts on its cards (wp2.4.md §3.12). */
export const UNASSIGNED_CARD_KEY = "unassigned";
export const NOT_IN_ANY_GROUP_CARD_KEY = "not-in-any-group";

/** The tile resolves overrides up this chain; v2 has no nesting and no overrides, so it is empty. */
const EMPTY_PARENT_MAP = new Map<number, number | null>();

/**
 * WP2.4 block C′ — the v2 wall chart's structure (wp2.4.md §3.4).
 *
 * The same units / placements / campaign queries and keys as the legacy
 * block C (so the caches are shared with the legacy chart, the list view and
 * the detail provider), the member normalisation, the build-list controller
 * and the unit reorder mutation — and, in place of the `ou_type` bands, the
 * parent/child tree and the campaign-wide Unassigned, ONE group view from
 * `deriveGroupView` (principle 5: derived, never stored), the per-user hidden
 * set from prefs (HU-a), the group-scoped tile index (§3.13, so a worker is
 * never "in multiple units" on screen), the group-scoped worker search and
 * jump (§3.12), and the WP1.7 rating-hint anchor in the v2 card order (units
 * first, Unassigned last).
 */
export function useWallChartGroupView({
  campaignId,
  canWrite,
  env,
  selection,
  groups,
  ous,
  members,
  ratingSummary,
  hiddenOuIds,
  setWallChart,
  focusOuId,
  setHighlightedOuId,
}: {
  campaignId: string;
  canWrite: boolean;
  env: WallChartShellV2Env;
  selection: GroupSelection;
  groups: readonly CampaignGroupRow[];
  /** The units query's rows (issued by `useWallChartGroups`, same key as the legacy block C). */
  ous: WallChartOU[];
  members: WallChartCoreData["rawMembers"];
  ratingSummary: WallChartCoreData["ratingSummary"];
  hiddenOuIds: ReadonlySet<number>;
  setWallChart: SetWallChartPrefs;
  focusOuId: number | null;
  setHighlightedOuId: (key: HighlightKey | null) => void;
}) {
  const { supabase, queryClient, workerDetail } = env;

  const nextDisplayOrder = useMemo(() => {
    if (ous.length === 0) return 0;
    return Math.max(...ous.map((o) => o.display_order ?? 0)) + 1;
  }, [ous]);

  // WP2.2 §3.11 row 7 / WP2.4 §3.12: `structure_unit_reorder` over the
  // selected group's ids only; other groups' units are untouched (§8.2).
  const reorderOus = useAuthAwareMutation({
    mutationFn: async (orderedOuIds: number[]) => {
      await structureApi(supabase).units.reorder({
        campaignId: Number(campaignId),
        ouIds: orderedOuIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-ous", campaignId] });
    },
    // The one v2 write that was silent on refusal (fix round 2, A3).
    onError: (e: Error) => toast.error(structureErrorMessage(e, "Reordering the Units failed.")),
  });

  const ouIdsKey = ous.map((o) => o.ou_id).join(",");
  const { data: ouAssign = [] } = useQuery({
    queryKey: ["campaign-worker-ou", campaignId, ouIdsKey],
    queryFn: async () => {
      const ids = ous.map((o) => o.ou_id);
      if (ids.length === 0) return [] as WallChartOUAssignment[];
      return (await fetchOuAssignments(supabase, ids)) as WallChartOUAssignment[];
    },
    enabled: ous.length > 0,
  });

  const { data: campaign } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("total_worker_estimate, name")
        .eq("campaign_id", campaignId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // ---- Members ---------------------------------------------------------------
  const memberRows = useMemo<WallChartMemberRow[]>(
    () => normalizeCampaignMemberRows(members),
    [members]
  );
  const workerById = useMemo(() => {
    const m = new Map<number, WallChartWorker>();
    for (const row of memberRows) if (row.worker) m.set(row.worker_id, row.worker);
    return m;
  }, [memberRows]);
  const ratingByWorker = useMemo(() => {
    const m = new Map<number, WallChartRatingSummary>();
    for (const r of ratingSummary) m.set(r.worker_id, r);
    return m;
  }, [ratingSummary]);
  const compareWorkerIds = useCallback(
    (a: number, b: number) => {
      const na = workerById.get(a);
      const nb = workerById.get(b);
      const lastCmp = (na?.last_name ?? "").localeCompare(nb?.last_name ?? "", undefined, {
        sensitivity: "base",
      });
      if (lastCmp !== 0) return lastCmp;
      const firstCmp = (na?.first_name ?? "").localeCompare(nb?.first_name ?? "", undefined, {
        sensitivity: "base",
      });
      if (firstCmp !== 0) return firstCmp;
      return a - b;
    },
    [workerById]
  );

  // ---- Build list (block C, unchanged) ------------------------------------------
  const buildListWorkerSnapshot = useCallback(
    (id: number) => {
      const w = workerById.get(id);
      if (!w) return null;
      const role = w.member_role_type;
      return {
        worker: {
          worker_id: w.worker_id,
          first_name: w.first_name,
          last_name: w.last_name,
          email: w.email,
          phone: w.phone,
          phone_e164: null,
          sms_opt_out: null,
          is_hsr: w.is_hsr,
          is_bargaining_rep: w.is_bargaining_rep,
          member_role_type: role
            ? {
                role_type_id: role.role_type_id,
                role_name: role.role_name,
                display_name: role.display_name,
              }
            : null,
        },
        cumulative_rating: ratingByWorker.get(id)?.cumulative_rating ?? null,
        source_ou: null,
      };
    },
    [workerById, ratingByWorker]
  );
  const buildListController = useBuildList({ campaignId, workerSnapshot: buildListWorkerSnapshot });
  const buildListWorkerIds = useMemo(() => {
    const s = new Set<number>();
    for (const item of buildListController.detail.data?.items ?? []) s.add(item.worker_id);
    return s;
  }, [buildListController.detail.data]);

  // ---- Names and the all-groups index (for "in unit of another group") ----------
  const ouNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const ou of ous) m.set(ou.ou_id, ouDisplayName(ou));
    return m;
  }, [ous]);
  const ouTypeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const ou of ous) if (ou.ou_type) m.set(ou.ou_id, ou.ou_type);
    return m;
  }, [ous]);
  const ouById = useMemo(() => {
    const m = new Map<number, WallChartOU>();
    for (const ou of ous) m.set(ou.ou_id, ou);
    return m;
  }, [ous]);
  const unitsByWorkerAll = useMemo(() => unitsByWorkerAllGroups(ouAssign), [ouAssign]);

  // ---- The group view (§3.3) ------------------------------------------------------
  const groupId = selection === "none" ? null : selection;
  const view = useMemo(() => {
    if (groupId == null) return null;
    const v = deriveGroupView(memberRows, ous, ouAssign, groupId);
    for (const list of v.workersByUnit.values()) list.sort(compareWorkerIds);
    v.unassignedWorkerIds.sort(compareWorkerIds);
    return v;
  }, [groupId, memberRows, ous, ouAssign, compareWorkerIds]);
  const notInAnyGroupIds = useMemo(() => {
    if (groupId != null) return [] as number[];
    return notInAnyGroup(memberRows, ous, ouAssign).sort(compareWorkerIds);
  }, [groupId, memberRows, ous, ouAssign, compareWorkerIds]);

  /** Units of the selected group, in the units query's order (D8). */
  const groupUnits = useMemo(() => view?.units ?? [], [view]);
  const groupUnitIds = useMemo(() => new Set(groupUnits.map((u) => u.ou_id)), [groupUnits]);
  /** worker → the ONE unit the worker holds in the selected group (the tile index of §3.13). */
  const unitsByWorkerInGroup = useMemo(() => {
    const m = new Map<number, number[]>();
    if (!view) return m;
    for (const [workerId, ouId] of view.placementByWorker) m.set(workerId, [ouId]);
    return m;
  }, [view]);
  const workersByUnit = useMemo(
    () => view?.workersByUnit ?? new Map<number, number[]>(),
    [view]
  );
  const unassignedWorkerIds = useMemo(() => view?.unassignedWorkerIds ?? [], [view]);
  const placementByWorker = useMemo(
    () => view?.placementByWorker ?? new Map<number, number>(),
    [view]
  );

  /** Units of the selected group the user has not hidden (HU-a). */
  const shownUnits = useMemo(
    () => groupUnits.filter((u) => !hiddenOuIds.has(u.ou_id)),
    [groupUnits, hiddenOuIds]
  );
  /** The hidden ids that are units of the selected group — what the Units manager shows (fix round 2, A9). */
  const hiddenInGroupIds = useMemo(
    () => new Set(groupUnits.filter((u) => hiddenOuIds.has(u.ou_id)).map((u) => u.ou_id)),
    [groupUnits, hiddenOuIds]
  );
  const hiddenInGroupCount = hiddenInGroupIds.size;

  /** Every hidden id that still names a unit of this campaign: a stale id is pruned on the next write (fix round 2, A10). */
  const liveHiddenIds = useCallback(
    () => [...hiddenOuIds].filter((id) => ouById.has(id)),
    [hiddenOuIds, ouById]
  );
  const toggleHidden = useCallback(
    (ouId: number) => {
      const next = new Set(liveHiddenIds());
      if (next.has(ouId)) next.delete(ouId);
      else next.add(ouId);
      setWallChart({ hiddenOuIds: [...next].sort((a, b) => a - b) });
    },
    [liveHiddenIds, setWallChart]
  );
  /** "Show all" clears the selected group's units only; other groups' hidden units are untouched (§3.12). */
  const showAllHidden = useCallback(() => {
    const next = liveHiddenIds().filter((id) => !groupUnitIds.has(id)).sort((a, b) => a - b);
    setWallChart({ hiddenOuIds: next });
  }, [liveHiddenIds, groupUnitIds, setWallChart]);

  /** The whole-groups map the delete dialog and the sheet's "other groups" need. */
  const unitsByGroup = useMemo(() => {
    const m = new Map<number, WallChartOU[]>();
    for (const g of groups) m.set(g.group_id, unitsOfGroup(ous, g.group_id));
    return m;
  }, [groups, ous]);

  // ---- `?ou=` focus: scroll to and highlight the unit card once units are on screen.
  useEffect(() => {
    if (!focusOuId || ous.length === 0) return;
    const el = document.querySelector<HTMLElement>(`[data-ou-id="${focusOuId}"]`);
    if (!el) return;
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setHighlightedOuId(focusOuId);
      window.setTimeout(() => setHighlightedOuId(null), 2500);
    }, 150);
    return () => window.clearTimeout(t);
  }, [focusOuId, ous.length, setHighlightedOuId]);

  // ---- Worker search (§3.12): the worker's unit IN THE SELECTED GROUP ---------------
  const workerSearchItems = useMemo<WorkerSearchItem[]>(() => {
    const noneSet = new Set(notInAnyGroupIds);
    const items: WorkerSearchItem[] = [];
    for (const row of memberRows) {
      const w = row.worker;
      if (!w) continue;
      let unitLabel: string;
      if (groupId != null) {
        const ouId = placementByWorker.get(row.worker_id);
        unitLabel = ouId != null ? (ouNameById.get(ouId) ?? "Unassigned") : "Unassigned";
      } else if (noneSet.has(row.worker_id)) {
        unitLabel = "Not in any group";
      } else {
        unitLabel =
          [...(unitsByWorkerAll.get(row.worker_id) ?? [])]
            .map((id) => ouNameById.get(id))
            .filter((n): n is string => Boolean(n))
            .join(", ") || "Not in any group";
      }
      items.push({
        workerId: row.worker_id,
        name: `${w.first_name} ${w.last_name}`.trim(),
        unitLabel,
        sublabel: w.canonical_occupation?.canonical_name ?? w.member_role_type?.display_name ?? null,
      });
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }, [memberRows, groupId, placementByWorker, ouNameById, notInAnyGroupIds, unitsByWorkerAll]);

  const focusWorker = useCallback(
    (workerId: number) => {
      let key: HighlightKey | null = null;
      if (groupId != null) {
        const ouId = placementByWorker.get(workerId);
        key = ouId ?? UNASSIGNED_CARD_KEY;
        if (typeof key === "number" && hiddenOuIds.has(key)) toggleHidden(key);
      } else if (notInAnyGroupIds.includes(workerId)) {
        key = NOT_IN_ANY_GROUP_CARD_KEY;
      }
      workerDetail?.openWorkerDetail(workerId);
      if (key === null) return; // not on screen in this view: the sheet is enough
      const target = key;
      window.setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-ou-id="${target}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedOuId(target);
        window.setTimeout(() => setHighlightedOuId(null), 2500);
      }, 80);
    },
    [groupId, placementByWorker, hiddenOuIds, toggleHidden, notInAnyGroupIds, workerDetail, setHighlightedOuId]
  );

  // ---- WP1.7 rating hint: the first tile in the v2 DOM order (units, then Unassigned).
  const ratingHintAnchor = useMemo(
    () =>
      firstTileAnchor({
        inGroup: groupId != null,
        notInAnyGroupIds,
        units: shownUnits.map((u) => ({ ouId: u.ou_id, workerIds: workersByUnit.get(u.ou_id) ?? [] })),
        unassignedWorkerIds,
      }),
    [groupId, notInAnyGroupIds, shownUnits, workersByUnit, unassignedWorkerIds]
  );
  const ratingHint = useFirstUseHint("wall_chart_rating", {
    hasTiles: ratingHintAnchor !== null,
    canWrite,
  });

  return {
    ous,
    ouById,
    nextDisplayOrder,
    reorderOus,
    ouAssignments: ouAssign,
    campaign,
    groupId,
    groupUnits,
    groupUnitIds,
    shownUnits,
    hiddenInGroupIds,
    hiddenInGroupCount,
    toggleHidden,
    showAllHidden,
    unitsByGroup,
    workersByUnit,
    unassignedWorkerIds,
    placementByWorker,
    notInAnyGroupIds,
    index: {
      memberRows,
      workerById,
      ratingByWorker,
      ouNameById,
      ouTypeById,
      /** Group-scoped (§3.13): the tile never sees a second unit. */
      unitsByWorker: unitsByWorkerInGroup,
      unitsByWorkerAll,
      parentByOu: EMPTY_PARENT_MAP,
      compareWorkerIds,
    },
    buildList: { controller: buildListController, workerIds: buildListWorkerIds },
    workerSearchItems,
    focusWorker,
    hint: { ratingHintAnchor, ratingHint },
  };
}

/**
 * The tile the WP1.7 rating hint anchors to: the first tile in the v2 card
 * order — the first shown Unit with anyone in it, else Unassigned — or, in
 * the Not in any group view, its first tile. Null when there is no tile
 * (which is also `hasTiles` for `shouldShowHint`). Pure.
 */
export function firstTileAnchor(i: {
  inGroup: boolean;
  notInAnyGroupIds: readonly number[];
  units: readonly { ouId: number; workerIds: readonly number[] }[];
  unassignedWorkerIds: readonly number[];
}): RatingHintAnchor | null {
  if (!i.inGroup) {
    return i.notInAnyGroupIds.length > 0 ? { ouId: null, workerId: i.notInAnyGroupIds[0] } : null;
  }
  for (const u of i.units) {
    if (u.workerIds.length > 0) return { ouId: u.ouId, workerId: u.workerIds[0] };
  }
  if (i.unassignedWorkerIds.length > 0) return { ouId: null, workerId: i.unassignedWorkerIds[0] };
  return null;
}

export type WallChartGroupView = ReturnType<typeof useWallChartGroupView>;
