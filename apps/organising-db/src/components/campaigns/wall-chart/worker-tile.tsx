"use client";

import type { DragEvent, MouseEvent } from "react";
import { cn } from "@/lib/utils/cn";
import { getWallChartDefaultCumulative } from "@/lib/campaign/constants";
import {
  otherUnionLabel,
  shouldShowOtherUnionBadge,
} from "@/lib/workers/other-union-display";
import { assessmentNumericForWallChart, ratingBgClass, ratingBorderTextClass } from "./rating-colour";
import type {
  ActivityRating,
  AssessmentSelection,
  WallChartRatingSummary,
  WallChartWorker,
  WallChartWorkerContactFocusField,
} from "./types";
import { CumulativeRatingPopover, InlineRatingPopover } from "./inline-rating-popover";
import {
  BuildListCheck,
  CumulativeRatingDot,
  MultiUnitIndicator,
  WorkerBadgeRow,
} from "./worker-badges";
import {
  DND_MIME_TYPE,
  serializeDragPayload,
  type WorkerDragRef,
} from "./dnd";

export type WorkerTileClickKind = "open" | "toggle-select" | "select-only";

export type WorkerTileContactField = WallChartWorkerContactFocusField;

export type WorkerTileProps = {
  worker: WallChartWorker;
  rating?: WallChartRatingSummary | null;
  ouId?: number | null;
  /** True if this worker is assigned to more than one OU within the campaign. */
  inMultipleUnits?: boolean;
  /** Names of the other units this worker also belongs to (for tooltip). */
  otherUnitNames?: string[];
  canWrite: boolean;
  /** Current wall chart selection (cumulative vs specific assessment). */
  selection?: AssessmentSelection;
  /** Campaign id — required when selection is an assessment (for rating save). */
  campaignId?: string | number;
  /** This worker's rating for the selected assessment, if any. */
  activityRating?: ActivityRating | null;
  /**
   * Click handler. The tile decides whether the click is a plain click (open
   * the detail sheet), a modifier click (toggle selection), or a shift-click
   * (range/add-to-selection — currently treated as toggle).
   */
  onClick?: (workerId: number, ouId: number | null, kind: WorkerTileClickKind) => void;
  /** Right-click → open move/copy-to-unit dialog. */
  onCopy?: (workerId: number, ouId: number | null) => void;
  /** True when this (ouId, workerId) pair is in the active selection. */
  isSelected?: boolean;
  /**
   * Called when a drag starts on this tile. The parent returns the refs
   * to carry (the current selection when the tile is in it, else just
   * this tile). Returning an empty array aborts the drag.
   */
  onDragStartRefs?: (workerId: number, ouId: number | null) => WorkerDragRef[];
  /** Called when a drag successfully starts (after payload is set). */
  onDragSessionStart?: () => void;
  /** Called when the drag ends (regardless of drop success). */
  onDragEnd?: () => void;
  /** Phone / email icon → open worker sheet with that field focused (when canWrite). */
  onContactBadgeClick?: (workerId: number, field: WorkerTileContactField) => void;
  /**
   * True when this worker is in the currently-active build list. Renders a
   * small green check overlay so users can see at a glance who has already
   * been added (and avoid re-adding them).
   */
  inBuildList?: boolean;
  /**
   * When true (Build list panel is open), reverses click behaviour: a single
   * click selects/deselects the tile for drag-to-list, and a double-click
   * opens the worker detail popup. Reverts to default (single click = open)
   * when false or undefined.
   */
  buildListMode?: boolean;
};

export function WorkerTile({
  worker,
  rating,
  ouId,
  inMultipleUnits,
  otherUnitNames,
  canWrite,
  selection,
  campaignId,
  activityRating,
  onClick,
  onCopy,
  isSelected,
  onDragStartRefs,
  onDragSessionStart,
  onDragEnd,
  onContactBadgeClick,
  inBuildList,
  buildListMode,
}: WorkerTileProps) {
  const mt = worker.member_role_type;
  const um = worker.union_membership_type;
  const storedCum = rating?.cumulative_rating ?? null;
  const last = rating?.last_activity_rating ?? null;

  const isAssessmentMode = selection?.kind === "assessment";
  const assessment = isAssessmentMode ? selection : null;

  const defaultCum =
    storedCum == null
      ? getWallChartDefaultCumulative({
          unionMembershipTypeName: um?.type_name,
          memberRoleName: mt?.role_name,
          isBargainingRep: worker.is_bargaining_rep,
        })
      : null;
  const cumulativeColourFallback = storedCum ?? defaultCum;

  // Background colour source depends on selected view. In assessment mode, a
  // worker with no rating for that assessment is explicitly level-0 grey —
  // membership-based defaults do not apply, because the tile is telling the
  // user "this worker has not been assessed on this activity".
  const activityRatingValue = activityRating?.rating ?? null;
  const assessmentColourNumeric =
    isAssessmentMode && assessment
      ? assessmentNumericForWallChart(assessment, activityRating)
      : null;

  const showOtherBadge = shouldShowOtherUnionBadge({
    unionMembershipTypeName: um?.type_name,
    nonOaBadgeInitials: worker.non_oa_union_option?.badge_initials ?? null,
  });
  const otherUnionTitle = showOtherBadge
    ? otherUnionLabel({
        unionMembershipTypeName: um?.type_name,
        nonOaBadgeInitials: worker.non_oa_union_option?.badge_initials ?? null,
        nonOaDisplayName: worker.non_oa_union_option?.display_name ?? null,
      })
    : null;
  const colourSource = isAssessmentMode ? assessmentColourNumeric : cumulativeColourFallback;
  const roleName = mt?.role_name?.trim().toLowerCase() ?? null;
  const isDelegate = roleName === "delegate";
  const isActivist = roleName === "activist";
  const isContact = roleName === "contact";
  const hasLeadershipRole = isDelegate || isActivist || isContact;

  const displayName = `${worker.first_name} ${worker.last_name}`;
  const titleRatings = `Cumulative ${storedCum ?? "—"}, last activity ${last ?? "—"}`;
  const titleDefaultHint =
    !isAssessmentMode && defaultCum != null
      ? ` Background uses default ${defaultCum} (${defaultCum === 1 ? "leadership" : "member"}) for colour only.`
      : "";
  const titleAssessment = assessment
    ? ` Assessment: ${assessment.title}. This worker: ${
        assessment.isBinary
          ? activityRating?.binary_value ?? "unassessed"
          : activityRatingValue ?? "unassessed"
      }.`
    : "";
  const titleMultiUnit = inMultipleUnits && otherUnitNames?.length
    ? ` Also in: ${otherUnitNames.join(", ")}.`
    : "";
  const titleHsr = worker.is_hsr ? " Health and Safety Representative." : "";
  const titleOtherUnion = showOtherBadge && otherUnionTitle ? ` ${otherUnionTitle}.` : "";
  const titleHints = canWrite
    ? buildListMode
      ? " Click to select, double-click to open, right-click to move/copy."
      : " Click to open, \u2318/Ctrl-click to select, Shift-click to add, right-click to move/copy."
    : "";

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (!canWrite) return;
    if (buildListMode) {
      e.preventDefault();
      onClick?.(worker.worker_id, ouId ?? null, "toggle-select");
      return;
    }
    const meta = e.metaKey || e.ctrlKey;
    const shift = e.shiftKey;
    if (meta || shift) {
      e.preventDefault();
      onClick?.(worker.worker_id, ouId ?? null, "toggle-select");
    } else {
      onClick?.(worker.worker_id, ouId ?? null, "open");
    }
  };

  const handleDoubleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (!canWrite || !buildListMode) return;
    e.preventDefault();
    onClick?.(worker.worker_id, ouId ?? null, "open");
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    if (!canWrite || !onDragStartRefs) {
      e.preventDefault();
      return;
    }
    const refs = onDragStartRefs(worker.worker_id, ouId ?? null);
    if (refs.length === 0) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "copyMove";
    e.dataTransfer.setData(
      DND_MIME_TYPE,
      serializeDragPayload({ version: 1, refs })
    );
    // Plain-text fallback for diagnostics; drop targets ignore it.
    e.dataTransfer.setData(
      "text/plain",
      refs.length === 1 ? displayName : `${refs.length} workers`
    );
    onDragSessionStart?.();
  };

  const largeBadgeDisplay = isAssessmentMode && assessment
    ? (assessment.isBinary
      ? binaryShortLabel(activityRating?.binary_value ?? null)
      : activityRating?.rating != null
        ? String(activityRating.rating)
        : "—")
    : (last ?? "—");

  const largeBadgeAriaLabel = isAssessmentMode && assessment
    ? `Rate ${displayName} on ${assessment.title}. Current: ${largeBadgeDisplay}.`
    : `Quick-rate ${displayName}. Click to select an assessment and rating.`;

  const largeBadgeClass = cn(
    "inline-flex items-center justify-center shrink-0 w-6 h-6 rounded-full bg-white text-sm font-bold leading-none border shadow-sm",
    ratingBorderTextClass(
      isAssessmentMode ? assessmentColourNumeric : last
    ),
    canWrite ? "cursor-pointer hover:bg-slate-50" : "cursor-default"
  );

  const largeBadge = (
    <span
      role={canWrite ? "button" : undefined}
      tabIndex={canWrite ? 0 : -1}
      aria-label={canWrite ? largeBadgeAriaLabel : undefined}
      onClick={(e) => {
        if (!canWrite) return;
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (!canWrite) return;
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
      className={largeBadgeClass}
    >
      {largeBadgeDisplay}
    </span>
  );

  const largeBadgeRendered = isAssessmentMode && assessment && campaignId != null && canWrite ? (
    <InlineRatingPopover
      campaignId={campaignId}
      activityId={assessment.activityId}
      activityTitle={assessment.title}
      isBinary={assessment.isBinary}
      workerId={worker.worker_id}
      workerName={displayName}
      initial={{
        rating: activityRating?.rating ?? null,
        binary_value: activityRating?.binary_value ?? null,
      }}
      customLabels={assessment.ratingLabels}
      onOpenDetail={() => onClick?.(worker.worker_id, ouId ?? null, "open")}
    >
      {largeBadge}
    </InlineRatingPopover>
  ) : !isAssessmentMode && campaignId != null && canWrite ? (
    <CumulativeRatingPopover
      campaignId={campaignId}
      workerId={worker.worker_id}
      workerName={displayName}
      onOpenDetail={() => onClick?.(worker.worker_id, ouId ?? null, "open")}
    >
      {largeBadge}
    </CumulativeRatingPopover>
  ) : (
    largeBadge
  );

  const tileStyle = isDelegate
    ? {
        backgroundImage:
          "linear-gradient(rgba(15, 23, 42, 0.4), rgba(15, 23, 42, 0.4)), url('/Eurekastd.png')",
        backgroundPosition: "center",
        backgroundSize: "cover",
      }
    : undefined;

  return (
    <div
      className="relative h-full"
      data-worker-id={worker.worker_id}
      data-ou-id={ouId ?? ""}
      draggable={canWrite && !!onDragStartRefs}
      onDragStart={handleDragStart}
      onDragEnd={() => onDragEnd?.()}
      onContextMenu={(e) => {
        if (!canWrite || !onCopy) return;
        e.preventDefault();
        onCopy(worker.worker_id, ouId ?? null);
      }}
    >
      <button
        type="button"
        disabled={!canWrite}
        title={`${displayName}. ${titleRatings}.${titleAssessment}${titleDefaultHint}${titleMultiUnit}${titleHsr}${titleOtherUnion}${titleHints}`}
        aria-pressed={isSelected ? true : undefined}
        onClick={handleClick}
        onDoubleClick={buildListMode ? handleDoubleClick : undefined}
        style={tileStyle}
        className={cn(
          "w-full h-full text-left text-[11px] leading-tight p-1.5 rounded border min-h-[3.25rem] flex flex-col gap-0.5 justify-between",
          isDelegate ? "text-white shadow-sm" : ratingBgClass(colourSource),
          isActivist && !(buildListMode && isSelected)
            ? "border-2 border-blue-900 dark:border-blue-400"
            : null,
          canWrite ? "cursor-pointer hover:opacity-90" : null,
          buildListMode && isSelected
            ? "border-4 border-green-500"
            : isSelected
              ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
              : null
        )}
      >
        <div className="flex items-start justify-between gap-1 w-full">
          <div className="flex items-start gap-1 min-w-0 pt-0.5">
            <CumulativeRatingDot value={storedCum} />
            <span
              className={cn(
                "line-clamp-2 break-words",
                hasLeadershipRole ? "font-bold" : "font-medium"
              )}
            >
              {displayName}
            </span>
          </div>
          <div className="shrink-0">{largeBadgeRendered}</div>
        </div>
        <WorkerBadgeRow
          worker={worker}
          canWrite={canWrite}
          onContactBadgeClick={onContactBadgeClick}
        />
      </button>
      {inMultipleUnits ? <MultiUnitIndicator otherUnitNames={otherUnitNames} /> : null}
      {inBuildList ? <BuildListCheck /> : null}
    </div>
  );
}

function binaryShortLabel(value: string | null): string {
  if (!value) return "—";
  // Common VOTE_SUPPORTER_OPTIONS values: 'attended','did_not_attend','abstain','unknown','yes','no'
  const v = value.toLowerCase();
  if (v.startsWith("attend") && !v.includes("not")) return "A";
  if (v.includes("not") || v === "no") return "N";
  if (v === "abstain") return "·";
  if (v === "unknown" || v === "u") return "?";
  if (v === "yes" || v === "y") return "Y";
  return value.charAt(0).toUpperCase();
}
