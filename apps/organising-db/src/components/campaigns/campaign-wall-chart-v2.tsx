"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUserCampaignPrefs } from "@/lib/hooks/useUserCampaignPrefs";
import type { KnownIds } from "@/lib/campaign/groups/wall-chart-prefs";

import { WallChartAssessmentCharts } from "./WallChartAssessmentCharts";
import { BuildListPanel } from "./wall-chart/build-list-panel";
import { RelationshipOverlay } from "./wall-chart/relationship-overlay";
import type { WallChartTileContext } from "./wall-chart/wall-chart-tile";
import { useWallChartCoreData } from "./wall-chart/hooks/use-wall-chart-core-data";
import type { WallChartOU } from "./wall-chart/types";
import { NotInAnyGroupView } from "./wall-chart/v2/not-in-any-group-view";
import type { UnitCardMenuAction } from "./wall-chart/v2/unit-card-menu";
import { useWallChartActionsV2 } from "./wall-chart/v2/use-wall-chart-actions-v2";
import { useWallChartGroupView } from "./wall-chart/v2/use-wall-chart-group-view";
import { useWallChartGroups } from "./wall-chart/v2/use-wall-chart-groups";
import { useWallChartShellV2 } from "./wall-chart/v2/use-wall-chart-shell-v2";
import { useWallChartViewV2 } from "./wall-chart/v2/use-wall-chart-view-v2";
import { WallChartDialogsV2 } from "./wall-chart/v2/wall-chart-dialogs-v2";
import { WallChartGroupBand } from "./wall-chart/v2/wall-chart-group-band";
import { WallChartToolbar } from "./wall-chart/v2/wall-chart-toolbar";

/**
 * WP2.4 — the wall chart behind the per-user FL-b flag (docs/organiser-ux-review/wp/wp2.4.md
 * §3): one Group at a time from the Group selector, its Units as one flat
 * band with "Unassigned in <Group>" last, "Not in any group" as a view, one
 * campaign-wide Colour by and Filter, and every view preference in
 * `user_campaign_prefs` (plus `?group=` in the URL). Mounted by
 * `WorkforceBoard` when the per-user flag is on; the legacy
 * `CampaignWallChart` is untouched and renders otherwise.
 *
 * Blocks: A′ shell state (v2), B core data (legacy, unchanged), the groups
 * hook, C′ group view, D′ view/metrics, E the unchanged tile, F′ actions.
 */
export function CampaignWallChartV2({ campaignId, canWrite }: { campaignId: string; canWrite: boolean }) {
  const summaryStickySentinelRef = useRef<HTMLDivElement | null>(null);
  const summaryStickyWrapperRef = useRef<HTMLDivElement | null>(null);
  const unitsContainerRef = useRef<HTMLDivElement | null>(null);

  const shell = useWallChartShellV2({ campaignId, summaryStickySentinelRef, summaryStickyWrapperRef });
  const { workerDetail } = shell.env;
  const { buildListOpen, setBuildListOpen, buildListWallDragActive, onBuildListWallDragStart, onBuildListWallDragEnd } =
    shell.buildListUrl;
  const { selection } = shell;
  const { setTileUnitDialog, setCreateTaskListOpen, setTaskListFiredDraft } = shell.dialogs;

  // Block B — the legacy core data, unchanged; its per-scope state is never touched here.
  const core = useWallChartCoreData({ campaignId, env: shell.env });

  // Prefs (§3.11): a stale assessment or data-field id is dropped on read
  // (D9). Group and unit ids are validated where they are consumed instead
  // (`resolveGroupSelection` against the live groups; hidden / other-group
  // unit ids against the live units), because those sets come from the hooks
  // that read the prefs.
  const prefsKnown = useMemo<KnownIds>(
    () => ({
      activityIds: new Set(core.assessmentOptions.options.map((o) => o.activity_id)),
      factFieldIds: new Set(core.dataFields.map((f) => f.field_id)),
    }),
    [core.assessmentOptions.options, core.dataFields]
  );
  const prefs = useUserCampaignPrefs(campaignId, prefsKnown);
  const { wallChart, setWallChart } = prefs;
  const prefsSettled = prefs.isLoaded || prefs.isError;
  const hiddenOuIds = useMemo(() => new Set(wallChart.hiddenOuIds ?? []), [wallChart.hiddenOuIds]);

  // Groups, units and the resolved selection (`?ou=` → `?group=` → prefs → first → none).
  const clearSelection = selection.clear;
  const groupsState = useWallChartGroups({
    campaignId,
    env: shell.env,
    prefsGroup: wallChart.group ?? null,
    prefsSettled,
    setWallChart,
    clearSelection,
  });

  // Block C′ — the group view.
  const structure = useWallChartGroupView({
    campaignId,
    canWrite,
    env: shell.env,
    selection: groupsState.selection,
    groups: groupsState.groups,
    ous: groupsState.ous,
    members: core.rawMembers,
    ratingSummary: core.ratingSummary,
    hiddenOuIds,
    setWallChart,
    focusOuId: shell.focusOuId,
    setHighlightedOuId: shell.highlight.setHighlightedOuId,
  });

  // Block D′ — one Colour by, one Filter, one pipeline.
  const view = useWallChartViewV2({ campaignId, env: shell.env, wallChart, setWallChart, core, structure });

  // Block F′ — writers.
  const actions = useWallChartActionsV2({ campaignId, canWrite, shell, structure });

  // The sheet's Units tab and "Add to another unit" learn the Groups from the mounted chart (§3.13).
  const registerGroups = workerDetail?.registerGroups;
  const { groups } = groupsState;
  useEffect(() => {
    if (!registerGroups) return;
    registerGroups(groups.map((g) => ({ group_id: g.group_id, name: g.name })));
    return () => registerGroups(null);
  }, [registerGroups, groups]);

  // Block E — the unchanged tile, under the group-scoped context (§3.13).
  const tileContext = useMemo<WallChartTileContext>(
    () => ({
      campaignId,
      canWrite,
      index: structure.index,
      scopeState: view.scopeState,
      activityRatingsByActivityId: view.activityRatingsByActivityId,
      listActivityByWorker: core.listActivityByWorker,
      selection,
      workerDetail,
      setTileUnitDialog,
      buildListOpen,
      buildListWorkerIds: structure.buildList.workerIds,
      onBuildListWallDragStart,
      onBuildListWallDragEnd,
      noteFirstInteraction: view.noteFirstInteraction,
      hint: structure.hint,
    }),
    [
      campaignId,
      canWrite,
      structure.index,
      view.scopeState,
      view.activityRatingsByActivityId,
      core.listActivityByWorker,
      selection,
      workerDetail,
      setTileUnitDialog,
      buildListOpen,
      structure.buildList.workerIds,
      onBuildListWallDragStart,
      onBuildListWallDragEnd,
      view.noteFirstInteraction,
      structure.hint,
    ]
  );

  const { setEditUnit, setAddWorkerContextOu, setAddWorkerFormKey, setAddWorkerOpen, setSplitTargetOu, setMergeSourceOu, setDeleteTargetOu } =
    shell.dialogs;
  const onMenuAction = useCallback(
    (action: UnitCardMenuAction, ou: WallChartOU) => {
      switch (action) {
        case "rename":
          setEditUnit({ ou, field: "name" });
          return;
        case "estimate":
          setEditUnit({ ou, field: "estimate" });
          return;
        case "assign":
          setAddWorkerContextOu(ou);
          setAddWorkerFormKey((k) => k + 1);
          setAddWorkerOpen(true);
          return;
        case "split":
          setSplitTargetOu(ou);
          return;
        case "merge":
          setMergeSourceOu(ou);
          return;
        case "delete":
          setDeleteTargetOu(ou);
          return;
      }
    },
    [setEditUnit, setAddWorkerContextOu, setAddWorkerFormKey, setAddWorkerOpen, setSplitTargetOu, setMergeSourceOu, setDeleteTargetOu]
  );

  const bandProps = { campaignId, canWrite, shell, core, groupsState, structure, view, actions, tileContext, onMenuAction };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Wall chart</CardTitle>
        <p className="text-sm text-muted-foreground">
          Each card is a Unit of the selected Group. Unassigned holds members not yet placed in this Group. Tile
          colour follows Colour by; click a name to open the worker, drag a tile to move it within the Group.
          {prefs.isError && (
            <span className="text-foreground/90"> Your wall chart settings could not be loaded, so changes will not be saved.</span>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 print:space-y-2" tabIndex={-1} onKeyDown={shell.handleRootKeyDown}>
        <WallChartToolbar
          campaignId={campaignId}
          canWrite={canWrite}
          summaryStickySentinelRef={summaryStickySentinelRef}
          summaryStickyWrapperRef={summaryStickyWrapperRef}
          shell={shell}
          core={core}
          groupsState={groupsState}
          structure={structure}
          view={view}
          onRemoveFromGroup={() => shell.dialogs.setRemoveConfirmOpen(true)}
        />

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
                    "--build-list-area-height": `calc(100dvh - ${shell.layout.buildListStickyTopPx + 16}px)`,
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
              {!groupsState.ready ? (
                <p className="text-sm text-muted-foreground">Loading the wall chart…</p>
              ) : groupsState.selection === "none" ? (
                <NotInAnyGroupView {...bandProps} />
              ) : (
                <WallChartGroupBand {...bandProps} />
              )}

              <RelationshipOverlay
                containerRef={unitsContainerRef}
                links={core.leaderLinks}
                unitsByWorker={structure.index.unitsByWorker}
                enabled={view.overlayEnabled}
              />
            </div>
            {buildListOpen && (
              <BuildListPanel
                campaignId={campaignId}
                canWrite={canWrite}
                open={buildListOpen}
                onClose={() => setBuildListOpen(false)}
                controller={structure.buildList.controller}
                stickyTopPx={shell.layout.buildListStickyTopPx}
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

          {/* Tiles first, charts below (WP0.3); the charts stay campaign-wide until WP2.8 (§1.5). */}
          <div className="mt-4">
            <WallChartAssessmentCharts
              campaignId={campaignId}
              activeAssessmentId={view.colourBy.kind === "assessment" ? view.colourBy.activityId : null}
            />
          </div>
        </div>

        <Button type="button" variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
          Print
        </Button>
      </CardContent>

      <WallChartDialogsV2
        campaignId={campaignId}
        canWrite={canWrite}
        shell={shell}
        groupsState={groupsState}
        structure={structure}
        actions={actions}
      />
    </Card>
  );
}
