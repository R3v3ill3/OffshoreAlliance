"use client";

import { CampaignUnitCard } from "../campaign-unit-card";
import { UnitSummaryMetrics } from "../unit-summary-metrics";
import { WallChartTile } from "../wall-chart-tile";
import { participationSourceLabel } from "../participation-selector";
import { NOT_IN_ANY_GROUP_CARD_KEY } from "./use-wall-chart-group-view";
import type { WallChartBandProps } from "./wall-chart-group-band";
import { NOT_IN_ANY_GROUP_LABEL } from "./group-selector";

/**
 * WP2.4 — the "Not in any group" view (wp2.4.md §3.8; plan 5.6 `:292`,
 * `?group=none`): one flat grid of the members who are Unassigned in every
 * Group, in one card. No drop target on screen; selection, Filter, Colour by
 * and Search apply; the selection bar's Move to unit… lists every Unit across
 * Groups. With zero Groups this is the whole membership (decision 4).
 */
export function NotInAnyGroupView({
  canWrite,
  shell,
  groupsState,
  structure,
  view,
  actions,
  tileContext,
}: WallChartBandProps) {
  const { buildListOpen, onBuildListWallDragStart, onBuildListWallDragEnd } = shell.buildListUrl;
  const { highlightedOuId } = shell.highlight;
  const sorted = view.visibleNotInAnyGroup;
  const allIds = structure.notInAnyGroupIds;
  const allSelected = sorted.length > 0 && sorted.every((id) => shell.selection.has(null, id));
  const noGroups = groupsState.groups.length === 0;

  return (
    <div className="space-y-4">
      {noGroups && (
        <p className="text-sm text-muted-foreground">
          This campaign has no groups yet. Add units in Setup to start placing people.
        </p>
      )}
      <div
        data-ou-id={NOT_IN_ANY_GROUP_CARD_KEY}
        className={
          highlightedOuId === NOT_IN_ANY_GROUP_CARD_KEY
            ? "rounded-lg ring-2 ring-primary ring-offset-2 transition-shadow duration-300"
            : "transition-shadow duration-300"
        }
      >
        <CampaignUnitCard
          ou={null}
          fallbackTitle={NOT_IN_ANY_GROUP_LABEL}
          workerCount={sorted.length}
          assessmentLabel={view.assessmentTitle ?? "Cumulative"}
          unitDragPayload={buildListOpen && canWrite && sorted.length > 0 ? { workerIds: sorted } : undefined}
          onUnitDragSessionStart={buildListOpen ? onBuildListWallDragStart : undefined}
          onUnitDragSessionEnd={buildListOpen ? onBuildListWallDragEnd : undefined}
          countAction={
            sorted.length > 0
              ? {
                  onClick: () => actions.toggleSelectAll(null, sorted),
                  label: allSelected ? `Deselect all in ${NOT_IN_ANY_GROUP_LABEL}` : `Select all in ${NOT_IN_ANY_GROUP_LABEL}`,
                  pressed: allSelected,
                }
              : undefined
          }
          summary={
            allIds.length > 0 ? (
              <UnitSummaryMetrics
                metrics={view.metrics.notInAnyGroupMetrics}
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
              {allIds.length === 0 ? "Everyone is in at least one Group." : "No one here matches the current Filter."}
            </p>
          )}
          {sorted.map((wid) => (
            <WallChartTile key={`n-${wid}`} {...tileContext} workerId={wid} ouId={null} scopeKey={0} />
          ))}
        </CampaignUnitCard>
      </div>
    </div>
  );
}
