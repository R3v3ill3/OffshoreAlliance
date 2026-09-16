"use client";

import { Badge } from "@/components/ui/badge";
import { CampaignUnitCard } from "../campaign-unit-card";
import { UnitCoverageBadge } from "../../activists/unit-coverage-badge";
import { UnitRatingControl } from "../unit-rating-control";
import { UnitSummaryMetrics } from "../unit-summary-metrics";
import { WallChartTile, type WallChartTileContext } from "../wall-chart-tile";
import { participationSourceLabel } from "../participation-selector";
import { nestingParentOf } from "@/lib/campaign/groups/derive-group-tree";
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
 * WP2.4 — the band: the selected Group's units as one row of cards, then its
 * Unassigned card last (wp2.4.md §3.4, §3.7; plan 5.6 `:291`). No `ou_type`
 * bands: every card is a Unit of the one Group and every card's list comes
 * from the one pipeline.
 *
 * WP2.4c (wp2.4c.md §3.6, B1/B5) — nesting within the Group: the cards are
 * the Group's ROOTS (then the flat foreign-nested cards, then Unassigned). A
 * root that has nested children renders them inside its own card through
 * `CampaignUnitCard`'s `subUnits` slot, captioned "Units in <Root>"; the
 * root's own area holds the members in none of its children, its header
 * carries the roll-up over the whole subtree, and a "N sub-units" badge says
 * how many there are. Nested cards are always expanded (XP-a): there is no
 * per-parent "Unit view / Show sub-units" and no header "Expand all".
 */
export function WallChartGroupBand(props: WallChartBandProps) {
  const { groupsState, structure, view } = props;
  const group = groupsState.selectedGroup;
  if (!group) return null;

  const { renderedUnits, renderedChildrenByRoot, emptyHiddenCount } = view;
  const { groupUnits, hiddenInGroupCount, rootUnits } = structure;

  return (
    <div className="space-y-4">
      {groupUnits.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {group.name} has no Units yet. Use Units above to add one; until then everyone in the campaign is
          Unassigned in {group.name}.
        </p>
      ) : renderedUnits.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {hiddenInGroupCount === rootUnits.length
            ? `Every Unit of ${group.name} is hidden. Open Units and tick the Units you want to see.`
            : `Every Unit of ${group.name} is empty after filtering. Turn on Show empty units to see them.`}
        </p>
      ) : (
        renderedUnits.map((ou) => (
          <UnitCardV2 key={ou.ou_id} ou={ou} childUnits={renderedChildrenByRoot.get(ou.ou_id) ?? []} {...props} />
        ))
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

/** Under NE-a the deepest rendered tree is two levels, so a nested card never nests. */
const NO_CHILDREN: WallChartOU[] = [];

/**
 * One Unit card: `CampaignUnitCard` reused with the campaign-wide labels, the
 * coverage / WOC badges, the rating control, the summary metrics, a toolbar
 * that holds ONLY the ⋯ menu, and "Select all" as a click on the count
 * (§3.6). The tiles are the unchanged `WallChartTile` under the group-scoped
 * context.
 *
 * The same component draws a root and a nested child (wp2.4c.md §3.6): a
 * child passes `nested`, offers no Split… (SP-a) and merges only with its
 * siblings in the same Group under the same root (§3.8).
 */
export function UnitCardV2({
  ou,
  childUnits,
  nested,
  campaignId,
  canWrite,
  shell,
  core,
  groupsState,
  structure,
  view,
  actions,
  tileContext,
  onMenuAction,
}: WallChartBandProps & {
  ou: WallChartOU;
  /** The nested cards to render inside this one (empty on a child or a childless root). */
  childUnits: WallChartOU[];
  /** True when this card is itself nested inside its parent's card. */
  nested?: boolean;
}) {
  const { buildListOpen, onBuildListWallDragStart, onBuildListWallDragEnd } = shell.buildListUrl;
  const { highlightedOuId } = shell.highlight;
  const { coverageByOu, wocRepByUnit } = core.coverage;
  const sorted = view.visibleByUnit.get(ou.ou_id) ?? [];
  /** The members this card ROLLS UP: a root's whole subtree, any other card's own tiles (B5). */
  const allIds = structure.rollupByUnit.get(ou.ou_id) ?? [];
  const ownIds = structure.workersByUnit.get(ou.ou_id) ?? [];
  const unitMetrics = view.metrics.metricsByUnit.get(ou.ou_id);
  const est = ou.total_workers_estimated ?? 0;
  const placeholders = Math.max(0, est - allIds.length);
  const allSelected = sorted.length > 0 && sorted.every((id) => shell.selection.has(ou.ou_id, id));
  /**
   * §3.6 / §3.13: a flat "foreign-nested" card — a unit of this Group nested
   * under a unit of ANOTHER group — is titled "<Parent> › <Unit>", so two
   * shifts called "Day" under two worksites are told apart. A root has no
   * nesting parent (so this is `ouDisplayName`), and a nested card is titled
   * by its own name with the root named in the "Units in <Root>" caption
   * above it (review A-2, fix round 1).
   */
  const title = nested ? ouDisplayName(ou) : structure.cardTitle(ou);
  /**
   * SP-a (§3.8): Split… is offered only on a card with NO nesting parent. On a
   * nested card and on a flat foreign-nested card alike it would ask for a
   * grandchild under a plain parent, which the depth trigger always refuses
   * (review A-3, fix round 1).
   */
  const canSplit = !nested && nestingParentOf(ou, structure.ouById) == null;
  /** Every child of this root, hidden ones included: the roll-up and the badge count them (§3.6). */
  const subUnitCount = nested ? 0 : (structure.childrenByRoot.get(ou.ou_id) ?? []).length;
  const hasSubUnits = subUnitCount > 0;
  /**
   * The roll-up sentence (§3.13). It reads the DERIVED lists, not the
   * filtered ones, so a sub-unit emptied by the Filter (or hidden) is still
   * counted in the parent's total — which is what a roll-up means (§4.6
   * step 8), and what the placeholders and the summary metrics beside it
   * already do.
   */
  const countLabel = hasSubUnits
    ? `${allIds.length} in unit · ${ownIds.length} not yet in a sub-unit`
    : undefined;
  /**
   * The count button selects this card's OWN visible tiles, never a nested
   * card's, so on a root with children its accessible name says so before it
   * carries §3.12's two numbers (review A-5, fix round 1): the numbers are the
   * derived roll-up (D15) and would otherwise read as the size of the
   * selection the click makes.
   */
  const selectAllLabel = `${allSelected ? "Deselect" : "Select"} all in ${title}${
    hasSubUnits ? "'s own area" : ""
  }`;

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
        title={title}
        nested={nested}
        workerCount={sorted.length}
        countLabel={countLabel}
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
                // "Select all" acts on the card's OWN visible tiles (§3.6),
                // never on a nested card's.
                onClick: () => actions.toggleSelectAll(ou.ou_id, sorted),
                label: countLabel ? `${selectAllLabel} (${countLabel})` : selectAllLabel,
                pressed: allSelected,
              }
            : undefined
        }
        headerBadges={
          <>
            {hasSubUnits && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                {subUnitCount} {subUnitCount === 1 ? "sub-unit" : "sub-units"}
              </Badge>
            )}
            <UnitCoverageBadge
              coverage={coverageByOu.get(ou.ou_id) ?? null}
              wocState={wocRepByUnit.get(ou.ou_id) ?? null}
            />
          </>
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
            <UnitCardMenu
              ou={ou}
              canMerge={actions.mergeCandidatesFor(ou).length > 0}
              canSplit={canSplit}
              onAction={onMenuAction}
            />
          ) : undefined
        }
        subUnitsLabel={`Units in ${title}`}
        subUnits={
          childUnits.length > 0
            ? childUnits.map((child) => (
                <UnitCardV2
                  key={child.ou_id}
                  ou={child}
                  childUnits={NO_CHILDREN}
                  nested
                  campaignId={campaignId}
                  canWrite={canWrite}
                  shell={shell}
                  core={core}
                  groupsState={groupsState}
                  structure={structure}
                  view={view}
                  actions={actions}
                  tileContext={tileContext}
                  onMenuAction={onMenuAction}
                />
              ))
            : undefined
        }
      >
        {sorted.map((wid) => (
          <WallChartTile key={`${ou.ou_id}-${wid}`} {...tileContext} workerId={wid} ouId={ou.ou_id} scopeKey={ou.ou_id} />
        ))}
      </CampaignUnitCard>
    </div>
  );
}
