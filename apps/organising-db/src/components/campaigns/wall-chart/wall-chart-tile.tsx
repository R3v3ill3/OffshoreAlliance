import { WorkerTile } from "./worker-tile";
import { effectiveBadgesForScope } from "./list-badge-selector";
import { effectiveAssessmentForScope } from "./wall-chart-model";
import type { ActivityRating } from "./types";
import type { Interaction } from "@/lib/analytics/events";
import type { WallChartCoreData } from "./hooks/use-wall-chart-core-data";
import type { WallChartShellState } from "./hooks/use-wall-chart-shell-state";
import type { WallChartStructure } from "./hooks/use-wall-chart-structure";

/**
 * WP2.3 block E — the wall chart's worker tile, moved verbatim out of the
 * `renderTile` callback in `campaign-wall-chart.tsx` (`WC:1117–1242`).
 *
 * Deliberately hook-free (§3.3): every value `renderTile` read from its
 * closure is now an explicit prop, so the tile renders exactly the same
 * `WorkerTile` with exactly the same props, hint wiring, selection semantics
 * and drag payloads. The shell assembles `WallChartTileContext` once and
 * spreads it at each call site.
 */
export type WallChartTileContext = {
  campaignId: string;
  canWrite: boolean;
  index: Pick<
    WallChartStructure["index"],
    "workerById" | "unitsByWorker" | "ouNameById" | "ouTypeById" | "ratingByWorker"
  >;
  scopeState: Pick<
    WallChartCoreData["scopeState"],
    "campaignAssessmentDefault" | "unitAssessmentOverride" | "campaignBadgeDefault" | "unitBadgeOverride"
  >;
  activityRatingsByActivityId: WallChartCoreData["activityRatings"];
  listActivityByWorker: WallChartCoreData["listActivityByWorker"];
  selection: WallChartShellState["selection"];
  workerDetail: WallChartShellState["env"]["workerDetail"];
  setTileUnitDialog: WallChartShellState["dialogs"]["setTileUnitDialog"];
  buildListOpen: boolean;
  buildListWorkerIds: WallChartStructure["buildList"]["workerIds"];
  onBuildListWallDragStart: () => void;
  onBuildListWallDragEnd: () => void;
  noteFirstInteraction: (interaction: Interaction) => void;
  hint: WallChartStructure["hint"];
};

export function WallChartTile({
  workerId,
  ouId,
  scopeKey,
  campaignId,
  canWrite,
  index,
  scopeState,
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
  hint,
}: WallChartTileContext & {
  workerId: number;
  ouId: number | null;
  scopeKey: number;
}) {
  const { workerById, unitsByWorker, ouNameById, ouTypeById, ratingByWorker } = index;
  const {
    campaignAssessmentDefault,
    unitAssessmentOverride,
    campaignBadgeDefault,
    unitBadgeOverride,
  } = scopeState;
  const { ratingHintAnchor, ratingHint } = hint;

  const worker = workerById.get(workerId);
  if (!worker) return null;
  const otherUnitIds = (unitsByWorker.get(workerId) ?? []).filter((id) => id !== ouId);
  const otherUnitNames = otherUnitIds
    .map((id) => ouNameById.get(id))
    .filter((n): n is string => Boolean(n));
  const inMultipleUnits = (unitsByWorker.get(workerId) ?? []).length > 1;
  const effective = effectiveAssessmentForScope(
    scopeKey,
    campaignAssessmentDefault,
    unitAssessmentOverride
  );
  const rMap =
    effective.kind === "assessment"
      ? activityRatingsByActivityId.get(effective.activityId) ?? new Map()
      : new Map<number, ActivityRating>();
  const activityRating =
    effective.kind === "assessment" ? rMap.get(workerId) ?? null : null;
  const enabledListBadges = effectiveBadgesForScope(
    unitBadgeOverride.get(scopeKey),
    campaignBadgeDefault
  );
  return (
    <WorkerTile
      key={`${ouId ?? "u"}-${workerId}`}
      worker={worker}
      rating={ratingByWorker.get(workerId)}
      ouId={ouId}
      inMultipleUnits={inMultipleUnits}
      otherUnitNames={otherUnitNames}
      canWrite={canWrite}
      selection={effective}
      campaignId={campaignId}
      activityRating={activityRating}
      // Both ids: a worker in several units renders as several tiles, and
      // the hint must appear on exactly one of them. The anchor flag is
      // independent of visibility so the badge wrapper stays mounted across
      // the dismissal (fix round 1, finding 1).
      ratingHintAnchor={
        ratingHintAnchor?.workerId === workerId && ratingHintAnchor.ouId === ouId
      }
      showRatingHint={
        ratingHint.visible &&
        ratingHintAnchor?.workerId === workerId &&
        ratingHintAnchor.ouId === ouId
      }
      onRatingHintDismiss={ratingHint.dismiss}
      enabledListBadges={enabledListBadges}
      listActivityRows={listActivityByWorker.get(workerId)}
      isSelected={selection.has(ouId, workerId)}
      onClick={(id, tileOuId, kind) => {
        // Leading statement, before any branch, so a modifier-click counts
        // too. Never alters this handler's control flow or return value.
        noteFirstInteraction("tile_click");
        if (kind === "toggle-select") {
          selection.toggle(tileOuId, id);
          return;
        }
        if (selection.size > 0) selection.clear();
        workerDetail?.openWorkerDetail(id);
      }}
      onContactBadgeClick={(id, field) => {
        if (selection.size > 0) selection.clear();
        workerDetail?.openWorkerDetail(id, { focusField: field });
      }}
      onCopy={(id, tileOuId) =>
        setTileUnitDialog({
          workerId: id,
          fromOuId: tileOuId,
          fromOuType: tileOuId != null ? (ouTypeById.get(tileOuId) ?? null) : null,
        })
      }
      inBuildList={buildListOpen ? buildListWorkerIds.has(workerId) : undefined}
      buildListMode={buildListOpen || undefined}
      onDragStartRefs={(id, tileOuId) => {
        // Drag *start* is the earliest honest signal: handleWorkerDrop can
        // bail out after the organiser has already interacted.
        noteFirstInteraction("drag");
        if (selection.has(tileOuId, id)) {
          return selection
            .refs()
            .map((r) => ({
              workerId: r.workerId,
              fromOuId: r.ouId,
              fromOuType: r.ouId != null ? (ouTypeById.get(r.ouId) ?? null) : null,
            }));
        }
        return [{
          workerId: id,
          fromOuId: tileOuId,
          fromOuType: tileOuId != null ? (ouTypeById.get(tileOuId) ?? null) : null,
        }];
      }}
      onDragSessionStart={buildListOpen ? onBuildListWallDragStart : undefined}
      onDragEnd={buildListOpen ? onBuildListWallDragEnd : undefined}
      onRatingSaved={() => noteFirstInteraction("rating")}
    />
  );
}
