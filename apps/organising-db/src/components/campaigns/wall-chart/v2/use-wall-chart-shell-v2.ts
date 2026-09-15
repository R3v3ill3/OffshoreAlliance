import { useCallback, useEffect, useState, type RefObject } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import { useCampaignWorkerDetail } from "../../campaign-worker-detail-provider";
import type { FiredTaskDraft } from "../use-build-list";
import { useMoveWorkersMutation } from "../move-worker-mutation";
import { useWallChartSelection } from "../use-wall-chart-selection";
import type { WallChartOU } from "../types";

/**
 * WP2.4 block A′ — the v2 wall chart's shell state (wp2.4.md §3.4).
 *
 * The legacy block A (`hooks/use-wall-chart-shell-state.ts`) is not mounted
 * by the v2 shell because two of its `useState` initialisers read the
 * per-browser `wallchart:overlay:*` and `wallchart:unit-visibility:*` keys,
 * and principle 6 (§3.1) says the v2 chart reads no `wallchart:*` key: both
 * preferences live in `user_campaign_prefs` here (§3.11). Everything else —
 * the client environment, the URL-driven build-list panel, the sticky-summary
 * measurement, `?ou=` focus, selection, dialog state and the move mutation —
 * is the same code with the same hook order (§8.3 D10).
 *
 * The two sticky refs are created by the shell and passed in, for the reason
 * block A gives: `react-hooks/refs` treats every property of a ref-bearing
 * hook result as a ref read during render.
 */
export type HighlightKey = number | "unassigned" | "not-in-any-group";

/** One tile's right-click → Move to unit… (the same shape block A used, so `WallChartTile` needs no change). */
export type TileUnitDialogState = {
  workerId: number;
  fromOuId: number | null;
  fromOuType: string | null;
} | null;

export type EditUnitDialogState = { ou: WallChartOU; field: "name" | "estimate" } | null;

export function useWallChartShellV2({
  campaignId,
  summaryStickySentinelRef,
  summaryStickyWrapperRef,
}: {
  campaignId: string;
  summaryStickySentinelRef: RefObject<HTMLDivElement | null>;
  summaryStickyWrapperRef: RefObject<HTMLDivElement | null>;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const workerDetail = useCampaignWorkerDetail();
  const [tileUnitDialog, setTileUnitDialog] = useState<TileUnitDialogState>(null);
  const [createUnitOpen, setCreateUnitOpen] = useState(false);
  const [createTaskListOpen, setCreateTaskListOpen] = useState(false);
  const [taskListFiredDraft, setTaskListFiredDraft] = useState<FiredTaskDraft | null>(null);

  // Build-list panel open state is URL-driven (?buildList=1) so the persistent
  // campaign header can toggle the panel from any tab (block A, unchanged).
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const buildListOpen = searchParams.get("buildList") === "1";
  const setBuildListOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const params = new URLSearchParams(searchParams.toString());
      const current = params.get("buildList") === "1";
      const value = typeof next === "function" ? next(current) : next;
      if (value) {
        params.set("buildList", "1");
        params.set("view", "wall-chart");
      } else {
        params.delete("buildList");
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );
  const [buildListWallDragActive, setBuildListWallDragActive] = useState(false);
  const onBuildListWallDragStart = useCallback(() => {
    setBuildListWallDragActive(true);
  }, []);
  const onBuildListWallDragEnd = useCallback(() => {
    setBuildListWallDragActive(false);
  }, []);
  useEffect(() => {
    // Same reset as block A; the lint rule reads the setter call as state-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!buildListOpen) setBuildListWallDragActive(false);
  }, [buildListOpen]);

  // Sticky-aware campaign summary (block A, unchanged).
  const [isSummaryStuck, setIsSummaryStuck] = useState(false);
  useEffect(() => {
    const el = summaryStickySentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => setIsSummaryStuck(!entry.isIntersecting),
      { threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [summaryStickySentinelRef]);

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
  }, [summaryStickyWrapperRef]);

  const buildListStickyTopPx =
    isSummaryStuck && summaryStickyHeight > 0 ? summaryStickyHeight - 24 + 8 : 8;

  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [addWorkerOpen, setAddWorkerOpen] = useState(false);
  const [addWorkerFormKey, setAddWorkerFormKey] = useState(0);
  const [addWorkerContextOu, setAddWorkerContextOu] = useState<WallChartOU | null>(null);

  // `?ou=<id>` — scroll to and highlight one unit (and, in v2, select its group).
  const ouParam = searchParams.get("ou");
  const focusOuId = ouParam ? Number(ouParam) : null;
  const [highlightedOuId, setHighlightedOuId] = useState<HighlightKey | null>(null);

  const selection = useWallChartSelection();
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [clearRatingsDialogOpen, setClearRatingsDialogOpen] = useState(false);
  const [splitTargetOu, setSplitTargetOu] = useState<WallChartOU | null>(null);
  const [deleteTargetOu, setDeleteTargetOu] = useState<WallChartOU | null>(null);
  const [mergeSourceOu, setMergeSourceOu] = useState<WallChartOU | null>(null);
  const [editUnit, setEditUnit] = useState<EditUnitDialogState>(null);
  const moveWorkers = useMoveWorkersMutation(campaignId);

  const handleRootKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && selection.size > 0) {
      selection.clear();
    }
  };

  return {
    env: { supabase, queryClient, router, pathname, searchParams, workerDetail },
    buildListUrl: {
      buildListOpen,
      setBuildListOpen,
      buildListWallDragActive,
      onBuildListWallDragStart,
      onBuildListWallDragEnd,
    },
    layout: {
      isStuck: isSummaryStuck,
      stickyHeight: summaryStickyHeight,
      buildListStickyTopPx,
    },
    focusOuId,
    ouParam,
    groupParam: searchParams.get("group"),
    highlight: { highlightedOuId, setHighlightedOuId },
    selection,
    dialogs: {
      tileUnitDialog,
      setTileUnitDialog,
      createUnitOpen,
      setCreateUnitOpen,
      createTaskListOpen,
      setCreateTaskListOpen,
      taskListFiredDraft,
      setTaskListFiredDraft,
      importWizardOpen,
      setImportWizardOpen,
      addWorkerOpen,
      setAddWorkerOpen,
      addWorkerFormKey,
      setAddWorkerFormKey,
      addWorkerContextOu,
      setAddWorkerContextOu,
      bulkMoveOpen,
      setBulkMoveOpen,
      linkDialogOpen,
      setLinkDialogOpen,
      removeConfirmOpen,
      setRemoveConfirmOpen,
      clearRatingsDialogOpen,
      setClearRatingsDialogOpen,
      splitTargetOu,
      setSplitTargetOu,
      deleteTargetOu,
      setDeleteTargetOu,
      mergeSourceOu,
      setMergeSourceOu,
      editUnit,
      setEditUnit,
    },
    moveWorkers,
    handleRootKeyDown,
  };
}

export type WallChartShellV2 = ReturnType<typeof useWallChartShellV2>;
export type WallChartShellV2Env = WallChartShellV2["env"];
export type WallChartShellV2Dialogs = WallChartShellV2["dialogs"];
