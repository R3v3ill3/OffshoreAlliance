import { CampaignUnitCard } from "./campaign-unit-card";
import { UnitAssessmentViewControl } from "./assessment-selector";
import { UnitListBadgeControl } from "./list-badge-selector";
import { UnitSummaryMetrics } from "./unit-summary-metrics";
import { WallChartFilterBar } from "./wall-chart-filter-bar";
import { WallChartTile, type WallChartTileContext } from "./wall-chart-tile";
import { participationSourceLabel } from "./participation-selector";
import { applyFilters, applySort, factSortOpts } from "./filters";
import {
  UNASSIGNED_KEY,
  effectiveAssessmentForScope,
  scopeAssessmentFilterAndSort,
} from "./wall-chart-model";
import type { WallChartActions } from "./hooks/use-wall-chart-actions";
import type { WallChartCoreData } from "./hooks/use-wall-chart-core-data";
import type { WallChartShellState } from "./hooks/use-wall-chart-shell-state";
import type { WallChartStructure } from "./hooks/use-wall-chart-structure";
import type { WallChartViewMetrics } from "./hooks/use-wall-chart-view-metrics";

/**
 * WP2.3 — the Unassigned workers card, moved verbatim out of the IIFE at
 * `campaign-wall-chart.tsx` `WC:1649–1765`, including filter → sort → metrics
 * pipeline #1 (`WC:1650–1686`), which stays here unconsolidated by design
 * (§1.4). The shell still owns the `unassignedWorkerIds.length > 0` gate, so
 * this component is only mounted when there is something to show.
 */
export function WallChartUnassignedCard({
  campaignId,
  canWrite,
  shell,
  core,
  struct,
  view,
  actions,
  tileContext,
}: {
  campaignId: string;
  canWrite: boolean;
  shell: WallChartShellState;
  core: WallChartCoreData;
  struct: WallChartStructure;
  view: WallChartViewMetrics;
  actions: WallChartActions;
  tileContext: WallChartTileContext;
}) {
  const { buildListOpen, onBuildListWallDragStart, onBuildListWallDragEnd } = shell.buildListUrl;
  const { highlightedOuId } = shell.highlight;
  const {
    campaignAssessmentDefault,
    unitAssessmentOverride,
    setUnitAssessmentOverride,
    campaignBadgeDefault,
    unitBadgeOverride,
    setUnitBadgeOverride,
  } = core.scopeState;
  const activityRatingsByActivityId = core.activityRatings;
  const assessmentFilterLookup = core.activityRatingLookup;
  const assessmentFilterOptions = core.assessmentOptions.filterOptions;
  const dataFields = core.dataFields;
  const factsByWorker = core.facts.factsByWorker;
  const allLinks = core.leaderLinks;
  const { workerById, ratingByWorker, unassignedWorkerIds } = struct.index;
  const { getFilter, setFilter, applyToAllScopes } = view.filters;
  const derivedOptions = view.derivedOptions;
  const displayMode = view.displayMode.mode;
  const participationSource = view.participation.source;
  const campaignGreySlots = view.campaignGreySlots;
  const unassignedMetrics = view.metrics.unassignedMetrics;
  const { handleWorkerDrop } = actions;

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
            fa.ratingCtx,
            factsByWorker,
            assessmentFilterLookup
          );
          const sorted = applySort(
            filtered,
            workerById,
            ratingByWorker,
            filter.sort,
            {
              ...(fa.sortAssessment ? { assessmentSort: fa.sortAssessment } : {}),
              relationshipLinks: allLinks,
              ...factSortOpts(filter, factsByWorker),
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
            <div
              data-ou-id="unassigned"
              className={
                highlightedOuId === "unassigned"
                  ? "rounded-lg ring-2 ring-primary ring-offset-2 transition-shadow duration-300"
                  : "transition-shadow duration-300"
              }
            >
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
              onUnitDragSessionStart={
                buildListOpen ? onBuildListWallDragStart : undefined
              }
              onUnitDragSessionEnd={buildListOpen ? onBuildListWallDragEnd : undefined}
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
                  <UnitListBadgeControl
                    campaignDefault={campaignBadgeDefault}
                    override={unitBadgeOverride.get(UNASSIGNED_KEY)}
                    onChangeOverride={(next) => {
                      setUnitBadgeOverride((prev) => {
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
                    dataFields={dataFields}
                    assessmentOptions={assessmentFilterOptions}
                    onApplyToAll={() => applyToAllScopes(filter)}
                  />
                </div>
              }
            >
              {sorted.map((wid) => (
                      <WallChartTile
                        key={`u-${wid}`}
                        {...tileContext}
                        workerId={wid}
                        ouId={null}
                        scopeKey={UNASSIGNED_KEY}
                      />
                    ))}
            </CampaignUnitCard>
            </div>
          );
}
