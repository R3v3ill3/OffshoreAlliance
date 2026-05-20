"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useCampaignWorkerDetail,
} from "./campaign-worker-detail-provider";
import { CampaignUnitCard } from "./wall-chart/campaign-unit-card";
import { WorkerTile } from "./wall-chart/worker-tile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { MoreVertical, Layers, Trash2 } from "lucide-react";
import { DeleteOrganisingUnitDialog, type DeleteUnitWorker } from "./wall-chart/delete-organising-unit-dialog";
import { SplitUnitDialog, type SplitMember } from "./wall-chart/split-unit-dialog";
import { humanizeOuType, ouDisplayName } from "./wall-chart/types";
import { collapseActivityRatingsToWorkerMap } from "@/lib/utils/collapse-activity-ratings";
import {
  AssessmentSelector,
  UnitAssessmentViewControl,
} from "./wall-chart/assessment-selector";
import { computeMetrics, type AssessmentMetricsInput } from "./wall-chart/metrics";
import {
  ParticipationSelector,
  participationSourceLabel,
  type ParticipationSource,
} from "./wall-chart/participation-selector";
import { useParticipationPredicate } from "./wall-chart/use-participation-predicate";
import { UnitSummaryMetrics } from "./wall-chart/unit-summary-metrics";
import { WallChartSummaryHeader } from "./wall-chart/wall-chart-summary-header";
import { useDisplayMode } from "./wall-chart/use-display-mode";
import {
  WallChartFilterBar,
  useDerivedOptions,
} from "./wall-chart/wall-chart-filter-bar";
import {
  MoveOrCopyWorkersDialog,
  type MoveMode,
} from "./wall-chart/copy-worker-to-unit-dialog";
import { WallChartSelectionBar } from "./wall-chart/wall-chart-selection-bar";
import { ClearRatingsDialog } from "./wall-chart/clear-ratings-dialog";
import { useWallChartSelection } from "./wall-chart/use-wall-chart-selection";
import { useMoveWorkersMutation } from "./wall-chart/move-worker-mutation";
import { LinkToLeaderDialog } from "./wall-chart/link-to-leader-dialog";
import type { WorkerDragRef } from "./wall-chart/dnd";
import { RelationshipOverlay } from "./wall-chart/relationship-overlay";
import { useAllLeaderLinks } from "./wall-chart/use-leader-links";
import {
  DEFAULT_FILTER_STATE,
  applyFilters,
  applySort,
  type RatingFilterAssessmentContext,
  type WallChartFilterState,
} from "./wall-chart/filters";
import type {
  ActivityRating,
  AssessmentSelection,
  WallChartMemberRow,
  WallChartOU,
  WallChartOUAssignment,
  WallChartRatingSummary,
  WallChartWorker,
} from "./wall-chart/types";
import { WallChartUnitManager } from "./wall-chart/wall-chart-unit-manager";
import { CreateOrganisingUnitDialog } from "./wall-chart/create-organising-unit-dialog";
import { useWallChartUnitVisibility } from "./wall-chart/use-wall-chart-unit-visibility";
import { CreateAssessmentDialog } from "./assessments/create-assessment-dialog";
import { CreateTaskListDialog } from "./task-lists/create-task-list-dialog";
import { WorkerImportWizard } from "@/components/import/worker-import-wizard";
import { AddCampaignWorkerDialog } from "./wall-chart/add-campaign-worker-dialog";
import { WallChartAssessmentCharts } from "./WallChartAssessmentCharts";
import { BuildListPanel } from "./wall-chart/build-list-panel";
import { useBuildList, type FiredTaskDraft } from "./wall-chart/use-build-list";


function activityIdsForWallChartSelections(
  campaignDefault: AssessmentSelection,
  overrides: Map<number, AssessmentSelection>
): number[] {
  const s = new Set<number>();
  if (campaignDefault.kind === "assessment") s.add(campaignDefault.activityId);
  for (const v of overrides.values()) {
    if (v.kind === "assessment") s.add(v.activityId);
  }
  return [...s].sort((a, b) => a - b);
}

function effectiveAssessmentForScope(
  scopeKey: number,
  campaignDefault: AssessmentSelection,
  overrides: Map<number, AssessmentSelection>
): AssessmentSelection {
  return overrides.get(scopeKey) ?? campaignDefault;
}

function buildAssessmentMetricsInput(
  sel: AssessmentSelection,
  byActivity: Map<number, Map<number, ActivityRating>>
): AssessmentMetricsInput | undefined {
  if (sel.kind !== "assessment") return undefined;
  const ratings = byActivity.get(sel.activityId) ?? new Map();
  return {
    ratings,
    isBinary: sel.isBinary,
    supportiveBinaryValue: sel.supporterOutcomeValue,
  };
}

function scopeAssessmentFilterAndSort(
  scopeKey: number,
  campaignDefault: AssessmentSelection,
  overrides: Map<number, AssessmentSelection>,
  byActivity: Map<number, Map<number, ActivityRating>>
): {
  activityRatings?: Map<number, ActivityRating>;
  ratingCtx?: RatingFilterAssessmentContext;
  sortAssessment?: {
    selection: Extract<AssessmentSelection, { kind: "assessment" }>;
    activityRatings: Map<number, ActivityRating>;
  };
} {
  const effective = effectiveAssessmentForScope(scopeKey, campaignDefault, overrides);
  if (effective.kind !== "assessment") return {};
  const activityRatings = byActivity.get(effective.activityId) ?? new Map();
  return {
    activityRatings,
    ratingCtx: { selection: effective },
    sortAssessment: { selection: effective, activityRatings },
  };
}

export function CampaignWallChart({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const workerDetail = useCampaignWorkerDetail();
  const [tileUnitDialog, setTileUnitDialog] = useState<{
    workerId: number;
    fromOuId: number | null;
    fromOuType: string | null;
  } | null>(null);
  const [createUnitOpen, setCreateUnitOpen] = useState(false);
  const [createAssessmentOpen, setCreateAssessmentOpen] = useState(false);
  const [createTaskListOpen, setCreateTaskListOpen] = useState(false);
  const [taskListFiredDraft, setTaskListFiredDraft] = useState<FiredTaskDraft | null>(null);
  const [buildListOpen, setBuildListOpen] = useState(false);
  // buildListController is declared further down once workerById / ratingByWorker
  // are available, so the optimistic add can hydrate placeholders from the
  // wall chart's already-loaded worker data.

  // Sticky-aware campaign summary: a 1px sentinel rendered just above the
  // sticky wrapper. When the sentinel scrolls out of viewport, the wrapper
  // has stuck to the top — we pass `isStuck` to the summary header so it
  // collapses verbose content while keeping the rating selector, controls
  // and thin rating bar visible.
  const [isSummaryStuck, setIsSummaryStuck] = useState(false);
  const summaryStickySentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = summaryStickySentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => setIsSummaryStuck(!entry.isIntersecting),
      { threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Measure the sticky summary's height so the build-list panel (also
  // sticky) can offset itself to sit just below the summary instead of
  // disappearing behind it. We track height continuously so the offset
  // adjusts to the collapsed vs. expanded summary.
  const summaryStickyWrapperRef = useRef<HTMLDivElement | null>(null);
  const [summaryStickyHeight, setSummaryStickyHeight] = useState(0);
  useEffect(() => {
    const el = summaryStickyWrapperRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      setSummaryStickyHeight(el.getBoundingClientRect().height);
    };
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    measure();
    return () => obs.disconnect();
  }, []);

  // Top offset for the build-list panel's sticky positioning. The summary
  // wrapper uses `-top-6` (sticks 24px above the scroll viewport top), so
  // its visible bottom inside the viewport is at `summaryHeight - 24`. We
  // add an 8px gap below it for breathing room, then offset against main's
  // p-6 padding (24px) so the panel sticks against the same baseline.
  // When the summary isn't stuck yet, fall back to the original `top: 8`.
  const buildListStickyTopPx =
    isSummaryStuck && summaryStickyHeight > 0
      ? summaryStickyHeight - 24 + 8
      : 8;
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [addWorkerOpen, setAddWorkerOpen] = useState(false);
  const [addWorkerFormKey, setAddWorkerFormKey] = useState(0);
  const [addWorkerContextOu, setAddWorkerContextOu] = useState<WallChartOU | null>(null);
  const unitVisibility = useWallChartUnitVisibility(campaignId);

  // Scroll to + briefly highlight a specific OU when arriving from the
  // overview summaries table (URL param: ?tab=wall&ou=<ou_id>).
  const searchParams = useSearchParams();
  const focusOuId = searchParams.get("ou") ? Number(searchParams.get("ou")) : null;
  const [highlightedOuId, setHighlightedOuId] = useState<number | null>(null);

  // Multi-select state for bulk Move/Copy/Link/Remove actions.
  const selection = useWallChartSelection();
  const [bulkDialog, setBulkDialog] = useState<{ mode: MoveMode } | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [clearRatingsDialogOpen, setClearRatingsDialogOpen] = useState(false);
  const [splitTargetOu, setSplitTargetOu] = useState<WallChartOU | null>(null);
  const [deleteTargetOu, setDeleteTargetOu] = useState<WallChartOU | null>(null);
  const moveWorkers = useMoveWorkersMutation(campaignId);

  // Esc clears selection.
  const handleRootKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && selection.size > 0) {
      selection.clear();
    }
  };

  // Relationship overlay state — persisted per-user per-campaign.
  const [overlayEnabled, setOverlayEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(`wallchart:overlay:${campaignId}`) === "1";
    } catch {
      return false;
    }
  });
  const toggleOverlay = (v: boolean) => {
    setOverlayEnabled(v);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(`wallchart:overlay:${campaignId}`, v ? "1" : "0");
      } catch {
        // ignore
      }
    }
  };

  const { data: allLinks = [] } = useAllLeaderLinks(campaignId);
  const unitsContainerRef = useRef<HTMLDivElement | null>(null);

  const { data: members = [] } = useQuery({
    queryKey: ["campaign-members-full", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(
          `membership_id, worker_id,
           worker:workers(
             worker_id, first_name, last_name, email, phone,
             member_role_type_id, is_bargaining_rep, is_hsr,
             union_membership_type_id,
             non_oa_union_option_id,
             canonical_occupation_id,
             member_role_type:member_role_types(role_name, role_type_id, display_name),
             union_membership_type:union_membership_types(type_name, display_name),
             non_oa_union_option:non_oa_union_options!workers_non_oa_union_option_id_fkey(
               non_oa_union_option_id, badge_initials, display_name
             ),
             canonical_occupation:occupations!workers_canonical_occupation_id_fkey(occupation_id, canonical_name)
           )`
        )
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return (data ?? []) as unknown as RawMemberRow[];
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

  const [campaignAssessmentDefault, setCampaignAssessmentDefault] =
    useState<AssessmentSelection>({ kind: "cumulative" });
  const [unitAssessmentOverride, setUnitAssessmentOverride] = useState<
    Map<number, AssessmentSelection>
  >(() => new Map());

  const activityIdsForRatings = useMemo(
    () => activityIdsForWallChartSelections(campaignAssessmentDefault, unitAssessmentOverride),
    [campaignAssessmentDefault, unitAssessmentOverride]
  );

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
  }, [focusOuId, ous.length]);

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
      const { data, error } = await supabase
        .from("campaign_worker_ou")
        .select("ou_id, worker_id, is_primary")
        .in("ou_id", ids);
      if (error) throw error;
      return (data ?? []) as WallChartOUAssignment[];
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
  const memberRows = useMemo<WallChartMemberRow[]>(() => {
    return members.map((row) => {
      const wr = row.worker;
      const w = (Array.isArray(wr) ? wr[0] : wr) as RawWorker | null;
      const mtRaw = w?.member_role_type;
      const mt = (Array.isArray(mtRaw) ? mtRaw[0] : mtRaw) ?? null;
      const umRaw = w?.union_membership_type;
      const um = (Array.isArray(umRaw) ? umRaw[0] : umRaw) ?? null;
      const nauoRaw = w?.non_oa_union_option;
      const nauo = (Array.isArray(nauoRaw) ? nauoRaw[0] : nauoRaw) ?? null;
      const coRaw = w?.canonical_occupation;
      const occ = (Array.isArray(coRaw) ? coRaw[0] : coRaw) ?? null;
      return {
        membership_id: row.membership_id,
        worker_id: row.worker_id,
        worker: w
          ? {
              worker_id: w.worker_id,
              first_name: w.first_name,
              last_name: w.last_name,
              email: w.email,
              phone: w.phone,
              member_role_type_id: w.member_role_type_id,
              is_bargaining_rep: w.is_bargaining_rep,
              is_hsr: w.is_hsr,
              union_membership_type_id: w.union_membership_type_id,
              non_oa_union_option_id: w.non_oa_union_option_id ?? null,
              canonical_occupation_id: w.canonical_occupation_id,
              member_role_type: mt,
              union_membership_type: um,
              non_oa_union_option:
                nauo &&
                typeof nauo === "object" &&
                "badge_initials" in nauo &&
                typeof (nauo as { badge_initials: unknown }).badge_initials === "string"
                  ? (nauo as {
                      non_oa_union_option_id: number;
                      badge_initials: string;
                      display_name: string;
                    })
                  : null,
              canonical_occupation: occ,
            }
          : null,
      };
    });
  }, [members]);

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

  const estimate = (campaign?.total_worker_estimate as number | null) ?? 0;
  const named = memberRows.length;
  const campaignGreySlots = Math.max(0, estimate - named);

  const [displayMode, setDisplayMode] = useDisplayMode(campaignId);
  const [participationSource, setParticipationSource] = useState<ParticipationSource>({
    kind: "any",
  });
  const participation = useParticipationPredicate(campaignId, participationSource, ratingSummary);
  const participationPredicate = useMemo(() => {
    if (participation.useAnyRatingFallback) return undefined;
    const ids = participation.participatedIds;
    return (workerId: number) => ids.has(workerId);
  }, [participation.useAnyRatingFallback, participation.participatedIds]);

  // Per-unit filter state. Key 0 = unassigned, positive = ou_id.
  const UNASSIGNED_KEY = 0;
  const [filterByScope, setFilterByScope] = useState<Map<number, WallChartFilterState>>(
    () => new Map()
  );

  const getFilter = (scope: number) => filterByScope.get(scope) ?? DEFAULT_FILTER_STATE();
  const setFilter = (scope: number, next: WallChartFilterState) => {
    setFilterByScope((prev) => {
      const copy = new Map(prev);
      copy.set(scope, next);
      return copy;
    });
  };

  // Labels for filter options, derived from the already-fetched worker data.
  const filterLabels = useMemo(() => {
    const membershipTypes = new Map<number, string>();
    const occupations = new Map<number, string>();
    for (const row of memberRows) {
      const w = row.worker;
      if (!w) continue;
      if (w.union_membership_type_id != null && w.union_membership_type) {
        const label =
          w.union_membership_type.display_name ??
          w.union_membership_type.type_name ??
          `Type ${w.union_membership_type_id}`;
        membershipTypes.set(w.union_membership_type_id, label);
      }
      if (w.canonical_occupation_id != null && w.canonical_occupation) {
        occupations.set(w.canonical_occupation_id, w.canonical_occupation.canonical_name);
      }
    }
    return { membershipTypes, occupations };
  }, [memberRows]);

  const derivedOptions = useDerivedOptions(memberRows, filterLabels);

  const allWorkerIds = useMemo(() => memberRows.map((r) => r.worker_id), [memberRows]);

  const campaignMetricsInput = useMemo(
    () => buildAssessmentMetricsInput(campaignAssessmentDefault, activityRatingsByActivityId),
    [campaignAssessmentDefault, activityRatingsByActivityId]
  );

  const campaignMetrics = useMemo(
    () =>
      computeMetrics(
        allWorkerIds,
        workerById,
        ratingByWorker,
        participationPredicate,
        campaignMetricsInput
      ),
    [allWorkerIds, workerById, ratingByWorker, participationPredicate, campaignMetricsInput]
  );

  const metricsByOu = useMemo(() => {
    const m = new Map<number, ReturnType<typeof computeMetrics>>();
    for (const [ouId, ids] of workersByOu.entries()) {
      const effective = effectiveAssessmentForScope(
        ouId,
        campaignAssessmentDefault,
        unitAssessmentOverride
      );
      const input = buildAssessmentMetricsInput(effective, activityRatingsByActivityId);
      const multiUnitWorkerIds = new Set(
        ids.filter((id) => (unitsByWorker.get(id)?.length ?? 0) > 1)
      );
      m.set(
        ouId,
        computeMetrics(ids, workerById, ratingByWorker, participationPredicate, input, {
          multiUnitWorkerIds,
        })
      );
    }
    return m;
  }, [
    workersByOu,
    workerById,
    ratingByWorker,
    participationPredicate,
    campaignAssessmentDefault,
    unitAssessmentOverride,
    activityRatingsByActivityId,
    unitsByWorker,
  ]);

  const unassignedMetrics = useMemo(() => {
    const effective = effectiveAssessmentForScope(
      UNASSIGNED_KEY,
      campaignAssessmentDefault,
      unitAssessmentOverride
    );
    const input = buildAssessmentMetricsInput(effective, activityRatingsByActivityId);
    return computeMetrics(
      unassignedWorkerIds,
      workerById,
      ratingByWorker,
      participationPredicate,
      input
    );
  }, [
    unassignedWorkerIds,
    workerById,
    ratingByWorker,
    participationPredicate,
    campaignAssessmentDefault,
    unitAssessmentOverride,
    activityRatingsByActivityId,
  ]);

  const renderTile = useCallback(
    (workerId: number, ouId: number | null, scopeKey: number) => {
      const worker = workerById.get(workerId);
      if (!worker) return null;
      const otherUnitIds = (unitsByWorker.get(workerId) ?? []).filter((id) => id !== ouId);
      const otherUnitNames = otherUnitIds
        .map((id) => ouNameById.get(id))
        .filter((n): n is string => Boolean(n));
      const inMultipleUnits = (unitsByWorker.get(workerId) ?? []).length > 1;
      const effective = effectiveAssessmentForScope(
        scopeKey,
        campaignAssessmentDefault,
        unitAssessmentOverride
      );
      const rMap =
        effective.kind === "assessment"
          ? activityRatingsByActivityId.get(effective.activityId) ?? new Map()
          : new Map<number, ActivityRating>();
      const activityRating =
        effective.kind === "assessment" ? rMap.get(workerId) ?? null : null;
      return (
        <WorkerTile
          key={`${ouId ?? "u"}-${workerId}`}
          worker={worker}
          rating={ratingByWorker.get(workerId)}
          ouId={ouId}
          inMultipleUnits={inMultipleUnits}
          otherUnitNames={otherUnitNames}
          canWrite={canWrite}
          selection={effective}
          campaignId={campaignId}
          activityRating={activityRating}
          isSelected={selection.has(ouId, workerId)}
          onClick={(id, tileOuId, kind) => {
            if (kind === "toggle-select") {
              selection.toggle(tileOuId, id);
              return;
            }
            if (selection.size > 0) selection.clear();
            workerDetail?.openWorkerDetail(id);
          }}
          onContactBadgeClick={(id, field) => {
            if (selection.size > 0) selection.clear();
            workerDetail?.openWorkerDetail(id, { focusField: field });
          }}
          onCopy={(id, tileOuId) =>
            setTileUnitDialog({
              workerId: id,
              fromOuId: tileOuId,
              fromOuType: tileOuId != null ? (ouTypeById.get(tileOuId) ?? null) : null,
            })
          }
          inBuildList={buildListOpen ? buildListWorkerIds.has(workerId) : undefined}
          onDragStartRefs={(id, tileOuId) => {
            if (selection.has(tileOuId, id)) {
              return selection
                .refs()
                .map((r) => ({
                  workerId: r.workerId,
                  fromOuId: r.ouId,
                  fromOuType: r.ouId != null ? (ouTypeById.get(r.ouId) ?? null) : null,
                }));
            }
            return [{
              workerId: id,
              fromOuId: tileOuId,
              fromOuType: tileOuId != null ? (ouTypeById.get(tileOuId) ?? null) : null,
            }];
          }}
        />
      );
    },
    [
      workerById,
      unitsByWorker,
      ouNameById,
      ouTypeById,
      ratingByWorker,
      canWrite,
      selection,
      campaignAssessmentDefault,
      unitAssessmentOverride,
      activityRatingsByActivityId,
      campaignId,
      buildListOpen,
      buildListWorkerIds,
      workerDetail,
    ]
  );

  const tileDialogWorker =
    tileUnitDialog != null ? workerById.get(tileUnitDialog.workerId) : undefined;
  const tileDialogWorkerOuIds =
    tileUnitDialog != null ? unitsByWorker.get(tileUnitDialog.workerId) ?? [] : [];

  // ── Split: members for the targeted OU ─────────────────────────────────
  // Lazy-loaded only when a split dialog is open; pulls dimension columns +
  // tag names so the dialog can group on them.
  const deleteUnitWorkers = useMemo((): DeleteUnitWorker[] => {
    if (!deleteTargetOu) return [];
    const workerIds = workersByOu.get(deleteTargetOu.ou_id) ?? [];
    const primaryByWorker = new Map<number, boolean>();
    for (const a of ouAssign) {
      if (a.ou_id === deleteTargetOu.ou_id && a.is_primary) {
        primaryByWorker.set(a.worker_id, true);
      }
    }
    return workerIds.map((wid) => {
      const w = workerById.get(wid);
      const label = w
        ? `${w.last_name}, ${w.first_name}`.trim()
        : `Worker #${wid}`;
      return {
        worker_id: wid,
        label,
        is_primary: primaryByWorker.get(wid),
      };
    });
  }, [deleteTargetOu, workersByOu, ouAssign, workerById]);

  const splitMemberWorkerIds = useMemo(() => {
    if (!splitTargetOu) return [] as number[];
    return workersByOu.get(splitTargetOu.ou_id) ?? [];
  }, [splitTargetOu, workersByOu]);

  const { data: splitMembers = [] } = useQuery({
    queryKey: [
      "split-unit-members",
      splitTargetOu?.ou_id ?? "none",
      splitMemberWorkerIds.join(","),
    ],
    enabled: !!splitTargetOu && splitMemberWorkerIds.length > 0,
    queryFn: async (): Promise<SplitMember[]> => {
      if (splitMemberWorkerIds.length === 0) return [];
      const { data, error } = await supabase
        .from("workers")
        .select(
          `worker_id, first_name, last_name,
           shift_id, work_area_id, roster_panel_id,
           canonical_occupation_id,
           canonical_occupation:occupations!workers_canonical_occupation_id_fkey(canonical_name)`
        )
        .in("worker_id", splitMemberWorkerIds);
      if (error) throw error;
      const { data: tagRows, error: tagErr } = await supabase
        .from("worker_tags")
        .select("worker_id, tag:tags(tag_name)")
        .in("worker_id", splitMemberWorkerIds);
      if (tagErr) throw tagErr;
      const tagsByWorker = new Map<number, string[]>();
      for (const row of (tagRows ?? []) as Array<{
        worker_id: number;
        tag: { tag_name?: string } | { tag_name?: string }[] | null;
      }>) {
        const t = Array.isArray(row.tag) ? row.tag[0] : row.tag;
        const name = t?.tag_name?.trim().toLowerCase();
        if (!name) continue;
        const list = tagsByWorker.get(row.worker_id) ?? [];
        list.push(name);
        tagsByWorker.set(row.worker_id, list);
      }
      return (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        const occRel = r.canonical_occupation;
        const occ = (Array.isArray(occRel) ? occRel[0] : occRel) as
          | { canonical_name: string }
          | null;
        return {
          worker_id: r.worker_id as number,
          first_name: r.first_name as string,
          last_name: r.last_name as string,
          canonical_occupation_id: (r.canonical_occupation_id as number | null) ?? null,
          canonical_occupation_name: occ?.canonical_name ?? null,
          shift_id: (r.shift_id as number | null) ?? null,
          work_area_id: (r.work_area_id as number | null) ?? null,
          roster_panel_id: (r.roster_panel_id as number | null) ?? null,
          tag_names: tagsByWorker.get(r.worker_id as number) ?? [],
        };
      });
    },
  });

  const handleWorkerDrop = useCallback(
    ({
      targetOuId,
      payload,
      mode,
    }: {
      targetOuId: number | null;
      payload: { refs: WorkerDragRef[] };
      mode: "move" | "copy";
    }) => {
      if (!canWrite) return;
      if (payload.refs.length === 0) return;
      // Avoid pointless no-ops: dropping on the same unit with no cross-unit refs.
      const allAlreadyThere = payload.refs.every((r) => r.fromOuId === targetOuId);
      if (mode === "move" && allAlreadyThere) return;

      // Cross-dimension move guard: units of the same ou_type form a "dimension"
      // (e.g. all worksite units). Moving a worker between units of different
      // ou_types is semantically wrong — a worker's worksite can't be changed by
      // dropping them into an employer column. Block the move; allow copy
      // (Shift+drag) so a user can still add the worker to another dimension.
      // "custom" units are unconstrained — they're not part of a structured dimension.
      if (mode === "move" && targetOuId != null) {
        const targetType = ouTypeById.get(targetOuId);
        const nonCustomSourceTypes = payload.refs
          .map((r) => r.fromOuType)
          .filter((t): t is string => !!t && t !== "custom");
        if (
          targetType &&
          targetType !== "custom" &&
          nonCustomSourceTypes.length > 0 &&
          nonCustomSourceTypes.some((t) => t !== targetType)
        ) {
          // Silently block — the drag visual already constrains this via the
          // wallchart grouping (units are shown in ou_type bands). A toast would
          // be intrusive for accidental mis-drops.
          return;
        }
      }

      moveWorkers.mutate(
        {
          refs: payload.refs,
          toOuId: targetOuId,
          mode,
        },
        {
          onSuccess: () => {
            // Clear selection after successful bulk action.
            if (selection.size > 0) selection.clear();
          },
        }
      );
    },
    [canWrite, moveWorkers, ouTypeById, selection]
  );

  // Removes selected workers from their specific source units (not all units).
  // Grouped by ouId so workers in multiple selected units are handled correctly.
  const handleBulkRemoveFromUnit = useCallback(async () => {
    if (!canWrite) return;
    const refs = selection.refs().filter((r) => r.ouId !== null);
    if (refs.length === 0) return;

    const byOu = new Map<number, number[]>();
    for (const ref of refs) {
      const ouId = ref.ouId as number;
      if (!byOu.has(ouId)) byOu.set(ouId, []);
      byOu.get(ouId)!.push(ref.workerId);
    }

    for (const [ouId, workerIds] of byOu.entries()) {
      const { error } = await supabase
        .from("campaign_worker_ou" as never)
        .delete()
        .eq("ou_id", ouId)
        .in("worker_id", workerIds);
      if (error) throw error;
    }

    queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
    selection.clear();
    setRemoveConfirmOpen(false);
  }, [canWrite, selection, supabase, queryClient, campaignId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Wall chart</CardTitle>
        <p className="text-sm text-muted-foreground">
          Cumulative mode uses numeric ratings: blue &lt;2, green 2–&lt;3, amber 3–&lt;4, red ≥4,
          grey unrated (defaults may apply from membership; see tile hover). In an assessment view,
          tile colour is that activity&apos;s rating; binary votes map to the same palette as
          2–4 (supportive / abstained / other). Campaign default view can be overridden per unit
          with the unit &quot;View&quot; control. Cells show c = cumulative and L = last activity.
          <span className="text-foreground/90">
            {" "}
            Campaign-level unmapped slots are unnamed gaps from the worker estimate (up to 40
            displayed); unassigned are named members not placed in an organising unit yet.
          </span>{" "}
          Click a name to edit (staff only).
        </p>
      </CardHeader>
      <CardContent
        className="space-y-4 print:space-y-2"
        tabIndex={-1}
        onKeyDown={handleRootKeyDown}
      >
        {/* Sticky sentinel: when this 1px row scrolls out of view, the
            wrapper below has stuck to the top of the viewport. */}
        <div
          ref={summaryStickySentinelRef}
          aria-hidden
          className="h-px -mb-px"
        />
        <div
          ref={summaryStickyWrapperRef}
          className={`sticky -top-6 z-20 bg-background -mx-2 px-2 pt-1 space-y-2 print:static print:bg-transparent print:p-0 ${
            isSummaryStuck ? "shadow-sm" : ""
          }`}
          // Disable scroll anchoring on this branch so the layout shift
          // caused by collapsing the summary doesn't trigger the browser to
          // adjust scrollY, which made the page feel like it was jumping
          // back to the top of the assessment distribution section.
          style={{ overflowAnchor: "none" }}
        >
        <WallChartSelectionBar
          count={selection.size}
          canWrite={canWrite}
          onMove={() => setBulkDialog({ mode: "move" })}
          onCopy={() => setBulkDialog({ mode: "copy" })}
          onRemove={
            selection.refs().some((r) => r.ouId !== null)
              ? () => setRemoveConfirmOpen(true)
              : undefined
          }
          onClearRatings={() => setClearRatingsDialogOpen(true)}
          onLinkToLeader={() => setLinkDialogOpen(true)}
          onClear={() => selection.clear()}
          onAddToBuildList={
            buildListOpen
              ? async () => {
                  const ids = selection.workerIds();
                  if (ids.length === 0) return;
                  let listId = buildListController.activeListId;
                  if (listId == null) {
                    const created = await buildListController.createList.mutateAsync({
                      name: "Untitled list",
                    });
                    listId = created.list_id;
                  }
                  await buildListController.addItems.mutateAsync({
                    listId,
                    workerIds: ids,
                  });
                  selection.clear();
                }
              : undefined
          }
        />
        <WallChartSummaryHeader
          isStuck={isSummaryStuck}
          assessmentSelector={
            <>
              <AssessmentSelector
                campaignId={campaignId}
                value={campaignAssessmentDefault}
                onChange={setCampaignAssessmentDefault}
              />
              {campaignAssessmentDefault.kind === "assessment" && !isSummaryStuck && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Campaign default: tile colour shows each worker&apos;s rating for{" "}
                  <span className="font-medium text-foreground">
                    {campaignAssessmentDefault.title}
                  </span>
                  . Use each unit&apos;s View control to override. Click the rating on a
                  tile to change it; the small badge is cumulative.
                </p>
              )}
            </>
          }
          campaignName={(campaign as { name?: string | null } | undefined)?.name ?? null}
          metrics={campaignMetrics}
          mode={displayMode}
          onModeChange={setDisplayMode}
          participationLabel={participationSourceLabel(participationSource)}
          participationSelector={
            <ParticipationSelector
              campaignId={campaignId}
              value={participationSource}
              onChange={setParticipationSource}
            />
          }
          overlayToggle={
            <Button
              type="button"
              variant={overlayEnabled ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => toggleOverlay(!overlayEnabled)}
              aria-pressed={overlayEnabled}
              title={`${overlayEnabled ? "Hide" : "Show"} leader\u2194worker links`}
            >
              Links{overlayEnabled ? ` (${allLinks.length})` : ""}
            </Button>
          }
          rightSlot={
            <div className="flex items-center gap-2">
              {canWrite && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs print:hidden"
                  onClick={() => {
                    setAddWorkerContextOu(null);
                    setAddWorkerFormKey((k) => k + 1);
                    setAddWorkerOpen(true);
                  }}
                >
                  Add worker
                </Button>
              )}
              {canWrite && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs print:hidden"
                  onClick={() => setImportWizardOpen(true)}
                >
                  Import Workers
                </Button>
              )}
              {canWrite && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs print:hidden"
                  onClick={() => setCreateAssessmentOpen(true)}
                >
                  Add assessment
                </Button>
              )}
              {canWrite && (
                <Button
                  type="button"
                  size="sm"
                  variant={buildListOpen ? "default" : "outline"}
                  className="h-7 px-2 text-xs print:hidden"
                  onClick={() => setBuildListOpen((v) => !v)}
                  aria-pressed={buildListOpen}
                  title={
                    buildListOpen
                      ? "Close build list panel"
                      : "Open build list panel — drag tiles, units or multi-selections to assemble a cohort"
                  }
                >
                  Build list
                </Button>
              )}
              {canWrite && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs print:hidden"
                  asChild
                >
                  <Link
                    href={`/campaigns/${campaignId}?tab=plan&sub=task-lists&from=wall-chart`}
                  >
                    Task management
                  </Link>
                </Button>
              )}
              <WallChartUnitManager
                ous={ous}
                canWrite={canWrite}
                hiddenOuIds={unitVisibility.hiddenOuIds}
                onToggleHidden={unitVisibility.toggleOu}
                onShowAllHidden={unitVisibility.showAll}
                onReorder={(ids) => reorderOus.mutate(ids)}
                onOpenCreateUnit={() => setCreateUnitOpen(true)}
                onDeleteUnit={canWrite ? (ou) => setDeleteTargetOu(ou) : undefined}
              />
            </div>
          }
        />
        </div>

        {/* overflow-anchor: none prevents the browser from picking these
            elements as scroll anchors. When the sticky summary above
            collapses, its flow height shrinks and content here would
            otherwise become the anchor — the browser would then adjust
            scrollY to keep it visually stable, which felt like the page
            "jumping back to the top of this section". */}
        <div style={{ overflowAnchor: "none" }}>
        <WallChartAssessmentCharts
          campaignId={campaignId}
          activeAssessmentId={
            campaignAssessmentDefault.kind === "assessment"
              ? campaignAssessmentDefault.activityId
              : null
          }
        />

        <div
          className={buildListOpen ? "flex flex-col xl:flex-row gap-3 items-start" : ""}
          style={{ overflowAnchor: "none" }}
        >
        <div
          ref={unitsContainerRef}
          className={`relative space-y-4 print:space-y-2 ${buildListOpen ? "flex-1 min-w-0 w-full" : ""}`}
        >
        {unassignedWorkerIds.length > 0 && (() => {
          const filter = getFilter(UNASSIGNED_KEY);
          const fa = scopeAssessmentFilterAndSort(
            UNASSIGNED_KEY,
            campaignAssessmentDefault,
            unitAssessmentOverride,
            activityRatingsByActivityId
          );
          const filtered = applyFilters(
            unassignedWorkerIds,
            workerById,
            ratingByWorker,
            filter,
            fa.activityRatings,
            fa.ratingCtx
          );
          const sorted = applySort(
            filtered,
            workerById,
            ratingByWorker,
            filter.sort,
            {
              ...(fa.sortAssessment ? { assessmentSort: fa.sortAssessment } : {}),
              relationshipLinks: allLinks,
            }
          );
          const effScope = effectiveAssessmentForScope(
            UNASSIGNED_KEY,
            campaignAssessmentDefault,
            unitAssessmentOverride
          );
          const scopeAssessmentTitle =
            effScope.kind === "assessment" ? effScope.title : null;
          const assessmentLabelForCard =
            effScope.kind === "assessment" ? effScope.title : "Cumulative";
          return (
            <CampaignUnitCard
              ou={null}
              fallbackTitle="Unassigned workers"
              workerCount={sorted.length}
              assessmentLabel={assessmentLabelForCard}
              unfilledSlots={campaignGreySlots > 0 ? campaignGreySlots : undefined}
              onWorkerDrop={handleWorkerDrop}
              dropDisabled={!canWrite}
              unitDragPayload={
                buildListOpen && canWrite && sorted.length > 0
                  ? { workerIds: sorted }
                  : undefined
              }
              summary={
                <UnitSummaryMetrics
                  metrics={unassignedMetrics}
                  mode={displayMode}
                  compact
                  participationLabel={participationSourceLabel(participationSource)}
                  assessmentTitle={scopeAssessmentTitle}
                />
              }
              toolbar={
                <div className="flex flex-wrap items-center gap-2">
                  <UnitAssessmentViewControl
                    campaignId={campaignId}
                    campaignDefault={campaignAssessmentDefault}
                    override={unitAssessmentOverride.get(UNASSIGNED_KEY)}
                    onChangeOverride={(next) => {
                      setUnitAssessmentOverride((prev) => {
                        const copy = new Map(prev);
                        if (next === undefined) copy.delete(UNASSIGNED_KEY);
                        else copy.set(UNASSIGNED_KEY, next);
                        return copy;
                      });
                    }}
                  />
                  <WallChartFilterBar
                    state={filter}
                    onChange={(next) => setFilter(UNASSIGNED_KEY, next)}
                    membershipTypes={derivedOptions.membershipTypes}
                    occupations={derivedOptions.occupations}
                    onApplyToAll={() => {
                      const next = new Map<number, WallChartFilterState>();
                      next.set(UNASSIGNED_KEY, filter);
                      for (const ou of ous) next.set(ou.ou_id, { ...filter });
                      setFilterByScope(next);
                    }}
                  />
                </div>
              }
            >
              {sorted.map((wid) => renderTile(wid, null, UNASSIGNED_KEY))}
            </CampaignUnitCard>
          );
        })()}

        {ous.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add organising units to group workers into frames on the wall chart. Until then, members
            appear under unassigned above (if any). Use New unit above when you have access.
          </p>
        ) : visibleOus.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            All organising units are hidden for this browser. Open Units and tick the units you want to see.
          </p>
        ) : (() => {
          // Group visible units by ou_type so each "dimension" is visually
          // distinct. This also reinforces the cross-dimension DnD restriction:
          // workers can only be moved within a group.
          // Top-level OUs only — sub-units render nested inside their parent's card.
          const topLevelOus = visibleOus.filter(
            (o) =>
              (o as WallChartOU & { parent_ou_id?: number | null }).parent_ou_id == null
          );
          const distinctTypes = [...new Set(topLevelOus.map((o) => o.ou_type))];
          const showGroupHeaders = distinctTypes.length > 1;

          return distinctTypes.map((ouType) => {
            const groupOus = topLevelOus.filter((o) => o.ou_type === ouType);
            return (
              <div key={ouType} className="space-y-4">
                {showGroupHeaders && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {humanizeOuType(ouType)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · {groupOus.length} unit{groupOus.length !== 1 ? "s" : ""}
                    </span>
                    <div className="flex-1 border-t border-muted-foreground/20" />
                  </div>
                )}
                {groupOus.map((ou) => {
                  const ids = visibleWorkersForOu(ou.ou_id);
                  const est = ou.total_workers_estimated ?? 0;
                  const filter = getFilter(ou.ou_id);
                  const fa = scopeAssessmentFilterAndSort(
                    ou.ou_id,
                    campaignAssessmentDefault,
                    unitAssessmentOverride,
                    activityRatingsByActivityId
                  );
                  const filtered = applyFilters(
                    ids,
                    workerById,
                    ratingByWorker,
                    filter,
                    fa.activityRatings,
                    fa.ratingCtx
                  );
                  const sorted = applySort(
                    filtered,
                    workerById,
                    ratingByWorker,
                    filter.sort,
                    {
                      ...(fa.sortAssessment ? { assessmentSort: fa.sortAssessment } : {}),
                      relationshipLinks: allLinks,
                    }
                  );
                  const placeholders = Math.max(0, est - ids.length);
                  const unitMetrics = metricsByOu.get(ou.ou_id);
                  const allInUnitSelected =
                    sorted.length > 0 &&
                    sorted.every((wid) => selection.has(ou.ou_id, wid));
                  const effScope = effectiveAssessmentForScope(
                    ou.ou_id,
                    campaignAssessmentDefault,
                    unitAssessmentOverride
                  );
                  const scopeAssessmentTitle =
                    effScope.kind === "assessment" ? effScope.title : null;
                  const assessmentLabelForCard =
                    effScope.kind === "assessment" ? effScope.title : "Cumulative";
                  return (
                    <div
                      key={ou.ou_id}
                      data-ou-id={ou.ou_id}
                      className={
                        highlightedOuId === ou.ou_id
                          ? "rounded-lg ring-2 ring-primary ring-offset-2 transition-shadow duration-300"
                          : "transition-shadow duration-300"
                      }
                    >
                    <CampaignUnitCard
                      ou={ou}
                      workerCount={sorted.length}
                      estimate={est}
                      placeholders={placeholders}
                      assessmentLabel={assessmentLabelForCard}
                      onWorkerDrop={handleWorkerDrop}
                      dropDisabled={!canWrite}
                      unitDragPayload={
                        buildListOpen && canWrite && sorted.length > 0
                          ? { workerIds: sorted }
                          : undefined
                      }
                      headerBadges={
                        (childrenByParent.get(ou.ou_id)?.length ?? 0) > 0 ? (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Layers className="h-3 w-3" />
                            {childrenByParent.get(ou.ou_id)!.length} sub-unit
                            {childrenByParent.get(ou.ou_id)!.length === 1 ? "" : "s"}
                          </Badge>
                        ) : null
                      }
                      summary={
                        unitMetrics && ids.length > 0 ? (
                          <UnitSummaryMetrics
                            metrics={unitMetrics}
                            mode={displayMode}
                            compact
                            assessmentTitle={scopeAssessmentTitle}
                            participationLabel={participationSourceLabel(participationSource)}
                          />
                        ) : null
                      }
                      toolbar={
                        <div className="flex flex-wrap items-center gap-2">
                          <UnitAssessmentViewControl
                            campaignId={campaignId}
                            campaignDefault={campaignAssessmentDefault}
                            override={unitAssessmentOverride.get(ou.ou_id)}
                            onChangeOverride={(next) => {
                              setUnitAssessmentOverride((prev) => {
                                const copy = new Map(prev);
                                if (next === undefined) copy.delete(ou.ou_id);
                                else copy.set(ou.ou_id, next);
                                return copy;
                              });
                            }}
                          />
                          {canWrite && !ou.is_group_container && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs print:hidden"
                              onClick={() => {
                                setAddWorkerContextOu(ou);
                                setAddWorkerFormKey((k) => k + 1);
                                setAddWorkerOpen(true);
                              }}
                              title="Add worker to this unit"
                            >
                              Add worker
                            </Button>
                          )}
                          {canWrite && sorted.length > 0 && (
                            <Button
                              type="button"
                              size="sm"
                              variant={allInUnitSelected ? "default" : "outline"}
                              className="h-7 px-2 text-xs print:hidden"
                              onClick={() => {
                                if (allInUnitSelected) {
                                  selection.clear();
                                } else {
                                  selection.addAll(
                                    sorted.map((wid) => ({ ouId: ou.ou_id, workerId: wid }))
                                  );
                                }
                              }}
                              title={allInUnitSelected ? "Deselect all in unit" : "Select all in unit"}
                            >
                              {allInUnitSelected ? "Deselect all" : "Select all"}
                            </Button>
                          )}
                          <WallChartFilterBar
                            state={filter}
                            onChange={(next) => setFilter(ou.ou_id, next)}
                            membershipTypes={derivedOptions.membershipTypes}
                            occupations={derivedOptions.occupations}
                            onApplyToAll={() => {
                              const next = new Map<number, WallChartFilterState>();
                              next.set(UNASSIGNED_KEY, { ...filter });
                              for (const o of ous) next.set(o.ou_id, { ...filter });
                              setFilterByScope(next);
                            }}
                          />
                          {canWrite && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 print:hidden"
                                  aria-label="Unit actions"
                                  title="More actions"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem
                                  onClick={() => setSplitTargetOu(ou)}
                                  disabled={(workersByOu.get(ou.ou_id) ?? []).length === 0}
                                >
                                  <Layers className="h-4 w-4 mr-2" /> Split into sub-units
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {!ou.is_group_container && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setAddWorkerContextOu(ou);
                                      setAddWorkerFormKey((k) => k + 1);
                                      setAddWorkerOpen(true);
                                    }}
                                  >
                                    Add worker to unit
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTargetOu(ou)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete unit
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      }
                      subUnits={
                        (childrenByParent.get(ou.ou_id)?.length ?? 0) > 0 ? (
                          <div className="space-y-3">
                            {(childrenByParent.get(ou.ou_id) ?? []).map((child) => {
                              const childIds = workersByOu.get(child.ou_id) ?? [];
                              const childFilter = getFilter(child.ou_id);
                              const childFa = scopeAssessmentFilterAndSort(
                                child.ou_id,
                                campaignAssessmentDefault,
                                unitAssessmentOverride,
                                activityRatingsByActivityId
                              );
                              const childFiltered = applyFilters(
                                childIds,
                                workerById,
                                ratingByWorker,
                                childFilter,
                                childFa.activityRatings,
                                childFa.ratingCtx
                              );
                              const childSorted = applySort(
                                childFiltered,
                                workerById,
                                ratingByWorker,
                                childFilter.sort,
                                {
                                  ...(childFa.sortAssessment
                                    ? { assessmentSort: childFa.sortAssessment }
                                    : {}),
                                  relationshipLinks: allLinks,
                                }
                              );
                              const childMetrics = metricsByOu.get(child.ou_id);
                              const childEffScope = effectiveAssessmentForScope(
                                child.ou_id,
                                campaignAssessmentDefault,
                                unitAssessmentOverride
                              );
                              const childAssessmentTitle =
                                childEffScope.kind === "assessment" ? childEffScope.title : null;
                              const childAssessmentLabel =
                                childEffScope.kind === "assessment" ? childEffScope.title : "Cumulative";
                              return (
                                <div key={child.ou_id} data-ou-id={child.ou_id}>
                                  <CampaignUnitCard
                                    ou={child}
                                    workerCount={childSorted.length}
                                    estimate={child.total_workers_estimated ?? 0}
                                    placeholders={0}
                                    assessmentLabel={childAssessmentLabel}
                                    onWorkerDrop={handleWorkerDrop}
                                    dropDisabled={!canWrite}
                                    unitDragPayload={
                                      buildListOpen && canWrite && childSorted.length > 0
                                        ? { workerIds: childSorted }
                                        : undefined
                                    }
                                    nested
                                    summary={
                                      childMetrics && childIds.length > 0 ? (
                                        <UnitSummaryMetrics
                                          metrics={childMetrics}
                                          mode={displayMode}
                                          compact
                                          assessmentTitle={childAssessmentTitle}
                                          participationLabel={participationSourceLabel(participationSource)}
                                        />
                                      ) : null
                                    }
                                    toolbar={
                                      canWrite ? (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-2 text-xs print:hidden"
                                          onClick={() => {
                                            setAddWorkerContextOu(child);
                                            setAddWorkerFormKey((k) => k + 1);
                                            setAddWorkerOpen(true);
                                          }}
                                          title="Add worker to this unit"
                                        >
                                          Add worker
                                        </Button>
                                      ) : null
                                    }
                                  >
                                    {childSorted.map((wid) => renderTile(wid, child.ou_id, child.ou_id))}
                                  </CampaignUnitCard>
                                </div>
                              );
                            })}
                          </div>
                        ) : null
                      }
                    >
                      {sorted.map((wid) => renderTile(wid, ou.ou_id, ou.ou_id))}
                    </CampaignUnitCard>
                    </div>
                  );
                })}
              </div>
            );
          });
        })()}

        <RelationshipOverlay
            containerRef={unitsContainerRef}
            links={allLinks}
            unitsByWorker={unitsByWorker}
            enabled={overlayEnabled}
          />
        </div>
        {buildListOpen && (
          <BuildListPanel
            campaignId={campaignId}
            canWrite={canWrite}
            open={buildListOpen}
            onClose={() => setBuildListOpen(false)}
            controller={buildListController}
            stickyTopPx={buildListStickyTopPx}
            onTaskDraftCreated={(draft) => {
              setTaskListFiredDraft({
                task_list_id: draft.task_list_id,
                title: draft.title,
                activity_id: draft.activity_id,
                leader_worker_id: draft.leader_worker_id,
                leader_organiser_id: draft.leader_organiser_id,
                include_membership_ask: draft.include_membership_ask,
                leader_instructions: draft.leader_instructions,
                worker_ids: draft.worker_ids,
              });
              setCreateTaskListOpen(true);
            }}
          />
        )}
        </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="print:hidden"
          onClick={() => window.print()}
        >
          Print
        </Button>
      </CardContent>

      <MoveOrCopyWorkersDialog
        key={
          tileUnitDialog
            ? `tile-${tileUnitDialog.workerId}-${tileUnitDialog.fromOuId ?? "unassigned"}`
            : "tile-none"
        }
        open={tileUnitDialog != null}
        onOpenChange={(v) => {
          if (!v) setTileUnitDialog(null);
        }}
        campaignId={campaignId}
        refs={
          tileUnitDialog
            ? [
                {
                  workerId: tileUnitDialog.workerId,
                  fromOuId: tileUnitDialog.fromOuId,
                  fromOuType: tileUnitDialog.fromOuType,
                },
              ]
            : []
        }
        mode="move"
        workerLabel={
          tileDialogWorker
            ? `${tileDialogWorker.first_name} ${tileDialogWorker.last_name}`
            : undefined
        }
        ous={ous}
        excludeOuIds={tileDialogWorkerOuIds}
      />

      {linkDialogOpen && (
        <LinkToLeaderDialog
          key={`link-${selection.size}`}
          open
          onOpenChange={(v) => {
            if (!v) setLinkDialogOpen(false);
          }}
          campaignId={campaignId}
          followerWorkerIds={selection.workerIds()}
          onCompleted={() => {
            selection.clear();
          }}
        />
      )}

      {bulkDialog && (
        <MoveOrCopyWorkersDialog
          key={`${bulkDialog.mode}-${selection.size}`}
          open
          onOpenChange={(v) => {
            if (!v) setBulkDialog(null);
          }}
          campaignId={campaignId}
          refs={selection.refs().map((r) => ({
            workerId: r.workerId,
            fromOuId: r.ouId,
            fromOuType: r.ouId != null ? (ouTypeById.get(r.ouId) ?? null) : null,
          }))}
          mode={bulkDialog.mode}
          ous={ous}
          onCompleted={() => {
            selection.clear();
          }}
        />
      )}

      <AlertDialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove workers from unit?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const count = selection.refs().filter((r) => r.ouId !== null).length;
                return `Remove ${count} assignment${count === 1 ? "" : "s"} from their respective units? Workers remain in the campaign and any other units they belong to. This cannot be undone.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkRemoveFromUnit}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateOrganisingUnitDialog
        open={createUnitOpen}
        onOpenChange={setCreateUnitOpen}
        campaignId={campaignId}
        displayOrder={nextDisplayOrder}
      />

      <CreateAssessmentDialog
        campaignId={campaignId}
        open={createAssessmentOpen}
        onOpenChange={setCreateAssessmentOpen}
        lockKind="assessment"
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["campaign-rating-summary", campaignId] });
          queryClient.invalidateQueries({ queryKey: ["campaign-assessments-rated", campaignId] });
        }}
      />

      <CreateTaskListDialog
        campaignId={campaignId}
        open={createTaskListOpen}
        onOpenChange={(next) => {
          setCreateTaskListOpen(next);
          if (!next) setTaskListFiredDraft(null);
        }}
        draft={taskListFiredDraft ?? undefined}
      />

      <WorkerImportWizard
        open={importWizardOpen}
        onOpenChange={setImportWizardOpen}
        campaignId={campaignId}
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["campaign-members-full", campaignId] });
          queryClient.invalidateQueries({ queryKey: ["workers"] });
        }}
      />

      <AddCampaignWorkerDialog
        open={addWorkerOpen}
        onOpenChange={(next) => {
          setAddWorkerOpen(next);
          if (!next) setAddWorkerContextOu(null);
        }}
        campaignId={campaignId}
        canWrite={canWrite}
        contextOu={addWorkerContextOu}
        organisingUnits={ous}
        formResetKey={addWorkerFormKey}
      />

      {splitTargetOu && (
        <SplitUnitDialog
          open
          onOpenChange={(v) => {
            if (!v) setSplitTargetOu(null);
          }}
          campaignId={campaignId}
          parent={splitTargetOu}
          members={splitMembers}
        />
      )}

      <ClearRatingsDialog
        open={clearRatingsDialogOpen}
        onOpenChange={setClearRatingsDialogOpen}
        campaignId={campaignId}
        workerIds={selection.workerIds()}
        onSuccess={() => selection.clear()}
      />

      {deleteTargetOu && (
        <DeleteOrganisingUnitDialog
          open={!!deleteTargetOu}
          onOpenChange={(o) => {
            if (!o) setDeleteTargetOu(null);
          }}
          campaignId={campaignId}
          unit={deleteTargetOu}
          allOus={ous}
          childOuIds={(childrenByParent.get(deleteTargetOu.ou_id) ?? []).map((c) => c.ou_id)}
          workers={deleteUnitWorkers}
          onDeleted={() => {
            setDeleteTargetOu(null);
            selection.clear();
          }}
        />
      )}
    </Card>
  );
}

// ---- Raw shapes coming back from Supabase (joined rows can be array or object) ----
type RawMemberRow = { membership_id: number; worker_id: number; worker: unknown };
type RawWorker = {
  worker_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  member_role_type_id: number | null;
  is_bargaining_rep: boolean | null;
  is_hsr: boolean | null;
  union_membership_type_id: number | null;
  non_oa_union_option_id: number | null;
  canonical_occupation_id: number | null;
  member_role_type: unknown;
  union_membership_type: unknown;
  non_oa_union_option: unknown;
  canonical_occupation: unknown;
};

