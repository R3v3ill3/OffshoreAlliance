"use client";

import { CampaignUnitCard } from "../campaign-unit-card";
import { UnitSummaryMetrics } from "../unit-summary-metrics";
import { WallChartTile } from "../wall-chart-tile";
import { participationSourceLabel } from "../participation-selector";
import { UNASSIGNED_CARD_KEY } from "./use-wall-chart-group-view";
import type { WallChartBandProps } from "./wall-chart-group-band";

/**
 * WP2.4 — "Unassigned in <Group>" (wp2.4.md §3.7; plan 5.6 `:291`): rendered
 * last in the band whenever a real Group is selected, even when empty. Its
 * members are the Group's `unassignedWorkerIds` (derived, never stored); a
 * drop here is `placements.move({ toOuId: null, withinGroupId })` through the
 * same planner as every other drop. No toolbar; bulk actions and the
 * build-list drag handle work as on a Unit card; the campaign's unfilled
 * slots are shown here only, as today.
 */
export function WallChartUnassignedCardV2({
  canWrite,
  shell,
  groupsState,
  structure,
  view,
  actions,
  tileContext,
}: WallChartBandProps) {
  const group = groupsState.selectedGroup;
  if (!group) return null;
  const { buildListOpen, onBuildListWallDragStart, onBuildListWallDragEnd } = shell.buildListUrl;
  const { highlightedOuId } = shell.highlight;
  const sorted = view.visibleUnassigned;
  const allIds = structure.unassignedWorkerIds;
  const allSelected = sorted.length > 0 && sorted.every((id) => shell.selection.has(null, id));
  const title = `Unassigned in ${group.name}`;

  return (
    <div
      data-ou-id={UNASSIGNED_CARD_KEY}
      className={
        highlightedOuId === UNASSIGNED_CARD_KEY
          ? "rounded-lg ring-2 ring-primary ring-offset-2 transition-shadow duration-300"
          : "transition-shadow duration-300"
      }
    >
      <CampaignUnitCard
        ou={null}
        fallbackTitle={title}
        workerCount={sorted.length}
        assessmentLabel={view.assessmentTitle ?? "Cumulative"}
        unfilledSlots={view.campaignGreySlots > 0 ? view.campaignGreySlots : undefined}
        onWorkerDrop={actions.handleWorkerDrop}
        dropDisabled={!canWrite}
        unitDragPayload={buildListOpen && canWrite && sorted.length > 0 ? { workerIds: sorted } : undefined}
        onUnitDragSessionStart={buildListOpen ? onBuildListWallDragStart : undefined}
        onUnitDragSessionEnd={buildListOpen ? onBuildListWallDragEnd : undefined}
        countAction={
          sorted.length > 0
            ? {
                onClick: () => actions.toggleSelectAll(null, sorted),
                label: allSelected ? `Deselect all in ${title}` : `Select all in ${title}`,
                pressed: allSelected,
              }
            : undefined
        }
        summary={
          allIds.length > 0 ? (
            <UnitSummaryMetrics
              metrics={view.metrics.unassignedMetrics}
              mode={view.displayMode}
              compact
              assessmentTitle={view.assessmentTitle}
              participationLabel={participationSourceLabel(view.participationSource)}
            />
          ) : null
        }
      >
        {sorted.length === 0 && (
          <p className="col-span-full text-xs text-muted-foreground">
            {allIds.length === 0
              ? `Everyone in ${group.name} is placed in a Unit.`
              : "No one here matches the current Filter."}
          </p>
        )}
        {sorted.map((wid) => (
          <WallChartTile key={`u-${wid}`} {...tileContext} workerId={wid} ouId={null} scopeKey={0} />
        ))}
      </CampaignUnitCard>
    </div>
  );
}
