import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Layers, MoreVertical, Trash2 } from "lucide-react";

import { CampaignUnitCard } from "./campaign-unit-card";
import { UnitCoverageBadge } from "../activists/unit-coverage-badge";
import { UnitRatingControl } from "./unit-rating-control";
import { UnitAssessmentViewControl } from "./assessment-selector";
import { UnitListBadgeControl } from "./list-badge-selector";
import { UnitSummaryMetrics } from "./unit-summary-metrics";
import { WallChartFilterBar } from "./wall-chart-filter-bar";
import { WallChartTile, type WallChartTileContext } from "./wall-chart-tile";
import { participationSourceLabel } from "./participation-selector";
import { applyFilters, applySort, factSortOpts } from "./filters";
import { computeMetrics } from "./metrics";
import { humanizeOuType, type WallChartOU } from "./types";
import {
  buildAssessmentMetricsInput,
  effectiveAssessmentForScope,
  scopeAssessmentFilterAndSort,
} from "./wall-chart-model";
import type { WallChartActions } from "./hooks/use-wall-chart-actions";
import type { WallChartCoreData } from "./hooks/use-wall-chart-core-data";
import type { WallChartShellState } from "./hooks/use-wall-chart-shell-state";
import type { WallChartStructure } from "./hooks/use-wall-chart-structure";
import type { WallChartViewMetrics } from "./hooks/use-wall-chart-view-metrics";

type WallChartHierarchyProps = {
  campaignId: string;
  canWrite: boolean;
  shell: WallChartShellState;
  core: WallChartCoreData;
  struct: WallChartStructure;
  view: WallChartViewMetrics;
  actions: WallChartActions;
  tileContext: WallChartTileContext;
};


/**
 * WP2.3 — the unit hierarchy, moved verbatim out of the band IIFE at
 * `campaign-wall-chart.tsx` `WC:1776–2394`: the `ou_type` bands, the roll-up of
 * sub-unit workers into a collapsed parent, and the top-level unit card with
 * its toolbar and `aria-label="Unit actions"` kebab. Contains filter → sort →
 * metrics pipeline #2 (`WC:1844–1871`) verbatim; the other two live in
 * `WallChartSubUnits` below. The pipelines stay separate by design (§1.4).
 */
export function WallChartUnitHierarchy(props: WallChartHierarchyProps): ReactNode {
  const { campaignId, canWrite, shell, core, struct, view, actions, tileContext } = props;
  const { buildListOpen, onBuildListWallDragStart, onBuildListWallDragEnd } = shell.buildListUrl;
  const { highlightedOuId } = shell.highlight;
  const unitVisibility = shell.visibility;
  const selection = shell.selection;
  const {
    setAddWorkerOpen,
    setAddWorkerFormKey,
    setAddWorkerContextOu,
    setSplitTargetOu,
    setDeleteTargetOu,
  } = shell.dialogs;
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
  const { coverageByOu, wocRepByUnit } = core.coverage;
  const { visibleOus } = struct;
  const {
    workerById,
    ratingByWorker,
    compareWorkerIds,
    workersByOu,
    childrenByParent,
    unitsByWorker,
    visibleWorkersForOu,
  } = struct.index;
  const { getFilter, setFilter, applyToAllScopes } = view.filters;
  const derivedOptions = view.derivedOptions;
  const displayMode = view.displayMode.mode;
  const participationSource = view.participation.source;
  const participationPredicate = view.participation.predicate;
  const { metricsByOu } = view.metrics;
  const hierarchyViewByParent = view.hierarchy.viewByParent;
  const { setHierarchyViewForParent } = view.hierarchy;
  const { handleWorkerDrop } = actions;

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
                  const childList = childrenByParent.get(ou.ou_id) ?? [];
                  const hasSubUnits = childList.length > 0;
                  const showSubUnitCards =
                    hasSubUnits &&
                    (hierarchyViewByParent.get(ou.ou_id) ??
                      (ou.is_group_container ? "subunit" : "unit")) === "subunit";
                  // When showing sub-unit cards, only render visible children.
                  // Hidden children still count toward roll-up metrics (childList
                  // is unchanged) but their cards are omitted to respect the
                  // unit-visibility setting.
                  const visibleChildList = showSubUnitCards
                    ? childList.filter((c) => !unitVisibility.hiddenOuIds.has(c.ou_id))
                    : childList;
                  const rollupSourceOuByWorker = new Map<number, number>();
                  const rolledUpWorkerIds: number[] = [];
                  const addRollupWorker = (workerId: number, sourceOuId: number) => {
                    if (rollupSourceOuByWorker.has(workerId)) return;
                    rollupSourceOuByWorker.set(workerId, sourceOuId);
                    rolledUpWorkerIds.push(workerId);
                  };
                  if (hasSubUnits && !showSubUnitCards) {
                    for (const wid of visibleWorkersForOu(ou.ou_id)) {
                      addRollupWorker(wid, ou.ou_id);
                    }
                    for (const child of childList) {
                      for (const wid of workersByOu.get(child.ou_id) ?? []) {
                        addRollupWorker(wid, child.ou_id);
                      }
                    }
                    rolledUpWorkerIds.sort(compareWorkerIds);
                  }
                  const ids =
                    hasSubUnits && !showSubUnitCards
                      ? rolledUpWorkerIds
                      : visibleWorkersForOu(ou.ou_id);
                  const sourceOuForWorker = (workerId: number) =>
                    hasSubUnits && !showSubUnitCards
                      ? rollupSourceOuByWorker.get(workerId) ?? ou.ou_id
                      : ou.ou_id;
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
                  const placeholders = Math.max(0, est - ids.length);
                  const effScope = effectiveAssessmentForScope(
                    ou.ou_id,
                    campaignAssessmentDefault,
                    unitAssessmentOverride
                  );
                  const unitMetrics =
                    hasSubUnits && !showSubUnitCards
                      ? computeMetrics(
                          ids,
                          workerById,
                          ratingByWorker,
                          participationPredicate,
                          buildAssessmentMetricsInput(effScope, activityRatingsByActivityId),
                          {
                            multiUnitWorkerIds: new Set(
                              ids.filter((id) => (unitsByWorker.get(id)?.length ?? 0) > 1)
                            ),
                          }
                        )
                      : metricsByOu.get(ou.ou_id);
                  // Group-level roll-up summary for an employer group: aggregate the
                  // container's own + every sub-unit's workers so the group card shows
                  // the same summary metrics (as a dropdown) that sub-units already do.
                  const groupRollupIds = hasSubUnits
                    ? (() => {
                        const seen = new Set<number>();
                        const out: number[] = [];
                        const add = (wid: number) => {
                          if (seen.has(wid)) return;
                          seen.add(wid);
                          out.push(wid);
                        };
                        for (const wid of workersByOu.get(ou.ou_id) ?? []) add(wid);
                        for (const child of childList)
                          for (const wid of workersByOu.get(child.ou_id) ?? []) add(wid);
                        return out;
                      })()
                    : [];
                  const groupMetrics = hasSubUnits
                    ? computeMetrics(
                        groupRollupIds,
                        workerById,
                        ratingByWorker,
                        participationPredicate,
                        buildAssessmentMetricsInput(effScope, activityRatingsByActivityId),
                        {
                          multiUnitWorkerIds: new Set(
                            groupRollupIds.filter((id) => (unitsByWorker.get(id)?.length ?? 0) > 1)
                          ),
                        }
                      )
                    : null;
                  const allInUnitSelected =
                    sorted.length > 0 &&
                    sorted.every((wid) => selection.has(sourceOuForWorker(wid), wid));
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
                      onUnitDragSessionStart={
                        buildListOpen ? onBuildListWallDragStart : undefined
                      }
                      onUnitDragSessionEnd={
                        buildListOpen ? onBuildListWallDragEnd : undefined
                      }
                      headerBadges={
                        <>
                          {hasSubUnits && (
                            <Badge variant="secondary" className="text-[10px] gap-1">
                              <Layers className="h-3 w-3" />
                              {childList.length} sub-unit
                              {childList.length === 1 ? "" : "s"}
                              {visibleChildList.length < childList.length && (
                                <span className="text-muted-foreground">
                                  {" "}({visibleChildList.length} visible)
                                </span>
                              )}
                            </Badge>
                          )}
                          <UnitCoverageBadge
                            coverage={coverageByOu.get(ou.ou_id) ?? null}
                            wocState={wocRepByUnit.get(ou.ou_id) ?? null}
                          />
                        </>
                      }
                      ratingControl={
                        <UnitRatingControl
                          ouId={ou.ou_id}
                          rating={ou.user_rating}
                          childRatings={childList.map((c) => c.user_rating)}
                          isContainer={!!ou.is_group_container}
                          canWrite={canWrite}
                          campaignId={campaignId}
                        />
                      }
                      summaryCollapsible={hasSubUnits}
                      summary={
                        hasSubUnits ? (
                          groupMetrics && groupRollupIds.length > 0 ? (
                            <UnitSummaryMetrics
                              metrics={groupMetrics}
                              mode={displayMode}
                              compact
                              assessmentTitle={scopeAssessmentTitle}
                              participationLabel={participationSourceLabel(participationSource)}
                            />
                          ) : null
                        ) : unitMetrics && ids.length > 0 ? (
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
                          <UnitListBadgeControl
                            campaignDefault={campaignBadgeDefault}
                            override={unitBadgeOverride.get(ou.ou_id)}
                            onChangeOverride={(next) => {
                              setUnitBadgeOverride((prev) => {
                                const copy = new Map(prev);
                                if (next === undefined) copy.delete(ou.ou_id);
                                else copy.set(ou.ou_id, next);
                                return copy;
                              });
                            }}
                          />
                          {hasSubUnits && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs print:hidden"
                              onClick={() =>
                                setHierarchyViewForParent(
                                  ou.ou_id,
                                  showSubUnitCards ? "unit" : "subunit"
                                )
                              }
                              aria-pressed={showSubUnitCards}
                              title={
                                showSubUnitCards
                                  ? "Collapse into single unit view"
                                  : "Show vessel units separately"
                              }
                            >
                              {showSubUnitCards ? "Unit view" : "Show sub-units"}
                            </Button>
                          )}
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
                                    sorted.map((wid) => ({
                                      ouId: sourceOuForWorker(wid),
                                      workerId: wid,
                                    }))
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
                            dataFields={dataFields}
                            assessmentOptions={assessmentFilterOptions}
                            onApplyToAll={() => applyToAllScopes(filter)}
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
                        showSubUnitCards ? (
                          <WallChartSubUnits
                            parentOu={ou}
                            visibleChildList={visibleChildList}
                            campaignId={campaignId}
                            canWrite={canWrite}
                            shell={shell}
                            core={core}
                            struct={struct}
                            view={view}
                            actions={actions}
                            tileContext={tileContext}
                          />
                        ) : null
                      }
                    >
                      {sorted.map((wid) => (
                        <WallChartTile
                          key={`${sourceOuForWorker(wid) ?? "u"}-${wid}`}
                          {...tileContext}
                          workerId={wid}
                          ouId={sourceOuForWorker(wid)}
                          scopeKey={ou.ou_id}
                        />
                      ))}
                    </CampaignUnitCard>
                    </div>
                  );
                })}
              </div>
            );
          });
}

/**
 * WP2.3 — the nested sub-unit cards, moved verbatim out of the top-level
 * card's `subUnits` prop (`WC:2154–2383`). Holds filter → sort → metrics
 * pipeline #3 for the child cards (`WC:2159–2198`) and pipeline #4 for the
 * depth-2 grandchild cards (`WC:2310–2323`), which keep their hard-coded
 * `assessmentLabel="Cumulative"` (a documented divergence, §1.4).
 *
 * Drops on a nested card still bubble to the parent card's drop target. That is
 * current behaviour and is preserved, not fixed, here.
 */
export function WallChartSubUnits(
  props: WallChartHierarchyProps & { parentOu: WallChartOU; visibleChildList: WallChartOU[] }
) {
  const { campaignId, canWrite, shell, core, struct, view, actions, tileContext } = props;
  const { parentOu: ou, visibleChildList } = props;
  const { buildListOpen, onBuildListWallDragStart, onBuildListWallDragEnd } = shell.buildListUrl;
  const { highlightedOuId } = shell.highlight;
  const unitVisibility = shell.visibility;
  const {
    setAddWorkerOpen,
    setAddWorkerFormKey,
    setAddWorkerContextOu,
    setSplitTargetOu,
    setDeleteTargetOu,
  } = shell.dialogs;
  const { campaignAssessmentDefault, unitAssessmentOverride } = core.scopeState;
  const activityRatingsByActivityId = core.activityRatings;
  const assessmentFilterLookup = core.activityRatingLookup;
  const factsByWorker = core.facts.factsByWorker;
  const allLinks = core.leaderLinks;
  const { coverageByOu, wocRepByUnit } = core.coverage;
  const { workerById, ratingByWorker, workersByOu, childrenByParent } = struct.index;
  const { getFilter } = view.filters;
  const displayMode = view.displayMode.mode;
  const participationSource = view.participation.source;
  const { metricsByOu } = view.metrics;
  const { handleWorkerDrop } = actions;

  // Same body and same laziness as the JSX IIFE it replaces (§3.3 bans IIFEs
  // in JSX); only the call site moved.
  const renderGrandchildren = (child: WallChartOU) => {
                                      // Render depth-2 sub-units (grandchildren) when
                                      // the Phase-2 three-level model is in use.
                                      const grandchildren = (childrenByParent.get(child.ou_id) ?? []).filter(
                                        (gc) => !unitVisibility.hiddenOuIds.has(gc.ou_id)
                                      );
                                      if (grandchildren.length === 0) return null;
                                      return (
                                        <div className="space-y-2">
                                          {grandchildren.map((gc) => {
                                            const gcIds = workersByOu.get(gc.ou_id) ?? [];
                                            const gcFilter = getFilter(gc.ou_id);
                                            const gcFa = scopeAssessmentFilterAndSort(
                                              gc.ou_id,
                                              campaignAssessmentDefault,
                                              unitAssessmentOverride,
                                              activityRatingsByActivityId
                                            );
                                            const gcFiltered = applyFilters(gcIds, workerById, ratingByWorker, gcFilter, gcFa.activityRatings, gcFa.ratingCtx, factsByWorker, assessmentFilterLookup);
                                            const gcSorted = applySort(gcFiltered, workerById, ratingByWorker, gcFilter.sort, {
                                              ...(gcFa.sortAssessment ? { assessmentSort: gcFa.sortAssessment } : {}),
                                              relationshipLinks: allLinks,
                                              ...factSortOpts(gcFilter, factsByWorker),
                                            });
                                            return (
                                              <div
                                                key={gc.ou_id}
                                                data-ou-id={gc.ou_id}
                                                className={
                                                  highlightedOuId === gc.ou_id
                                                    ? "rounded-lg ring-2 ring-primary ring-offset-2 transition-shadow duration-300"
                                                    : "transition-shadow duration-300"
                                                }
                                              >
                                                <CampaignUnitCard
                                                  ou={gc}
                                                  workerCount={gcSorted.length}
                                                  estimate={gc.total_workers_estimated ?? 0}
                                                  placeholders={0}
                                                  assessmentLabel="Cumulative"
                                                  onWorkerDrop={handleWorkerDrop}
                                                  dropDisabled={!canWrite}
                                                  nested
                                                  contentCollapsible
                                                  headerBadges={
                                                    <UnitCoverageBadge
                                                      coverage={coverageByOu.get(gc.ou_id) ?? null}
                                                      wocState={wocRepByUnit.get(gc.ou_id) ?? null}
                                                    />
                                                  }
                                                  ratingControl={
                                                    <UnitRatingControl
                                                      ouId={gc.ou_id}
                                                      rating={gc.user_rating}
                                                      canWrite={canWrite}
                                                      campaignId={campaignId}
                                                    />
                                                  }
                                                  toolbar={
                                                    canWrite ? (
                                                      <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs print:hidden"
                                                        onClick={() => { setAddWorkerContextOu(gc); setAddWorkerFormKey((k) => k + 1); setAddWorkerOpen(true); }}
                                                        title="Add worker to this sub-unit"
                                                      >Add worker</Button>
                                                    ) : null
                                                  }
                                                >
                                                  {gcSorted.map((wid) => (
                                                    <WallChartTile
                                                      key={`${gc.ou_id}-${wid}`}
                                                      {...tileContext}
                                                      workerId={wid}
                                                      ouId={gc.ou_id}
                                                      scopeKey={gc.ou_id}
                                                    />
                                                  ))}
                                                </CampaignUnitCard>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      );
  };

  return (
                          <div className="space-y-3">
                            {visibleChildList.map((child) => {
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
                                childFa.ratingCtx,
                                factsByWorker,
                                assessmentFilterLookup
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
                                  ...factSortOpts(childFilter, factsByWorker),
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
                                <div
                                  key={child.ou_id}
                                  data-ou-id={child.ou_id}
                                  className={
                                    highlightedOuId === child.ou_id
                                      ? "rounded-lg ring-2 ring-primary ring-offset-2 transition-shadow duration-300"
                                      : "transition-shadow duration-300"
                                  }
                                >
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
                                    onUnitDragSessionStart={
                                      buildListOpen ? onBuildListWallDragStart : undefined
                                    }
                                    onUnitDragSessionEnd={
                                      buildListOpen ? onBuildListWallDragEnd : undefined
                                    }
                                    nested
                                    contentCollapsible={!!ou.is_group_container}
                                    contentInitiallyExpanded={!ou.is_group_container}
                                    headerBadges={
                                      <UnitCoverageBadge
                                        coverage={coverageByOu.get(child.ou_id) ?? null}
                                        wocState={wocRepByUnit.get(child.ou_id) ?? null}
                                      />
                                    }
                                    ratingControl={
                                      <UnitRatingControl
                                        ouId={child.ou_id}
                                        rating={child.user_rating}
                                        canWrite={canWrite}
                                        campaignId={campaignId}
                                      />
                                    }
                                    summaryCollapsible
                                    hideHeaderDetailsWhenSummaryCollapsed
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
                                        <div className="flex items-center gap-1">
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
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <Button type="button" size="icon" variant="ghost" className="h-7 w-7 print:hidden" aria-label="Unit actions">
                                                <MoreVertical className="h-4 w-4" />
                                              </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48">
                                              <DropdownMenuItem
                                                onClick={() => setSplitTargetOu(child)}
                                                disabled={(workersByOu.get(child.ou_id) ?? []).length === 0}
                                              >
                                                <Layers className="h-4 w-4 mr-2" /> Split into sub-units
                                              </DropdownMenuItem>
                                              <DropdownMenuSeparator />
                                              <DropdownMenuItem
                                                className="text-destructive focus:text-destructive"
                                                onClick={() => setDeleteTargetOu(child)}
                                              >
                                                <Trash2 className="h-4 w-4 mr-2" /> Delete unit
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        </div>
                                      ) : null
                                    }
                                    subUnits={renderGrandchildren(child)}
                                  >
                                    {childSorted.map((wid) => (
                                      <WallChartTile
                                        key={`${child.ou_id}-${wid}`}
                                        {...tileContext}
                                        workerId={wid}
                                        ouId={child.ou_id}
                                        scopeKey={child.ou_id}
                                      />
                                    ))}
                                  </CampaignUnitCard>
                                </div>
                              );
                            })}
                          </div>
  );
}
