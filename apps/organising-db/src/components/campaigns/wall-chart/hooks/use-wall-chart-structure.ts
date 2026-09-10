import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { pickRatingHintAnchor } from "@/lib/hints/pick-rating-hint-anchor";
import { useFirstUseHint } from "@/lib/hints/use-first-use-hint";
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
import type { WallChartCoreData } from "./use-wall-chart-core-data";
import type { WallChartShellEnv, WallChartShellState } from "./use-wall-chart-shell-state";

/**
 * WP2.3 block C — the wall chart's structure, moved verbatim out of
 * `campaign-wall-chart.tsx` (`WC:526–883`). The units, assignment and campaign
 * queries, the `?ou=` focus effect, the unit reorder mutation, every member /
 * unit / hierarchy derivation, the worker search index, search-to-jump, and the
 * WP1.7 rating-hint anchor.
 *
 * Inputs come only from the component's props and from blocks A and B, which
 * render before it; the block's internal order is unchanged.
 */
export function useWallChartStructure({
  campaignId,
  canWrite,
  env,
  unitVisibility,
  focusOuId,
  setHighlightedOuId,
  members,
  ratingSummary,
}: {
  campaignId: string;
  canWrite: boolean;
  env: WallChartShellEnv;
  unitVisibility: WallChartShellState["visibility"];
  focusOuId: number | null;
  setHighlightedOuId: WallChartShellState["highlight"]["setHighlightedOuId"];
  members: WallChartCoreData["rawMembers"];
  ratingSummary: WallChartCoreData["ratingSummary"];
}) {
  const { supabase, queryClient, workerDetail } = env;

  const { data: ous = [] } = useQuery({
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

  const visibleOus = useMemo(
    () => ous.filter((ou) => !unitVisibility.hiddenOuIds.has(ou.ou_id)),
    [ous, unitVisibility.hiddenOuIds]
  );

  // When ous have loaded and a focusOuId param is present, scroll the target
  // unit card into view and apply a brief highlight ring.
  useEffect(() => {
    if (!focusOuId || ous.length === 0) return;
    const el = document.querySelector<HTMLElement>(`[data-ou-id="${focusOuId}"]`);
    if (!el) return;
    // Small delay so the tab transition / layout paint settles first.
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setHighlightedOuId(focusOuId);
      window.setTimeout(() => setHighlightedOuId(null), 2500);
    }, 150);
    return () => window.clearTimeout(t);
    // setHighlightedOuId is a useState setter (block A) and referentially stable;
    // it is listed only because it now crosses a hook boundary.
  }, [focusOuId, ous.length, setHighlightedOuId]);

  const nextDisplayOrder = useMemo(() => {
    if (ous.length === 0) return 0;
    return Math.max(...ous.map((o) => o.display_order ?? 0)) + 1;
  }, [ous]);

  const reorderOus = useAuthAwareMutation({
    mutationFn: async (orderedOuIds: number[]) => {
      for (let i = 0; i < orderedOuIds.length; i++) {
        const { error } = await supabase
          .from("campaign_organising_units")
          .update({ display_order: i })
          .eq("ou_id", orderedOuIds[i]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-ous", campaignId] });
    },
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

  // ---- Normalise members -----------------------------------------------------
  const memberRows = useMemo<WallChartMemberRow[]>(
    () => normalizeCampaignMemberRows(members),
    [members]
  );

  const workerById = useMemo(() => {
    const m = new Map<number, WallChartWorker>();
    for (const row of memberRows) {
      if (row.worker) m.set(row.worker_id, row.worker);
    }
    return m;
  }, [memberRows]);

  const ratingByWorker = useMemo(() => {
    const m = new Map<number, WallChartRatingSummary>();
    for (const r of ratingSummary) m.set(r.worker_id, r);
    return m;
  }, [ratingSummary]);

  // Snapshot getter so the build-list panel can render optimistic rows
  // immediately on drop without waiting for the server roundtrip.
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
          // Not loaded by the wall-chart members query — the optimistic
          // row is replaced by the real server data on refetch anyway.
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

  const buildListController = useBuildList({
    campaignId,
    workerSnapshot: buildListWorkerSnapshot,
  });

  // Set of worker_ids in the active build list — used to render a
  // "✓ in build list" badge on wall chart tiles, so users don't add the
  // same worker twice.
  const buildListWorkerIds = useMemo(() => {
    const s = new Set<number>();
    for (const item of buildListController.detail.data?.items ?? []) {
      s.add(item.worker_id);
    }
    return s;
  }, [buildListController.detail.data]);

  // ---- Multi-unit assignment metadata ---------------------------------------
  const ouNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const ou of ous) m.set(ou.ou_id, ouDisplayName(ou));
    return m;
  }, [ous]);

  const ouTypeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const ou of ous) {
      if (ou.ou_type) m.set(ou.ou_id, ou.ou_type);
    }
    return m;
  }, [ous]);

  const unitsByWorker = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const a of ouAssign) {
      const list = m.get(a.worker_id) ?? [];
      list.push(a.ou_id);
      m.set(a.worker_id, list);
    }
    return m;
  }, [ouAssign]);

  const primaryOuByWorker = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of ouAssign) {
      if (a.is_primary) m.set(a.worker_id, a.ou_id);
    }
    return m;
  }, [ouAssign]);

  // Flat, name-sorted list backing the wall chart worker search typeahead.
  const workerSearchItems = useMemo<WorkerSearchItem[]>(() => {
    const items: WorkerSearchItem[] = [];
    for (const row of memberRows) {
      const w = row.worker;
      if (!w) continue;
      const ouIds = unitsByWorker.get(row.worker_id) ?? [];
      const unitLabel =
        ouIds.length === 0
          ? "Unassigned"
          : ouIds
              .map((id) => ouNameById.get(id))
              .filter((n): n is string => Boolean(n))
              .join(", ") || "Unassigned";
      items.push({
        workerId: row.worker_id,
        name: `${w.first_name} ${w.last_name}`.trim(),
        unitLabel,
        sublabel:
          w.canonical_occupation?.canonical_name ??
          w.member_role_type?.display_name ??
          null,
      });
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }, [memberRows, unitsByWorker, ouNameById]);

  // Search → jump: centre the worker's unit card and open their detail sheet.
  const focusWorker = useCallback(
    (workerId: number) => {
      const ouIds = unitsByWorker.get(workerId) ?? [];
      // Preferred unit first (primary, else first assignment), then the rest as
      // fallbacks in case the preferred card isn't rendered (e.g. a sub-unit in
      // a collapsed group). Unassigned workers target the unassigned card.
      const candidates: (number | "unassigned")[] =
        ouIds.length === 0
          ? ["unassigned"]
          : Array.from(
              new Set<number>([
                primaryOuByWorker.get(workerId) ?? ouIds[0],
                ...ouIds,
              ])
            );

      // Un-hide the preferred unit if the user has it collapsed so its card is
      // in the DOM to scroll to.
      const preferred = candidates[0];
      if (
        typeof preferred === "number" &&
        unitVisibility.hiddenOuIds.has(preferred)
      ) {
        unitVisibility.toggleOu(preferred);
      }

      // Open the detail sheet right away; scroll after a tick so any un-hide /
      // re-render has painted the target card first.
      workerDetail?.openWorkerDetail(workerId);

      window.setTimeout(() => {
        for (const key of candidates) {
          const el = document.querySelector<HTMLElement>(
            `[data-ou-id="${key}"]`
          );
          if (!el) continue;
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setHighlightedOuId(key);
          window.setTimeout(() => setHighlightedOuId(null), 2500);
          break;
        }
      }, 80);
    },
    // setHighlightedOuId is a stable block-A useState setter (see above).
    [unitsByWorker, primaryOuByWorker, unitVisibility, workerDetail, setHighlightedOuId]
  );

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

  const assignedWorkerIds = useMemo(() => {
    const s = new Set<number>();
    if (ous.length === 0) return s;
    for (const a of ouAssign) s.add(a.worker_id);
    return s;
  }, [ous, ouAssign]);

  const unassignedWorkerIds = useMemo(() => {
    const ids = memberRows.map((row) => row.worker_id).filter((id) => !assignedWorkerIds.has(id));
    ids.sort(compareWorkerIds);
    return ids;
  }, [memberRows, assignedWorkerIds, compareWorkerIds]);

  const workersByOu = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const ou of ous) map.set(ou.ou_id, []);
    for (const a of ouAssign) {
      const list = map.get(a.ou_id);
      if (list) list.push(a.worker_id);
    }
    for (const list of map.values()) list.sort(compareWorkerIds);
    return map;
  }, [ous, ouAssign, compareWorkerIds]);

  // ---- OU hierarchy (parent -> direct children) -----------------------------
  const childrenByParent = useMemo(() => {
    const m = new Map<number, WallChartOU[]>();
    for (const ou of ous) {
      const parentId = (ou as WallChartOU & { parent_ou_id?: number | null }).parent_ou_id;
      if (parentId == null) continue;
      const list = m.get(parentId) ?? [];
      list.push(ou);
      m.set(parentId, list);
    }
    return m;
  }, [ous]);

  /**
   * For roll-up rendering: a worker assigned to BOTH a parent and one of its
   * sub-units should be displayed under the sub-unit only (not also under the
   * parent's own grid). Parent-level metrics still see them via metricsByOu
   * (which uses workersByOu including parent rows). The display dedupe only
   * affects the worker tile grid inside the parent card.
   */
  const parentExclusiveWorkersByOu = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const ou of ous) {
      const childList = childrenByParent.get(ou.ou_id);
      if (!childList || childList.length === 0) continue;
      const childMembers = new Set<number>();
      for (const child of childList) {
        for (const wid of workersByOu.get(child.ou_id) ?? []) childMembers.add(wid);
      }
      const filtered = (workersByOu.get(ou.ou_id) ?? []).filter(
        (id) => !childMembers.has(id)
      );
      m.set(ou.ou_id, filtered);
    }
    return m;
  }, [ous, childrenByParent, workersByOu]);

  /** Resolve the visible worker list inside a card, applying parent-dedupe when applicable. */
  const visibleWorkersForOu = useCallback(
    (ouId: number): number[] => {
      return parentExclusiveWorkersByOu.get(ouId) ?? workersByOu.get(ouId) ?? [];
    },
    [parentExclusiveWorkersByOu, workersByOu]
  );

  // WP1.7: the one tile the first-use rating hint anchors to (first in DOM
  // order: Unassigned, then the units), and the per-user seen state.
  const ratingHintAnchor = useMemo(
    () =>
      pickRatingHintAnchor({
        unassignedWorkerIds,
        units: visibleOus.map((o) => ({ ouId: o.ou_id, workerIds: visibleWorkersForOu(o.ou_id) })),
      }),
    [unassignedWorkerIds, visibleOus, visibleWorkersForOu]
  );
  const ratingHint = useFirstUseHint("wall_chart_rating", {
    hasTiles: ratingHintAnchor !== null,
    canWrite,
  });
  return {
    ous,
    visibleOus,
    nextDisplayOrder,
    reorderOus,
    ouAssignments: ouAssign,
    campaign,
    index: {
      memberRows,
      workerById,
      ratingByWorker,
      ouNameById,
      ouTypeById,
      unitsByWorker,
      primaryOuByWorker,
      compareWorkerIds,
      assignedWorkerIds,
      unassignedWorkerIds,
      workersByOu,
      childrenByParent,
      parentExclusiveWorkersByOu,
      visibleWorkersForOu,
    },
    buildList: { controller: buildListController, workerIds: buildListWorkerIds },
    workerSearchItems,
    focusWorker,
    hint: { ratingHintAnchor, ratingHint },
  };
}

export type WallChartStructure = ReturnType<typeof useWallChartStructure>;
export type WallChartIndex = WallChartStructure["index"];
