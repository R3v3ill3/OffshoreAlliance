import { Button } from "@/components/ui/button";

import { AssessmentSelector } from "./assessment-selector";
import { ListBadgeSelector } from "./list-badge-selector";
import { ParticipationSelector, participationSourceLabel } from "./participation-selector";
import { WallChartSelectionBar } from "./wall-chart-selection-bar";
import { WallChartSummaryHeader } from "./wall-chart-summary-header";
import { WallChartUnitManager } from "./wall-chart-unit-manager";
import { WorkerSearch } from "./worker-search";
import type { WallChartCoreData } from "./hooks/use-wall-chart-core-data";
import type { WallChartShellState } from "./hooks/use-wall-chart-shell-state";
import type { WallChartStructure } from "./hooks/use-wall-chart-structure";
import type { WallChartViewMetrics } from "./hooks/use-wall-chart-view-metrics";

/**
 * WP2.3 — the wall chart header, moved verbatim out of
 * `campaign-wall-chart.tsx` (`WC:1453–1617`): the sticky sentinel, the sticky
 * wrapper, `WallChartSelectionBar`, `WallChartSummaryHeader` and every header
 * control (assessment default, `%`/`#`, Links, worker search, badge selector,
 * participation, Import Workers, Units, Expand/Collapse all).
 *
 * The two sticky refs stay owned by the shell, which passes them in — the
 * nodes they attach to are rendered here but the shell also measures them.
 */
export function WallChartHeader({
  campaignId,
  canWrite,
  summaryStickySentinelRef,
  summaryStickyWrapperRef,
  shell,
  core,
  struct,
  view,
}: {
  campaignId: string;
  canWrite: boolean;
  summaryStickySentinelRef: React.RefObject<HTMLDivElement | null>;
  summaryStickyWrapperRef: React.RefObject<HTMLDivElement | null>;
  shell: WallChartShellState;
  core: WallChartCoreData;
  struct: WallChartStructure;
  view: WallChartViewMetrics;
}) {
  const isSummaryStuck = shell.layout.isStuck;
  const { buildListOpen } = shell.buildListUrl;
  const unitVisibility = shell.visibility;
  const selection = shell.selection;
  const {
    setImportWizardOpen,
    setCreateUnitOpen,
    setDeleteTargetOu,
    setBulkDialog,
    setLinkDialogOpen,
    setRemoveConfirmOpen,
    setClearRatingsDialogOpen,
  } = shell.dialogs;
  const overlayEnabled = shell.overlay.enabled;
  const toggleOverlay = shell.overlay.setEnabled;
  const {
    campaignAssessmentDefault,
    setCampaignAssessmentDefault,
    campaignBadgeDefault,
    setCampaignBadgeDefault,
  } = core.scopeState;
  const allLinks = core.leaderLinks;
  const { ous, campaign, reorderOus, workerSearchItems, focusWorker } = struct;
  const { childrenByParent } = struct.index;
  const buildListController = struct.buildList.controller;
  const displayMode = view.displayMode.mode;
  const setDisplayMode = view.displayMode.setMode;
  const { allParentsExpanded, setAllHierarchyViews } = view.hierarchy;
  const participationSource = view.participation.source;
  const setParticipationSource = view.participation.setSource;
  const campaignMetrics = view.metrics.campaignMetrics;
  const { setAddWorkerContextOu, setAddWorkerFormKey, setAddWorkerOpen } = shell.dialogs;

  return (
    <>
        {/* Sticky sentinel: when this 1px row scrolls out of view, the
            wrapper below has stuck to the top of the viewport. */}
        <div
          ref={summaryStickySentinelRef}
          aria-hidden
          className="h-px -mb-px"
        />
        <div
          ref={summaryStickyWrapperRef}
          className={`sticky -top-6 z-20 bg-background -mx-2 px-2 pt-1 space-y-2 print:static print:bg-transparent print:p-0 ${
            isSummaryStuck ? "shadow-sm" : ""
          }`}
          // Disable scroll anchoring on this branch so the layout shift
          // caused by collapsing the summary doesn't trigger the browser to
          // adjust scrollY, which made the page feel like it was jumping
          // back to the top of the assessment distribution section.
          style={{ overflowAnchor: "none" }}
        >
        <WallChartSelectionBar
          count={selection.size}
          canWrite={canWrite}
          onMove={() => setBulkDialog({ mode: "move" })}
          onCopy={() => setBulkDialog({ mode: "copy" })}
          onRemove={
            selection.refs().some((r) => r.ouId !== null)
              ? () => setRemoveConfirmOpen(true)
              : undefined
          }
          onClearRatings={() => setClearRatingsDialogOpen(true)}
          onLinkToLeader={() => setLinkDialogOpen(true)}
          onClear={() => selection.clear()}
          onAddToBuildList={
            buildListOpen
              ? async () => {
                  const ids = selection.workerIds();
                  if (ids.length === 0) return;
                  let listId = buildListController.activeListId;
                  if (listId == null) {
                    const created = await buildListController.createList.mutateAsync({
                      name: "Untitled list",
                    });
                    listId = created.list_id;
                  }
                  await buildListController.addItems.mutateAsync({
                    listId,
                    workerIds: ids,
                  });
                  selection.clear();
                }
              : undefined
          }
        />
        <WallChartSummaryHeader
          isStuck={isSummaryStuck}
          assessmentSelector={
            <>
              <AssessmentSelector
                campaignId={campaignId}
                value={campaignAssessmentDefault}
                onChange={setCampaignAssessmentDefault}
              />
              {campaignAssessmentDefault.kind === "assessment" && !isSummaryStuck && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Campaign default: tile colour shows each worker&apos;s rating for{" "}
                  <span className="font-medium text-foreground">
                    {campaignAssessmentDefault.title}
                  </span>
                  . Use each unit&apos;s View control to override. Click the rating on a
                  tile to change it; the small badge is cumulative.
                </p>
              )}
            </>
          }
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
          listBadgeSelector={
            <ListBadgeSelector
              value={campaignBadgeDefault}
              onChange={setCampaignBadgeDefault}
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
              <WorkerSearch
                items={workerSearchItems}
                onSelect={focusWorker}
                disabled={workerSearchItems.length === 0}
              />
              {canWrite && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs print:hidden"
                  onClick={() => {
                    setAddWorkerContextOu(null);
                    setAddWorkerFormKey((k) => k + 1);
                    setAddWorkerOpen(true);
                  }}
                >
                  Add worker
                </Button>
              )}
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
              {/* Build list, Add assessment, and Task management buttons live in
                  the persistent campaign header (CampaignDetailHeaderBar) so
                  they're visible on every campaign route. The Build list panel
                  itself is still mounted here and driven by the ?buildList=1 URL param. */}
              <WallChartUnitManager
                ous={ous}
                canWrite={canWrite}
                hiddenOuIds={unitVisibility.hiddenOuIds}
                onToggleHidden={unitVisibility.toggleOu}
                onShowAllHidden={unitVisibility.showAll}
                onReorder={(ids) => reorderOus.mutate(ids)}
                onOpenCreateUnit={() => setCreateUnitOpen(true)}
                onDeleteUnit={canWrite ? (ou) => setDeleteTargetOu(ou) : undefined}
              />
              {ous.some((o) => (childrenByParent.get(o.ou_id)?.length ?? 0) > 0) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs print:hidden"
                  onClick={() => setAllHierarchyViews(allParentsExpanded ? "unit" : "subunit")}
                  title={allParentsExpanded ? "Collapse all groups" : "Expand all groups"}
                >
                  {allParentsExpanded ? "Collapse all" : "Expand all"}
                </Button>
              )}            </div>
          }
        />
        </div>
    </>
  );
}
