"use client";

import { type CSSProperties, useMemo, useRef } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { WallChartAssessmentCharts } from "./WallChartAssessmentCharts";
import { BuildListPanel } from "./wall-chart/build-list-panel";
import { RelationshipOverlay } from "./wall-chart/relationship-overlay";
import { WallChartDialogs } from "./wall-chart/wall-chart-dialogs";
import { WallChartHeader } from "./wall-chart/wall-chart-header";
import type { WallChartTileContext } from "./wall-chart/wall-chart-tile";
import { WallChartUnassignedCard } from "./wall-chart/wall-chart-unassigned-card";
import { WallChartUnitHierarchy } from "./wall-chart/wall-chart-unit-hierarchy";
import { useWallChartActions } from "./wall-chart/hooks/use-wall-chart-actions";
import { useWallChartCoreData } from "./wall-chart/hooks/use-wall-chart-core-data";
import { useWallChartShellState } from "./wall-chart/hooks/use-wall-chart-shell-state";
import { useWallChartStructure } from "./wall-chart/hooks/use-wall-chart-structure";
import { useWallChartViewMetrics } from "./wall-chart/hooks/use-wall-chart-view-metrics";

export function CampaignWallChart({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  // DOM refs are owned by the shell that renders the nodes. They deliberately
  // do not travel through a hook's return value: `react-hooks/refs` treats
  // every property of a ref-bearing hook result as a ref read during render.
  const summaryStickySentinelRef = useRef<HTMLDivElement | null>(null);
  const summaryStickyWrapperRef = useRef<HTMLDivElement | null>(null);
  const unitsContainerRef = useRef<HTMLDivElement | null>(null);

  // Block A — see wall-chart/hooks/use-wall-chart-shell-state.ts.
  const shell = useWallChartShellState({
    campaignId,
    summaryStickySentinelRef,
    summaryStickyWrapperRef,
  });
  const { workerDetail } = shell.env;
  const {
    buildListOpen,
    setBuildListOpen,
    buildListWallDragActive,
    onBuildListWallDragStart,
    onBuildListWallDragEnd,
  } = shell.buildListUrl;
  const buildListStickyTopPx = shell.layout.buildListStickyTopPx;
  const unitVisibility = shell.visibility;
  const focusOuId = shell.focusOuId;
  const { setHighlightedOuId } = shell.highlight;
  const selection = shell.selection;
  const { setTileUnitDialog, setCreateTaskListOpen, setTaskListFiredDraft } = shell.dialogs;
  const moveWorkers = shell.moveWorkers;
  const handleRootKeyDown = shell.handleRootKeyDown;
  const overlayEnabled = shell.overlay.enabled;

  // Block B — see wall-chart/hooks/use-wall-chart-core-data.ts.
  const core = useWallChartCoreData({ campaignId, env: shell.env });
  const allLinks = core.leaderLinks;
  const members = core.rawMembers;
  const ratingSummary = core.ratingSummary;
  const listActivityByWorker = core.listActivityByWorker;
  const { campaignAssessmentDefault } = core.scopeState;
  const activityRatingsByActivityId = core.activityRatings;

  // Block C — see wall-chart/hooks/use-wall-chart-structure.ts.
  const struct = useWallChartStructure({
    campaignId,
    canWrite,
    env: shell.env,
    unitVisibility,
    focusOuId,
    setHighlightedOuId,
    members,
    ratingSummary,
  });
  const { ous, visibleOus, campaign } = struct;
  const ouAssign = struct.ouAssignments;
  const { unitsByWorker, unassignedWorkerIds } = struct.index;
  const buildListController = struct.buildList.controller;
  const buildListWorkerIds = struct.buildList.workerIds;

  // Block D — see wall-chart/hooks/use-wall-chart-view-metrics.ts.
  const view = useWallChartViewMetrics({
    campaignId,
    scopeState: core.scopeState,
    ratingSummary,
    ous,
    campaign,
    index: struct.index,
    activityRatingsByActivityId,
  });
  const { noteFirstInteraction } = view.filters;

  // Block E is the hook-free <WallChartTile/>; the shell assembles its context
  // once (a prop-assembly memo, permitted by §3.2) and spreads it at each site.
  const tileContext = useMemo<WallChartTileContext>(
    () => ({
      campaignId,
      canWrite,
      index: struct.index,
      scopeState: core.scopeState,
      activityRatingsByActivityId,
      listActivityByWorker,
      selection,
      workerDetail,
      setTileUnitDialog,
      buildListOpen,
      buildListWorkerIds,
      onBuildListWallDragStart,
      onBuildListWallDragEnd,
      noteFirstInteraction,
      hint: struct.hint,
    }),
    [
      campaignId,
      canWrite,
      struct.index,
      core.scopeState,
      activityRatingsByActivityId,
      listActivityByWorker,
      selection,
      workerDetail,
      setTileUnitDialog,
      buildListOpen,
      buildListWorkerIds,
      onBuildListWallDragStart,
      onBuildListWallDragEnd,
      noteFirstInteraction,
      struct.hint,
    ]
  );

  // Block F — see wall-chart/hooks/use-wall-chart-actions.ts.
  const actions = useWallChartActions({
    campaignId,
    canWrite,
    env: shell.env,
    selection,
    dialogs: shell.dialogs,
    moveWorkers,
    ouAssign,
    index: struct.index,
  });
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
            Campaign-level unmapped slots are unnamed gaps from the worker estimate (up to 24
            cells shown per unit, then a &quot;+N more&quot; note); unassigned are named members
            not placed in an organising unit yet.
          </span>{" "}
          Click a name to edit (staff only).
        </p>
      </CardHeader>
      <CardContent
        className="space-y-4 print:space-y-2"
        tabIndex={-1}
        onKeyDown={handleRootKeyDown}
      >
        {/* Stage 9 — see wall-chart/wall-chart-header.tsx. */}
        <WallChartHeader
          campaignId={campaignId}
          canWrite={canWrite}
          summaryStickySentinelRef={summaryStickySentinelRef}
          summaryStickyWrapperRef={summaryStickyWrapperRef}
          shell={shell}
          core={core}
          struct={struct}
          view={view}
        />

        {/* overflow-anchor: none prevents the browser from picking these
            elements as scroll anchors. When the sticky summary above
            collapses, its flow height shrinks and content here (the units
            container is now the first candidate) would otherwise become the
            anchor — the browser would then adjust scrollY to keep it visually
            stable, which felt like the page "jumping back to the top". */}
        <div style={{ overflowAnchor: "none" }}>
        <div
          className={
            buildListOpen
              ? "flex flex-col gap-3 items-start lg:flex-row lg:h-[var(--build-list-area-height)] lg:max-h-[var(--build-list-area-height)] lg:min-h-0 print:!h-auto print:!max-h-none"
              : ""
          }
          style={
            buildListOpen
              ? ({
                  overflowAnchor: "none",
                  "--build-list-area-height": `calc(100dvh - ${buildListStickyTopPx + 16}px)`,
                } as CSSProperties)
              : { overflowAnchor: "none" }
          }
        >
        <div
          ref={unitsContainerRef}
          className={`relative space-y-4 print:space-y-2 ${
            buildListOpen
              ? "flex-1 min-w-0 w-full lg:h-full lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-2 print:!h-auto print:!overflow-visible print:!pr-0"
              : ""
          }`}
        >
        {unassignedWorkerIds.length > 0 && (
          <WallChartUnassignedCard
            campaignId={campaignId}
            canWrite={canWrite}
            shell={shell}
            core={core}
            struct={struct}
            view={view}
            actions={actions}
            tileContext={tileContext}
          />
        )}

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
          <WallChartUnitHierarchy
            campaignId={campaignId}
            canWrite={canWrite}
            shell={shell}
            core={core}
            struct={struct}
            view={view}
            actions={actions}
            tileContext={tileContext}
          />
        )}

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
            wallChartDragActive={buildListWallDragActive}
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

        {/* Tiles first: the assessment-distribution charts sit below the unit
            cards so an organiser sees the wall before the summary charts.
            The card collapses itself, so below-the-fold costs nothing. */}
        <div className="mt-4">
          <WallChartAssessmentCharts
            campaignId={campaignId}
            activeAssessmentId={
              campaignAssessmentDefault.kind === "assessment"
                ? campaignAssessmentDefault.activityId
                : null
            }
          />
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

      {/* Stage 9 — see wall-chart/wall-chart-dialogs.tsx. */}
      <WallChartDialogs
        campaignId={campaignId}
        canWrite={canWrite}
        shell={shell}
        struct={struct}
        actions={actions}
      />
    </Card>
  );
}


