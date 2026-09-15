"use client";

import { CampaignUnitCard } from "../campaign-unit-card";
import { UnitCoverageBadge } from "../../activists/unit-coverage-badge";
import { UnitRatingControl } from "../unit-rating-control";
import { UnitSummaryMetrics } from "../unit-summary-metrics";
import { WallChartTile, type WallChartTileContext } from "../wall-chart-tile";
import { participationSourceLabel } from "../participation-selector";
import { ouDisplayName, type WallChartOU } from "../types";
import type { WallChartCoreData } from "../hooks/use-wall-chart-core-data";
import { UnitCardMenu, type UnitCardMenuAction } from "./unit-card-menu";
import { WallChartUnassignedCardV2 } from "./wall-chart-unassigned-card-v2";
import type { WallChartActionsV2 } from "./use-wall-chart-actions-v2";
import type { WallChartGroupsState } from "./use-wall-chart-groups";
import type { WallChartGroupView } from "./use-wall-chart-group-view";
import type { WallChartShellV2 } from "./use-wall-chart-shell-v2";
import type { WallChartViewV2 } from "./use-wall-chart-view-v2";

export type WallChartBandProps = {
  campaignId: string;
  canWrite: boolean;
  shell: WallChartShellV2;
  core: WallChartCoreData;
  groupsState: WallChartGroupsState;
  structure: WallChartGroupView;
  view: WallChartViewV2;
  actions: WallChartActionsV2;
  tileContext: WallChartTileContext;
  onMenuAction: (action: UnitCardMenuAction, ou: WallChartOU) => void;
};

/**
 * WP2.4 — the band: the selected Group's units as one flat row of cards, then
 * its Unassigned card last (wp2.4.md §3.4, §3.7; plan 5.6 `:291`). No
 * `ou_type` bands, no nesting, no roll-ups: every card is a Unit of the one
 * Group, and every card's list comes from the one pipeline.
 */
export function WallChartGroupBand(props: WallChartBandProps) {
  const { groupsState, structure, view } = props;
  const group = groupsState.selectedGroup;
  if (!group) return null;

  const { renderedUnits, emptyHiddenCount } = view;
  const { groupUnits, hiddenInGroupCount } = structure;

  return (
    <div className="space-y-4">
      {groupUnits.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {group.name} has no Units yet. Use Units above to add one; until then everyone in the campaign is
          Unassigned in {group.name}.
        </p>
      ) : renderedUnits.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {hiddenInGroupCount === groupUnits.length
            ? `Every Unit of ${group.name} is hidden. Open Units and tick the Units you want to see.`
            : `Every Unit of ${group.name} is empty after filtering. Turn on Show empty units to see them.`}
        </p>
      ) : (
        renderedUnits.map((ou) => <UnitCardV2 key={ou.ou_id} ou={ou} {...props} />)
      )}
      {emptyHiddenCount > 0 && renderedUnits.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {emptyHiddenCount} empty {emptyHiddenCount === 1 ? "unit" : "units"} hidden — turn on Show empty units to
          see {emptyHiddenCount === 1 ? "it" : "them"}.
        </p>
      )}
      <WallChartUnassignedCardV2 {...props} />
    </div>
  );
}

/**
 * One Unit card: `CampaignUnitCard` reused with the campaign-wide labels, the
 * coverage / WOC badges, the rating control, the summary metrics, a toolbar
 * that holds ONLY the ⋯ menu, and "Select all" as a click on the count
 * (§3.6). The tiles are the unchanged `WallChartTile` under the group-scoped
 * context.
 */
export function UnitCardV2({
  ou,
  campaignId,
  canWrite,
  shell,
  core,
  structure,
  view,
  actions,
  tileContext,
  onMenuAction,
}: WallChartBandProps & { ou: WallChartOU }) {
  const { buildListOpen, onBuildListWallDragStart, onBuildListWallDragEnd } = shell.buildListUrl;
  const { highlightedOuId } = shell.highlight;
  const { coverageByOu, wocRepByUnit } = core.coverage;
  const sorted = view.visibleByUnit.get(ou.ou_id) ?? [];
  const allIds = structure.workersByUnit.get(ou.ou_id) ?? [];
  const unitMetrics = view.metrics.metricsByUnit.get(ou.ou_id);
  const est = ou.total_workers_estimated ?? 0;
  const placeholders = Math.max(0, est - allIds.length);
  const allSelected = sorted.length > 0 && sorted.every((id) => shell.selection.has(ou.ou_id, id));
  const title = ouDisplayName(ou);

  return (
    <div
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
        assessmentLabel={view.assessmentTitle ?? "Cumulative"}
        onWorkerDrop={actions.handleWorkerDrop}
        dropDisabled={!canWrite}
        unitDragPayload={buildListOpen && canWrite && sorted.length > 0 ? { workerIds: sorted } : undefined}
        onUnitDragSessionStart={buildListOpen ? onBuildListWallDragStart : undefined}
        onUnitDragSessionEnd={buildListOpen ? onBuildListWallDragEnd : undefined}
        countAction={
          sorted.length > 0
            ? {
                onClick: () => actions.toggleSelectAll(ou.ou_id, sorted),
                label: allSelected ? `Deselect all in ${title}` : `Select all in ${title}`,
                pressed: allSelected,
              }
            : undefined
        }
        headerBadges={
          <UnitCoverageBadge
            coverage={coverageByOu.get(ou.ou_id) ?? null}
            wocState={wocRepByUnit.get(ou.ou_id) ?? null}
          />
        }
        ratingControl={
          <UnitRatingControl ouId={ou.ou_id} rating={ou.user_rating} canWrite={canWrite} campaignId={campaignId} />
        }
        summary={
          unitMetrics && allIds.length > 0 ? (
            <UnitSummaryMetrics
              metrics={unitMetrics}
              mode={view.displayMode}
              compact
              assessmentTitle={view.assessmentTitle}
              participationLabel={participationSourceLabel(view.participationSource)}
            />
          ) : null
        }
        toolbar={
          canWrite ? (
            <UnitCardMenu ou={ou} canMerge={structure.groupUnits.length > 1} onAction={onMenuAction} />
          ) : undefined
        }
      >
        {sorted.map((wid) => (
          <WallChartTile key={`${ou.ou_id}-${wid}`} {...tileContext} workerId={wid} ouId={ou.ou_id} scopeKey={ou.ou_id} />
        ))}
      </CampaignUnitCard>
    </div>
  );
}
