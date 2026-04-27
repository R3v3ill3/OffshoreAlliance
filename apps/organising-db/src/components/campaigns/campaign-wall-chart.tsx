"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CampaignUnitCard } from "./wall-chart/campaign-unit-card";
import { WorkerTile } from "./wall-chart/worker-tile";
import { WALL_CHART_GRID_CLASS } from "./wall-chart/rating-colour";
import { ouDisplayName } from "./wall-chart/types";
import { AssessmentSelector } from "./wall-chart/assessment-selector";
import { computeMetrics } from "./wall-chart/metrics";
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
import { WorkerDetailSheet } from "./wall-chart/worker-detail-sheet";
import {
  CopyWorkerToUnitDialog,
  MoveOrCopyWorkersDialog,
  type MoveMode,
} from "./wall-chart/copy-worker-to-unit-dialog";
import { WallChartSelectionBar } from "./wall-chart/wall-chart-selection-bar";
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
  type WallChartFilterState,
} from "./wall-chart/filters";
import type {
  ActivityRating,
  AssessmentSelection,
  WallChartMemberRow,
  WallChartOU,
  WallChartOUAssignment,
  WallChartRatingSummary,
  WallChartRoleType,
  WallChartWorker,
} from "./wall-chart/types";
import { WallChartUnitManager } from "./wall-chart/wall-chart-unit-manager";
import { CreateOrganisingUnitDialog } from "./wall-chart/create-organising-unit-dialog";
import { useWallChartUnitVisibility } from "./wall-chart/use-wall-chart-unit-visibility";
import { CreateAssessmentDialog } from "./assessments/create-assessment-dialog";
import { WorkerImportWizard } from "@/components/import/worker-import-wizard";

export function CampaignWallChart({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  const [copyWorkerId, setCopyWorkerId] = useState<number | null>(null);
  const [createUnitOpen, setCreateUnitOpen] = useState(false);
  const [createAssessmentOpen, setCreateAssessmentOpen] = useState(false);
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const unitVisibility = useWallChartUnitVisibility(campaignId);

  // Multi-select state for bulk Move/Copy/Link actions.
  const selection = useWallChartSelection();
  const [bulkDialog, setBulkDialog] = useState<{ mode: MoveMode } | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
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
             union_membership_type_id, canonical_occupation_id,
             member_role_type:member_role_types(role_name, role_type_id, display_name),
             union_membership_type:union_membership_types(type_name, display_name),
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

  // Assessment selector state. Default is cumulative; AssessmentSelector
  // auto-upgrades to the latest rated assessment once its options load.
  const [assessmentSelection, setAssessmentSelection] = useState<AssessmentSelection>(
    { kind: "cumulative" }
  );

  const selectedActivityId =
    assessmentSelection.kind === "assessment" ? assessmentSelection.activityId : null;

  const { data: activityRatingsByWorker = new Map<number, ActivityRating>() } = useQuery<
    Map<number, ActivityRating>
  >({
    queryKey: ["campaign-activity-ratings", campaignId, selectedActivityId],
    enabled: selectedActivityId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_activity_ratings")
        .select(
          "rating_id, worker_id, activity_id, rating, binary_value, rating_phase, rated_at, source, notes"
        )
        .eq("activity_id", selectedActivityId as number);
      if (error) throw error;

      // Collapse to one row per worker. Prefer rating_phase='actual' over
      // 'expected'; within the same phase, take the most recent rated_at.
      const phaseRank = (phase: string | null | undefined) =>
        phase === "actual" ? 2 : phase === "expected" ? 1 : 0;
      const best = new Map<number, ActivityRating>();
      for (const row of (data ?? []) as ActivityRating[]) {
        const cur = best.get(row.worker_id);
        if (!cur) {
          best.set(row.worker_id, row);
          continue;
        }
        const curPhase = phaseRank(cur.rating_phase);
        const newPhase = phaseRank(row.rating_phase);
        if (newPhase > curPhase) {
          best.set(row.worker_id, row);
          continue;
        }
        if (newPhase < curPhase) continue;
        const curAt = cur.rated_at ?? "";
        const newAt = row.rated_at ?? "";
        if (newAt > curAt) best.set(row.worker_id, row);
      }
      return best;
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
      const occRaw = w?.canonical_occupation;
      const occ = (Array.isArray(occRaw) ? occRaw[0] : occRaw) ?? null;
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
              canonical_occupation_id: w.canonical_occupation_id,
              member_role_type: mt,
              union_membership_type: um,
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

  // ---- Multi-unit assignment metadata ---------------------------------------
  const ouNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const ou of ous) m.set(ou.ou_id, ouDisplayName(ou));
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

  const selectedRow = useMemo(() => {
    if (selectedWorkerId == null) return undefined;
    return memberRows.find((r) => r.worker_id === selectedWorkerId);
  }, [memberRows, selectedWorkerId]);

  const { data: roleTypes = [] } = useQuery({
    queryKey: ["member_role_types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_role_types")
        .select("role_type_id, role_name, display_name")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as WallChartRoleType[];
    },
    enabled: !!selectedWorkerId,
  });

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

  const assessmentMetricsInput = useMemo(() => {
    if (assessmentSelection.kind !== "assessment") return undefined;
    return {
      ratings: activityRatingsByWorker,
      isBinary: assessmentSelection.isBinary,
    };
  }, [assessmentSelection, activityRatingsByWorker]);

  const campaignMetrics = useMemo(
    () =>
      computeMetrics(
        allWorkerIds,
        workerById,
        ratingByWorker,
        participationPredicate,
        assessmentMetricsInput
      ),
    [allWorkerIds, workerById, ratingByWorker, participationPredicate, assessmentMetricsInput]
  );

  const metricsByOu = useMemo(() => {
    const m = new Map<number, ReturnType<typeof computeMetrics>>();
    for (const [ouId, ids] of workersByOu.entries()) {
      m.set(
        ouId,
        computeMetrics(
          ids,
          workerById,
          ratingByWorker,
          participationPredicate,
          assessmentMetricsInput
        )
      );
    }
    return m;
  }, [workersByOu, workerById, ratingByWorker, participationPredicate, assessmentMetricsInput]);

  const unassignedMetrics = useMemo(
    () =>
      computeMetrics(
        unassignedWorkerIds,
        workerById,
        ratingByWorker,
        participationPredicate,
        assessmentMetricsInput
      ),
    [unassignedWorkerIds, workerById, ratingByWorker, participationPredicate, assessmentMetricsInput]
  );

  const assessmentTitle =
    assessmentSelection.kind === "assessment" ? assessmentSelection.title : null;
  const activityRatingsForFilter =
    assessmentSelection.kind === "assessment" ? activityRatingsByWorker : undefined;

  const renderTile = useCallback(
    (workerId: number, ouId: number | null) => {
      const worker = workerById.get(workerId);
      if (!worker) return null;
      const otherUnitIds = (unitsByWorker.get(workerId) ?? []).filter((id) => id !== ouId);
      const otherUnitNames = otherUnitIds
        .map((id) => ouNameById.get(id))
        .filter((n): n is string => Boolean(n));
      const inMultipleUnits = (unitsByWorker.get(workerId) ?? []).length > 1;
      return (
        <WorkerTile
          key={`${ouId ?? "u"}-${workerId}`}
          worker={worker}
          rating={ratingByWorker.get(workerId)}
          ouId={ouId}
          inMultipleUnits={inMultipleUnits}
          otherUnitNames={otherUnitNames}
          canWrite={canWrite}
          selection={assessmentSelection}
          campaignId={campaignId}
          activityRating={activityRatingsByWorker.get(workerId) ?? null}
          isSelected={selection.has(ouId, workerId)}
          onClick={(id, tileOuId, kind) => {
            if (kind === "toggle-select") {
              selection.toggle(tileOuId, id);
              return;
            }
            // Plain click: open the sheet. If a selection exists, clear it first
            // so the user isn't left with a stale selection after drilling in.
            if (selection.size > 0) selection.clear();
            setSelectedWorkerId(id);
          }}
          onCopy={(id) => setCopyWorkerId(id)}
          onDragStartRefs={(id, tileOuId) => {
            // If the dragged tile is in the current selection, carry the whole
            // selection; otherwise, drag just this one tile. This matches the
            // Finder/macOS convention for list drags.
            if (selection.has(tileOuId, id)) {
              return selection
                .refs()
                .map((r) => ({ workerId: r.workerId, fromOuId: r.ouId }));
            }
            return [{ workerId: id, fromOuId: tileOuId }];
          }}
        />
      );
    },
    [
      workerById,
      unitsByWorker,
      ouNameById,
      ratingByWorker,
      canWrite,
      selection,
      assessmentSelection,
      activityRatingsByWorker,
      campaignId,
    ]
  );

  const copyWorker = copyWorkerId != null ? workerById.get(copyWorkerId) : undefined;
  const copyWorkerOuIds = copyWorkerId != null ? unitsByWorker.get(copyWorkerId) ?? [] : [];

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
    [canWrite, moveWorkers, selection]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Wall chart</CardTitle>
        <p className="text-sm text-muted-foreground">
          Colours: blue &lt;2, green 2–&lt;3, orange 3–&lt;4, red ≥4, grey unrated. Cells show c =
          cumulative and L = last activity (hover for full labels). Unrated cells may use membership
          or leadership defaults for background colour only (see hover text).{" "}
          <span className="text-foreground/90">
            Campaign-level unmapped slots are unnamed gaps from the worker estimate; unassigned are
            named members not placed in an organising unit yet.
          </span>{" "}
          Click a name to edit (staff only).
        </p>
      </CardHeader>
      <CardContent
        className="space-y-4 print:space-y-2"
        tabIndex={-1}
        onKeyDown={handleRootKeyDown}
      >
        <WallChartSelectionBar
          count={selection.size}
          canWrite={canWrite}
          onMove={() => setBulkDialog({ mode: "move" })}
          onCopy={() => setBulkDialog({ mode: "copy" })}
          onLinkToLeader={() => setLinkDialogOpen(true)}
          onClear={() => selection.clear()}
        />
        <div className="rounded border bg-muted/30 px-3 py-2 print:hidden">
          <AssessmentSelector
            campaignId={campaignId}
            value={assessmentSelection}
            onChange={setAssessmentSelection}
          />
          {assessmentSelection.kind === "assessment" && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Tile colour shows each worker&apos;s rating for{" "}
              <span className="font-medium text-foreground">
                {assessmentSelection.title}
              </span>
              . Click the rating number on a tile to change it. The small badge in
              the corner is the cumulative rating.
            </p>
          )}
        </div>
        <WallChartSummaryHeader
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
              <WallChartUnitManager
                ous={ous}
                canWrite={canWrite}
                hiddenOuIds={unitVisibility.hiddenOuIds}
                onToggleHidden={unitVisibility.toggleOu}
                onShowAllHidden={unitVisibility.showAll}
                onReorder={(ids) => reorderOus.mutate(ids)}
                onOpenCreateUnit={() => setCreateUnitOpen(true)}
              />
            </div>
          }
        />

        {campaignGreySlots > 0 && (
          <Card className="print:break-inside-avoid print:shadow-none">
            <CardHeader className="pb-2">
              <h3 className="text-sm font-semibold">Campaign-level unmapped</h3>
              <p className="text-xs text-muted-foreground">{campaignGreySlots} unfilled slots</p>
            </CardHeader>
            <CardContent>
              <div className={WALL_CHART_GRID_CLASS}>
                {Array.from({ length: Math.min(campaignGreySlots, 40) }).map((_, i) => (
                  <div
                    key={i}
                    className="min-h-[3.25rem] rounded border border-dashed bg-zinc-300/50 dark:bg-zinc-600/50 text-[10px] flex items-center justify-center text-muted-foreground"
                  >
                    —
                  </div>
                ))}
              </div>
              {campaignGreySlots > 40 && (
                <p className="text-xs text-muted-foreground mt-2">
                  +{campaignGreySlots - 40} more unmapped slots
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <div ref={unitsContainerRef} className="relative space-y-4 print:space-y-2">
        {unassignedWorkerIds.length > 0 && (() => {
          const filter = getFilter(UNASSIGNED_KEY);
          const filtered = applyFilters(
            unassignedWorkerIds,
            workerById,
            ratingByWorker,
            filter,
            activityRatingsForFilter
          );
          const sorted = applySort(filtered, workerById, ratingByWorker, filter.sort);
          return (
            <CampaignUnitCard
              ou={null}
              fallbackTitle="Unassigned workers"
              workerCount={sorted.length}
              assessmentLabel={assessmentTitle}
              onWorkerDrop={handleWorkerDrop}
              dropDisabled={!canWrite}
              summary={
                <UnitSummaryMetrics
                  metrics={unassignedMetrics}
                  mode={displayMode}
                  compact
                  participationLabel={participationSourceLabel(participationSource)}
                  assessmentTitle={assessmentTitle}
                />
              }
              toolbar={
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
              }
            >
              {sorted.map((wid) => renderTile(wid, null))}
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
        ) : (
          visibleOus.map((ou) => {
            const ids = workersByOu.get(ou.ou_id) ?? [];
            const est = ou.total_workers_estimated ?? 0;
            const filter = getFilter(ou.ou_id);
            const filtered = applyFilters(
              ids,
              workerById,
              ratingByWorker,
              filter,
              activityRatingsForFilter
            );
            const sorted = applySort(filtered, workerById, ratingByWorker, filter.sort);
            const placeholders = Math.max(0, est - ids.length);
            const unitMetrics = metricsByOu.get(ou.ou_id);
            return (
              <CampaignUnitCard
                key={ou.ou_id}
                ou={ou}
                workerCount={sorted.length}
                estimate={est}
                placeholders={placeholders}
                assessmentLabel={assessmentTitle}
                onWorkerDrop={handleWorkerDrop}
                dropDisabled={!canWrite}
                summary={
                  unitMetrics && ids.length > 0 ? (
                    <UnitSummaryMetrics
                      metrics={unitMetrics}
                      mode={displayMode}
                      compact
                      assessmentTitle={assessmentTitle}
                      participationLabel={participationSourceLabel(participationSource)}
                    />
                  ) : null
                }
                toolbar={
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
                }
              >
                {sorted.map((wid) => renderTile(wid, ou.ou_id))}
              </CampaignUnitCard>
            );
          })
        )}

        <RelationshipOverlay
            containerRef={unitsContainerRef}
            links={allLinks}
            unitsByWorker={unitsByWorker}
            enabled={overlayEnabled}
          />
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

      <Sheet open={!!selectedRow} onOpenChange={() => setSelectedWorkerId(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {selectedRow?.worker
                ? `${selectedRow.worker.first_name} ${selectedRow.worker.last_name}`
                : "Worker"}
            </SheetTitle>
          </SheetHeader>
          {selectedRow?.worker && (
            <WorkerDetailSheet
              key={selectedRow.worker_id}
              campaignId={campaignId}
              workerId={selectedRow.worker_id}
              worker={selectedRow.worker}
              ous={ous}
              assignedOuIds={(unitsByWorker.get(selectedRow.worker_id) ?? []).slice().sort((a, b) => a - b)}
              primaryOuId={
                (ouAssign.find(
                  (a) => a.worker_id === selectedRow.worker_id && a.is_primary
                )?.ou_id) ?? null
              }
              roleTypes={roleTypes}
              canWrite={canWrite}
              onClose={() => setSelectedWorkerId(null)}
              onRequestCopyToUnit={(id) => setCopyWorkerId(id)}
            />
          )}
        </SheetContent>
      </Sheet>

      <CopyWorkerToUnitDialog
        open={copyWorkerId != null}
        onOpenChange={(v) => {
          if (!v) setCopyWorkerId(null);
        }}
        campaignId={campaignId}
        workerId={copyWorkerId}
        workerName={copyWorker ? `${copyWorker.first_name} ${copyWorker.last_name}` : undefined}
        ous={ous}
        currentOuIds={copyWorkerOuIds}
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
          refs={selection.refs().map((r) => ({ workerId: r.workerId, fromOuId: r.ouId }))}
          mode={bulkDialog.mode}
          ous={ous}
          onCompleted={() => {
            selection.clear();
          }}
        />
      )}

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
        }}
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
  canonical_occupation_id: number | null;
  member_role_type: unknown;
  union_membership_type: unknown;
  canonical_occupation: unknown;
};

