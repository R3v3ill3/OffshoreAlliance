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
import { deriveGroupTree, nestingParentOf, type GroupTree } from "@/lib/campaign/groups/derive-group-tree";
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

/**
 * The tile resolves per-unit assessment overrides up this chain. The v2 chart
 * has no per-unit override (§3.10) — nested cards included (XP-a, wp2.4c.md
 * §3.6) — so it stays empty.
 */
const EMPTY_PARENT_MAP = new Map<number, number | null>();

/** Reused for a group view that has no tree (Not in any group), so the memos stay stable. */
const EMPTY_CHILDREN = new Map<number, WallChartOU[]>();
const EMPTY_NUMBER_LIST_MAP = new Map<number, number[]>();
const EMPTY_NUMBER_MAP = new Map<number, number>();
const EMPTY_ID_SET = new Set<number>();
const NO_UNITS: WallChartOU[] = [];

/** `?ou=` focus: how long to wait for the card, and how many times to look. */
const FOCUS_RETRY_MS = 150;
const FOCUS_ATTEMPTS = 20;

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

  // ---- The group view (§3.3) and the nested tree (wp2.4c.md §3.4) -----------------
  const groupId = selection === "none" ? null : selection;
  const view = useMemo(() => {
    if (groupId == null) return null;
    const v = deriveGroupView(memberRows, ous, ouAssign, groupId);
    for (const list of v.workersByUnit.values()) list.sort(compareWorkerIds);
    v.unassignedWorkerIds.sort(compareWorkerIds);
    return v;
  }, [groupId, memberRows, ous, ouAssign, compareWorkerIds]);
  /**
   * The nested view of the same rows. Every per-card list is sorted by the
   * chart's one comparator, exactly as the flat view's are, so a tile sits in
   * the same place whether its card is a root or a nested child.
   */
  const tree = useMemo<GroupTree<WallChartOU> | null>(() => {
    if (groupId == null) return null;
    const t = deriveGroupTree(memberRows, ous, ouAssign, groupId);
    for (const list of t.workersByNode.values()) list.sort(compareWorkerIds);
    for (const list of t.subtreeByRoot.values()) list.sort(compareWorkerIds);
    t.unassignedWorkerIds.sort(compareWorkerIds);
    return t;
  }, [groupId, memberRows, ous, ouAssign, compareWorkerIds]);
  const notInAnyGroupIds = useMemo(() => {
    if (groupId != null) return [] as number[];
    return notInAnyGroup(memberRows, ous, ouAssign).sort(compareWorkerIds);
  }, [groupId, memberRows, ous, ouAssign, compareWorkerIds]);

  /** Units of the selected group, in the units query's order (D8). */
  const groupUnits = useMemo(() => view?.units ?? [], [view]);
  const groupUnitIds = useMemo(() => new Set(groupUnits.map((u) => u.ou_id)), [groupUnits]);
  /**
   * worker → the ONE card that draws the tile (§3.13, wp2.4c.md §3.6): the
   * nested child when the worker holds one under their root, else the root.
   * Still one entry per worker — a nested worker is never drawn twice.
   */
  const unitsByWorkerInGroup = useMemo(() => {
    const m = new Map<number, number[]>();
    if (!tree) return m;
    for (const [workerId, ouId] of tree.nodeByWorker) m.set(workerId, [ouId]);
    return m;
  }, [tree]);
  /** node (root, nested child or flat foreign-nested card) → the tiles IT draws. */
  const workersByUnit = useMemo(() => tree?.workersByNode ?? EMPTY_NUMBER_LIST_MAP, [tree]);
  /** root → its nested children, in the units query's order (B1). */
  const childrenByRoot = useMemo(() => tree?.childrenByRoot ?? EMPTY_CHILDREN, [tree]);
  /** The cards of the band: the roots, then the flat foreign-nested cards (§3.6). */
  const rootUnits = useMemo(() => (tree ? [...tree.roots, ...tree.foreignNested] : NO_UNITS), [tree]);
  /**
   * §3.6 / §3.13: a `foreignNested` card renders FLAT in its own group's view
   * although it is nested under a unit of another group, so its title names
   * that parent — "&lt;Parent&gt; › &lt;Unit&gt;" — or two shifts called "Day"
   * under two worksites would be indistinguishable (review A-2, fix round 1).
   * Every other card keeps `ouDisplayName`.
   */
  const cardTitle = useCallback(
    (ou: WallChartOU): string => {
      const parentId = nestingParentOf(ou, ouById);
      const parent = parentId == null ? null : ouById.get(parentId);
      return parent ? `${ouDisplayName(parent)} › ${ouDisplayName(ou)}` : ouDisplayName(ou);
    },
    [ouById]
  );
  /**
   * node → the workers its header count, placeholders and metrics cover: a
   * root's whole subtree (B5), any other card's own tiles. Every rendered card
   * has an entry.
   */
  const rollupByUnit = useMemo(() => {
    if (!tree) return EMPTY_NUMBER_LIST_MAP;
    const m = new Map<number, number[]>();
    for (const [nodeId, ids] of tree.workersByNode) m.set(nodeId, ids);
    for (const [rootId, ids] of tree.subtreeByRoot) m.set(rootId, ids);
    return m;
  }, [tree]);
  /** Every card of the tree (roots, their children, the flat cards). */
  const nodeIds = useMemo(() => tree?.nodeIds ?? EMPTY_ID_SET, [tree]);
  /** worker → the root they count under (the compare/list value of "in U"). */
  const rootByWorker = useMemo(() => tree?.rootByWorker ?? EMPTY_NUMBER_MAP, [tree]);
  /** worker → the card that draws their tile. */
  const nodeByWorker = useMemo(() => tree?.nodeByWorker ?? EMPTY_NUMBER_MAP, [tree]);
  const unassignedWorkerIds = useMemo(() => tree?.unassignedWorkerIds ?? [], [tree]);
  /** The worker's ACTUAL row in the group — what `structure_placements_move` needs. */
  const placementByWorker = useMemo(
    () => view?.placementByWorker ?? EMPTY_NUMBER_MAP,
    [view]
  );

  /**
   * HU-a under nesting (wp2.4c.md §3.6): hiding a root hides its subtree (the
   * card and its children go together); hiding a child hides that card only —
   * its workers still count in the root's roll-up and are NOT moved into the
   * root's own area, exactly as the legacy chart behaved.
   */
  const shownUnits = useMemo(
    () => rootUnits.filter((u) => !hiddenOuIds.has(u.ou_id)),
    [rootUnits, hiddenOuIds]
  );
  const shownChildrenByRoot = useMemo(() => {
    const m = new Map<number, WallChartOU[]>();
    for (const u of shownUnits) {
      m.set(u.ou_id, (childrenByRoot.get(u.ou_id) ?? []).filter((c) => !hiddenOuIds.has(c.ou_id)));
    }
    return m;
  }, [shownUnits, childrenByRoot, hiddenOuIds]);
  /** The hidden ids that are cards of the selected group's tree — what the Units manager shows (A9). */
  const hiddenInGroupIds = useMemo(
    () => new Set([...nodeIds].filter((id) => hiddenOuIds.has(id))),
    [nodeIds, hiddenOuIds]
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
  /**
   * Un-hide several cards in ONE write (review A-1, fix round 1). Calling
   * `toggleHidden` twice in a row cannot work: both recompute from the
   * `hiddenOuIds` prop, which does not change between two synchronous calls,
   * and `setWallChart` merges patches — so the second write's array would
   * overwrite the first and only the last card would be un-hidden.
   */
  const unhideUnits = useCallback(
    (ouIds: readonly number[]) => {
      if (ouIds.length === 0) return;
      const next = new Set(liveHiddenIds());
      for (const id of ouIds) next.delete(id);
      setWallChart({ hiddenOuIds: [...next].sort((a, b) => a - b) });
    },
    [liveHiddenIds, setWallChart]
  );
  /** "Show all" clears the selected group's units only; other groups' hidden units are untouched (§3.12). */
  const showAllHidden = useCallback(() => {
    const next = liveHiddenIds().filter((id) => !nodeIds.has(id)).sort((a, b) => a - b);
    setWallChart({ hiddenOuIds: next });
  }, [liveHiddenIds, nodeIds, setWallChart]);

  /** The whole-groups map the delete dialog and the sheet's "other groups" need. */
  const unitsByGroup = useMemo(() => {
    const m = new Map<number, WallChartOU[]>();
    for (const g of groups) m.set(g.group_id, unitsOfGroup(ous, g.group_id));
    return m;
  }, [groups, ous]);

  // ---- `?ou=` focus: scroll to and highlight the unit card once units are on screen.
  //
  // The card is looked for on a short, bounded retry rather than once (WP2.4c,
  // wp2.4c.md §8.3 D12): which cards render depends on the placements query
  // and on "Show empty units", so at the moment this effect first runs the
  // band can still be the loading placeholder or a set of empty units — and a
  // single miss meant `?ou=` silently did nothing, for a nested card and a
  // root alike. The loop stops on the first hit, after `FOCUS_ATTEMPTS` tries,
  // or on unmount.
  useEffect(() => {
    if (!focusOuId || ous.length === 0) return;
    let attempts = 0;
    let timer = window.setTimeout(function tick() {
      const el = document.querySelector<HTMLElement>(`[data-ou-id="${focusOuId}"]`);
      if (!el) {
        if (++attempts >= FOCUS_ATTEMPTS) return;
        timer = window.setTimeout(tick, FOCUS_RETRY_MS);
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setHighlightedOuId(focusOuId);
      timer = window.setTimeout(() => setHighlightedOuId(null), 2500);
    }, FOCUS_RETRY_MS);
    return () => window.clearTimeout(timer);
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
        // wp2.4c.md §3.6: the card the tile is on, named "<Root> › <Child>"
        // when that card is nested, so the item points at what the organiser
        // will see highlighted.
        const nodeId = nodeByWorker.get(row.worker_id);
        const rootId = rootByWorker.get(row.worker_id);
        const node = nodeId != null ? ouById.get(nodeId) : undefined;
        const rootName = rootId != null && rootId !== nodeId ? ouNameById.get(rootId) : undefined;
        const nodeName = node ? ouDisplayName(node) : undefined;
        unitLabel = node
          ? rootName
            ? `${rootName} › ${nodeName}`
            : cardTitle(node)
          : "Unassigned";
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
  }, [memberRows, groupId, nodeByWorker, rootByWorker, ouById, ouNameById, cardTitle, notInAnyGroupIds, unitsByWorkerAll]);

  const focusWorker = useCallback(
    (workerId: number) => {
      let key: HighlightKey | null = null;
      if (groupId != null) {
        const nodeId = nodeByWorker.get(workerId);
        key = nodeId ?? UNASSIGNED_CARD_KEY;
        // Un-hide the card AND the root it is nested in, or the highlight
        // would point at a card that is not rendered (wp2.4c.md §3.6).
        if (typeof key === "number") {
          const rootId = rootByWorker.get(workerId);
          unhideUnits(
            [...new Set([rootId, key])].filter(
              (id): id is number => id != null && hiddenOuIds.has(id)
            )
          );
        }
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
    [groupId, nodeByWorker, rootByWorker, hiddenOuIds, unhideUnits, notInAnyGroupIds, workerDetail, setHighlightedOuId]
  );

  // ---- WP1.7 rating hint: the first tile in the v2 DOM order (units, then Unassigned).
  const ratingHintAnchor = useMemo(
    () =>
      firstTileAnchor({
        inGroup: groupId != null,
        notInAnyGroupIds,
        // DOM order: each root's own tiles, then its nested children's
        // (wp2.4c.md §3.6), then Unassigned.
        units: shownUnits.flatMap((u) => [
          { ouId: u.ou_id, workerIds: workersByUnit.get(u.ou_id) ?? [] },
          ...(shownChildrenByRoot.get(u.ou_id) ?? []).map((c) => ({
            ouId: c.ou_id,
            workerIds: workersByUnit.get(c.ou_id) ?? [],
          })),
        ]),
        unassignedWorkerIds,
      }),
    [groupId, notInAnyGroupIds, shownUnits, shownChildrenByRoot, workersByUnit, unassignedWorkerIds]
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
    /** wp2.4c.md §3.4: the nested view of the selected group, or null outside one. */
    tree,
    rootUnits,
    cardTitle,
    childrenByRoot,
    shownChildrenByRoot,
    rollupByUnit,
    nodeIds,
    nodeByWorker,
    rootByWorker,
    shownUnits,
    hiddenInGroupIds,
    hiddenInGroupCount,
    toggleHidden,
    unhideUnits,
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
