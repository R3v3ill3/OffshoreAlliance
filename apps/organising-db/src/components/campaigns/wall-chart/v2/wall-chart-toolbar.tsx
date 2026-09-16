"use client";

import { useMemo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useFirstUseHint } from "@/lib/hints/use-first-use-hint";
import { AssessmentSelector } from "../assessment-selector";
import { ListBadgeSelector } from "../list-badge-selector";
import { ParticipationSelector } from "../participation-selector";
import { WallChartFilterBar } from "../wall-chart-filter-bar";
import { WallChartSelectionBar } from "../wall-chart-selection-bar";
import { WallChartSummaryHeader } from "../wall-chart-summary-header";
import { WallChartUnitManager } from "../wall-chart-unit-manager";
import { WorkerSearch } from "../worker-search";
import { ouDisplayName, type WallChartOU } from "../types";
import type { WallChartCoreData } from "../hooks/use-wall-chart-core-data";
import { FilterChips } from "./filter-chips";
import { GroupSelector } from "./group-selector";
import type { WallChartGroupsState } from "./use-wall-chart-groups";
import type { WallChartGroupView } from "./use-wall-chart-group-view";
import type { WallChartShellV2 } from "./use-wall-chart-shell-v2";
import type { WallChartViewV2 } from "./use-wall-chart-view-v2";

/**
 * WP2.4 — the v2 toolbar (wp2.4.md §3.5): the sticky sentinel and wrapper,
 * the selection bar (no Copy — CP-a; "Remove from <Group>"), and the reused
 * `WallChartSummaryHeader` whose `assessmentSelector` slot carries the one
 * row of view controls — Group, Show empty units, Colour by, Filter (Sort,
 * Participation and "In unit of another group" live inside it) and the
 * active-filter chips — and whose control row carries Badges, `%`/`#`,
 * Links, Search, Add worker, Import Workers and Units (the header fixes that
 * order). `compareSlot` is WP2.5's and is empty here.
 */
export function WallChartToolbar({
  campaignId,
  canWrite,
  summaryStickySentinelRef,
  summaryStickyWrapperRef,
  shell,
  core,
  groupsState,
  structure,
  view,
  onRemoveFromGroup,
  compareSlot,
}: {
  campaignId: string;
  canWrite: boolean;
  summaryStickySentinelRef: React.RefObject<HTMLDivElement | null>;
  summaryStickyWrapperRef: React.RefObject<HTMLDivElement | null>;
  shell: WallChartShellV2;
  core: WallChartCoreData;
  groupsState: WallChartGroupsState;
  structure: WallChartGroupView;
  view: WallChartViewV2;
  onRemoveFromGroup: () => void;
  /** Reserved for WP2.5 Compare; empty in WP2.4. */
  compareSlot?: ReactNode;
}) {
  const isStuck = shell.layout.isStuck;
  const { buildListOpen } = shell.buildListUrl;
  const { selection } = shell;
  const {
    setImportWizardOpen,
    setCreateUnitOpen,
    setDeleteTargetOu,
    setBulkMoveOpen,
    setLinkDialogOpen,
    setClearRatingsDialogOpen,
    setAddWorkerContextOu,
    setAddWorkerFormKey,
    setAddWorkerOpen,
  } = shell.dialogs;
  const group = groupsState.selectedGroup;
  const buildListController = structure.buildList.controller;
  const groupHint = useFirstUseHint("wall_chart_group_selector", { hasTiles: true, canWrite });

  /**
   * WP2.4c (wp2.4c.md §3.9): the Units manager lists the selected Group's
   * TREE — each root with its nested children under it — through the
   * manager's own parent → children rendering, which keys on `parent_ou_id`.
   * The rows are PROJECTED onto the tree: a root's link to its container (a
   * facet link, never nesting under NE-a) is dropped so the root is top-level,
   * and a nested child keeps its real parent. Nothing else about the manager
   * changes — it is not edited by this package (§7) — and reordering a root
   * still carries its children with it.
   */
  const managerOus = useMemo(() => {
    const rows: WallChartOU[] = [];
    for (const root of structure.rootUnits) {
      rows.push(root.parent_ou_id == null ? root : { ...root, parent_ou_id: null });
      for (const child of structure.childrenByRoot.get(root.ou_id) ?? []) rows.push(child);
    }
    return rows;
  }, [structure.rootUnits, structure.childrenByRoot]);

  const otherGroups = groupsState.groups.filter((g) => g.group_id !== groupsState.selection);
  const otherGroupUnitIds = view.filter.otherGroupUnitIds ?? new Set<number>();
  const toggleOtherGroupUnit = (ouId: number) => {
    const next = new Set(otherGroupUnitIds);
    if (next.has(ouId)) next.delete(ouId);
    else next.add(ouId);
    view.setFilter({ ...view.filter, otherGroupUnitIds: next });
  };

  return (
    <>
      <div ref={summaryStickySentinelRef} aria-hidden className="h-px -mb-px" />
      <div
        ref={summaryStickyWrapperRef}
        data-wall-chart-toolbar
        className={`sticky -top-6 z-20 bg-background -mx-2 px-2 pt-1 space-y-2 print:static print:bg-transparent print:p-0 ${
          isStuck ? "shadow-sm" : ""
        }`}
        style={{ overflowAnchor: "none" }}
      >
        <WallChartSelectionBar
          count={selection.size}
          canWrite={canWrite}
          onMove={() => setBulkMoveOpen(true)}
          onRemove={
            group && selection.refs().some((r) => r.ouId !== null) ? onRemoveFromGroup : undefined
          }
          removeLabel={group ? `Remove from ${group.name}` : undefined}
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
                    const created = await buildListController.createList.mutateAsync({ name: "Untitled list" });
                    listId = created.list_id;
                  }
                  await buildListController.addItems.mutateAsync({ listId, workerIds: ids });
                  selection.clear();
                }
              : undefined
          }
        />
        <WallChartSummaryHeader
          isStuck={isStuck}
          assessmentSelector={
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-end gap-3">
                <GroupSelector
                  groups={groupsState.primaryGroups}
                  value={groupsState.selection}
                  onChange={groupsState.setSelection}
                  hintVisible={groupHint.visible}
                  onHintDismiss={groupHint.dismiss}
                />
                <label className="flex items-center gap-2 pb-1.5 text-xs">
                  <Switch
                    checked={view.showEmptyUnits}
                    onCheckedChange={view.setShowEmptyUnits}
                    aria-label="Show empty units"
                    disabled={!group}
                  />
                  <span>Show empty units</span>
                  {group && view.emptyHiddenCount > 0 && (
                    <span className="text-muted-foreground">({view.emptyHiddenCount} empty hidden)</span>
                  )}
                </label>
                <AssessmentSelector
                  campaignId={campaignId}
                  value={view.colourBy}
                  onChange={view.setColourBy}
                  label="Colour by"
                  triggerAriaLabel="Colour by"
                />
                <div className="flex flex-col gap-1 pb-0.5">
                  {/* Decorative: the trigger below is already named "Filter" by its text (fix round 2, A4). */}
                  <span aria-hidden className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Filter
                  </span>
                  <WallChartFilterBar
                    compact
                    sortInPopover
                    state={view.filter}
                    onChange={view.setFilter}
                    membershipTypes={view.derivedOptions.membershipTypes}
                    occupations={view.derivedOptions.occupations}
                    dataFields={view.dataFields}
                    assessmentOptions={core.assessmentOptions.filterOptions}
                    extraSections={
                      <>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                            Participation
                          </p>
                          <ParticipationSelector
                            campaignId={campaignId}
                            value={view.participationSource}
                            onChange={(next) => view.setFilter({ ...view.filter, participation: next })}
                          />
                        </div>
                        {otherGroups.some((g) => (structure.unitsByGroup.get(g.group_id)?.length ?? 0) > 0) && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                              In unit of another group
                            </p>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {otherGroups.map((g) => {
                                const units = structure.unitsByGroup.get(g.group_id) ?? [];
                                if (units.length === 0) return null;
                                return (
                                  <div key={g.group_id} className="space-y-1">
                                    <p className="text-[10px] text-muted-foreground">{g.name}</p>
                                    {units.map((u) => (
                                      <Label key={u.ou_id} className="flex items-center gap-2 text-xs cursor-pointer">
                                        <Checkbox
                                          checked={otherGroupUnitIds.has(u.ou_id)}
                                          onCheckedChange={() => toggleOtherGroupUnit(u.ou_id)}
                                        />
                                        <span className="flex-1 truncate">{ouDisplayName(u)}</span>
                                      </Label>
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    }
                  />
                </div>
                {compareSlot}
              </div>
              <FilterChips state={view.filter} onChange={view.setFilter} />
              {view.colourBy.kind === "assessment" && !isStuck && (
                <p className="text-[11px] text-muted-foreground">
                  Tile colour shows each worker&apos;s rating for{" "}
                  <span className="font-medium text-foreground">{view.colourBy.title}</span>; click a rating to
                  change it.
                </p>
              )}
            </div>
          }
          campaignName={(structure.campaign as { name?: string | null } | undefined)?.name ?? null}
          metrics={view.metrics.campaignMetrics}
          mode={view.displayMode}
          onModeChange={view.setDisplayMode}
          participationLabel={undefined}
          listBadgeSelector={<ListBadgeSelector value={view.badges} onChange={view.setBadges} />}
          overlayToggle={
            <Button
              type="button"
              variant={view.overlayEnabled ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => view.setOverlayEnabled(!view.overlayEnabled)}
              aria-pressed={view.overlayEnabled}
              title={`${view.overlayEnabled ? "Hide" : "Show"} leader↔worker links`}
            >
              Links{view.overlayEnabled ? ` (${core.leaderLinks.length})` : ""}
            </Button>
          }
          rightSlot={
            <div className="flex items-center gap-2">
              <WorkerSearch
                items={structure.workerSearchItems}
                onSelect={structure.focusWorker}
                disabled={structure.workerSearchItems.length === 0}
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
              <WallChartUnitManager
                ous={managerOus}
                canWrite={canWrite}
                hiddenOuIds={structure.hiddenInGroupIds}
                onToggleHidden={structure.toggleHidden}
                onShowAllHidden={structure.showAllHidden}
                onReorder={(ids) => structure.reorderOus.mutate(ids)}
                onOpenCreateUnit={() => setCreateUnitOpen(true)}
                // The manager hands back its own projected row; the dialogs
                // need the real unit (its `parent_ou_id` drives the
                // reassignment rule), so it is looked up by id.
                onDeleteUnit={
                  canWrite ? (ou) => setDeleteTargetOu(structure.ouById.get(ou.ou_id) ?? ou) : undefined
                }
                serverSide
              />
            </div>
          }
        />
      </div>
    </>
  );
}
