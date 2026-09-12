import { useCallback, useEffect, useState, type RefObject } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import { useCampaignWorkerDetail } from "../../campaign-worker-detail-provider";
import type { MoveMode } from "../copy-worker-to-unit-dialog";
import type { FiredTaskDraft } from "../use-build-list";
import { useMoveWorkersMutation } from "../move-worker-mutation";
import { useWallChartSelection } from "../use-wall-chart-selection";
import { useWallChartUnitVisibility } from "../use-wall-chart-unit-visibility";
import type { WallChartOU } from "../types";

/**
 * WP2.3 block A — the wall chart's shell state, moved verbatim out of
 * `campaign-wall-chart.tsx` (`WC:222–368`). Client environment, build-list URL
 * state, sticky-summary measurement, unit visibility, `?ou=` focus, selection,
 * dialog state, the move mutation and the relationship-overlay preference.
 *
 * The block's internal hook and effect order is preserved exactly; only
 * closure reads become explicit arguments and return values.
 *
 * The two sticky-summary refs are created by the shell and passed in rather
 * than created here: `react-hooks/refs` treats every property of a hook result
 * that contains a ref as a ref read during render, which produced dozens of
 * false positives across the shell. Refs carry no state or effect, so where
 * they are declared has no behavioural consequence — the effects that read
 * them stay in this block, in order.
 */
export function useWallChartShellState({
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
  const [tileUnitDialog, setTileUnitDialog] = useState<{
    workerId: number;
    fromOuId: number | null;
    fromOuType: string | null;
  } | null>(null);
  const [createUnitOpen, setCreateUnitOpen] = useState(false);
  const [createTaskListOpen, setCreateTaskListOpen] = useState(false);
  const [taskListFiredDraft, setTaskListFiredDraft] = useState<FiredTaskDraft | null>(null);
  // Build-list panel open state is URL-driven (?buildList=1) so the persistent
  // campaign header can toggle the panel from any tab. The wall chart still
  // owns the panel mount and layout; it just reads the open state from the URL.
  const router = useRouter();
  const pathname = usePathname();
  const wallChartSearchParams = useSearchParams();
  const buildListOpen = wallChartSearchParams.get("buildList") === "1";
  const setBuildListOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const params = new URLSearchParams(wallChartSearchParams.toString());
      const current = params.get("buildList") === "1";
      const value = typeof next === "function" ? next(current) : next;
      if (value) {
        params.set("buildList", "1");
        // The build-list panel is only mounted in the wall chart, and an absent
        // ?view= means "device default" (list on touch), so state it explicitly.
        params.set("view", "wall-chart");
      } else {
        params.delete("buildList");
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, wallChartSearchParams]
  );
  const [buildListWallDragActive, setBuildListWallDragActive] = useState(false);
  const onBuildListWallDragStart = useCallback(() => {
    setBuildListWallDragActive(true);
  }, []);
  const onBuildListWallDragEnd = useCallback(() => {
    setBuildListWallDragActive(false);
  }, []);
  useEffect(() => {
    // WP2.3 verbatim move. react-hooks could not analyse this effect inside the
    // 2,635-line component, so it went unreported there; the code is
    // byte-identical and changing it would be a behaviour change (§1.4).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!buildListOpen) setBuildListWallDragActive(false);
  }, [buildListOpen]);
  // buildListController is declared further down once workerById / ratingByWorker
  // are available, so the optimistic add can hydrate placeholders from the
  // wall chart's already-loaded worker data.

  // Sticky-aware campaign summary: a 1px sentinel rendered just above the
  // sticky wrapper. When the sentinel scrolls out of viewport, the wrapper
  // has stuck to the top — we pass `isStuck` to the summary header so it
  // collapses verbose content while keeping the rating selector, controls
  // and thin rating bar visible.
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

  // Measure the sticky summary's height so the build-list panel (also
  // sticky) can offset itself to sit just below the summary instead of
  // disappearing behind it. We track height continuously so the offset
  // adjusts to the collapsed vs. expanded summary.
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
  const focusOuId = wallChartSearchParams.get("ou")
    ? Number(wallChartSearchParams.get("ou"))
    : null;
  const [highlightedOuId, setHighlightedOuId] = useState<
    number | "unassigned" | null
  >(null);

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

  return {
    env: { supabase, queryClient, router, pathname, searchParams: wallChartSearchParams, workerDetail },
    buildListUrl: {
      buildListOpen,
      setBuildListOpen,
      buildListWallDragActive,
      onBuildListWallDragStart,
      onBuildListWallDragEnd,
    },
    layout: {
      // The refs the caller passed in are deliberately not echoed back here.
      isStuck: isSummaryStuck,
      stickyHeight: summaryStickyHeight,
      buildListStickyTopPx,
    },
    visibility: unitVisibility,
    focusOuId,
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
      bulkDialog,
      setBulkDialog,
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
    },
    moveWorkers,
    handleRootKeyDown,
    overlay: { enabled: overlayEnabled, setEnabled: toggleOverlay },
  };
}

export type WallChartShellState = ReturnType<typeof useWallChartShellState>;
export type WallChartShellEnv = WallChartShellState["env"];
export type WallChartShellDialogs = WallChartShellState["dialogs"];
export type WallChartShellLayout = WallChartShellState["layout"];
export type WallChartBuildListUrl = WallChartShellState["buildListUrl"];
