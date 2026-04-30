"use client";

import Image from "next/image";
import type { DragEvent, MouseEvent } from "react";
import { getWallChartDefaultCumulative, isWorkerMemberLike } from "@/lib/campaign/constants";
import { assessmentNumericForWallChart, ratingBgClass } from "./rating-colour";
import type {
  ActivityRating,
  AssessmentSelection,
  WallChartRatingSummary,
  WallChartWorker,
} from "./types";
import { InlineRatingPopover } from "./inline-rating-popover";
import {
  DND_MIME_TYPE,
  serializeDragPayload,
  type WorkerDragRef,
} from "./dnd";

export type WorkerTileClickKind = "open" | "toggle-select" | "select-only";

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
  /** Right-click → open copy-to-unit dialog. */
  onCopy?: (workerId: number) => void;
  /** True when this (ouId, workerId) pair is in the active selection. */
  isSelected?: boolean;
  /**
   * Called when a drag starts on this tile. The parent returns the refs
   * to carry (the current selection when the tile is in it, else just
   * this tile). Returning an empty array aborts the drag.
   */
  onDragStartRefs?: (workerId: number, ouId: number | null) => WorkerDragRef[];
  /** Called when the drag ends (regardless of drop success). */
  onDragEnd?: () => void;
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
  onDragEnd,
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
  const colourSource = isAssessmentMode ? assessmentColourNumeric : cumulativeColourFallback;
  const isMemberLike = isWorkerMemberLike({
    unionMembershipTypeName: um?.type_name,
    memberRoleName: mt?.role_name,
    isBargainingRep: worker.is_bargaining_rep,
  });

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
  const titleHints =
    canWrite ? " Click to open, \u2318/Ctrl-click to select, Shift-click to add, right-click to copy." : "";

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (!canWrite) return;
    const meta = e.metaKey || e.ctrlKey;
    const shift = e.shiftKey;
    if (meta || shift) {
      e.preventDefault();
      onClick?.(worker.worker_id, ouId ?? null, "toggle-select");
    } else {
      onClick?.(worker.worker_id, ouId ?? null, "open");
    }
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
  };

  return (
    <div
      className="relative"
      data-worker-id={worker.worker_id}
      data-ou-id={ouId ?? ""}
      draggable={canWrite && !!onDragStartRefs}
      onDragStart={handleDragStart}
      onDragEnd={() => onDragEnd?.()}
      onContextMenu={(e) => {
        if (!canWrite || !onCopy) return;
        e.preventDefault();
        onCopy(worker.worker_id);
      }}
    >
      <button
        type="button"
        disabled={!canWrite}
        title={`${displayName}. ${titleRatings}.${titleAssessment}${titleDefaultHint}${titleMultiUnit}${titleHsr}${titleHints}`}
        aria-pressed={isSelected ? true : undefined}
        onClick={handleClick}
        className={`w-full text-left text-[11px] leading-tight p-1.5 rounded border min-h-[3.25rem] flex flex-col gap-0.5 justify-between ${ratingBgClass(
          colourSource
        )} ${canWrite ? "cursor-pointer hover:opacity-90" : ""} ${
          isSelected ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""
        }`}
      >
        <span className="font-medium line-clamp-2 break-words">{displayName}</span>
        {isAssessmentMode && assessment && campaignId != null ? (
          <AssessmentRatingRow
            campaignId={campaignId}
            assessment={assessment}
            workerId={worker.worker_id}
            workerName={displayName}
            activityRating={activityRating ?? null}
            cumulative={storedCum}
            canWrite={canWrite}
          />
        ) : (
          <span className="text-[9px] text-muted-foreground tabular-nums">
            c{storedCum ?? "—"} · L{last ?? "—"}
          </span>
        )}
        <div className="flex items-center gap-0.5 flex-wrap">
          {mt?.role_name && (
            <span className="text-[9px] uppercase bg-background/60 px-0.5 rounded leading-none py-px">
              {mt.display_name ?? mt.role_name}
            </span>
          )}
          {worker.is_hsr && (
            <span
              aria-label="Health and Safety Representative"
              className="text-[9px] uppercase bg-amber-600/80 text-white px-0.5 rounded leading-none py-px"
            >
              HSR
            </span>
          )}
          {isMemberLike && (
            <Image
              src="/eurekaflag.gif"
              alt="Member"
              width={14}
              height={10}
              className="rounded-sm shrink-0"
              unoptimized
            />
          )}
        </div>
      </button>
      {inMultipleUnits && (
        <span
          aria-label="In multiple organising units"
          title={otherUnitNames?.length ? `Also in: ${otherUnitNames.join(", ")}` : "In multiple units"}
          className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-sm bg-violet-600 text-white text-[8px] leading-none px-1 py-px shadow"
        >
          ◫
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assessment-mode rating row: clickable activity rating + small cumulative badge.
// ---------------------------------------------------------------------------

function AssessmentRatingRow({
  campaignId,
  assessment,
  workerId,
  workerName,
  activityRating,
  cumulative,
  canWrite,
}: {
  campaignId: string | number;
  assessment: Extract<AssessmentSelection, { kind: "assessment" }>;
  workerId: number;
  workerName: string;
  activityRating: ActivityRating | null;
  cumulative: number | null;
  canWrite: boolean;
}) {
  const display = assessment.isBinary
    ? binaryShortLabel(activityRating?.binary_value ?? null)
    : activityRating?.rating != null
      ? String(activityRating.rating)
      : "—";

  const ariaLabel = `Rate ${workerName} on ${assessment.title}. Current: ${display}.`;

  const chip = (
    <span
      role={canWrite ? "button" : undefined}
      tabIndex={canWrite ? 0 : -1}
      aria-label={canWrite ? ariaLabel : undefined}
      onClick={(e) => {
        // Prevent the outer tile-button click (which opens the drawer).
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        // Stop the keydown from bubbling into the tile button; the popover
        // trigger is the wrapping <PopoverTrigger asChild>.
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
      className={`inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded bg-background/80 border text-[11px] font-semibold tabular-nums leading-none ${
        canWrite ? "cursor-pointer hover:bg-background" : "cursor-default"
      }`}
    >
      {display}
    </span>
  );

  return (
    <div className="flex items-center justify-between gap-1">
      {canWrite ? (
        <InlineRatingPopover
          campaignId={campaignId}
          activityId={assessment.activityId}
          activityTitle={assessment.title}
          isBinary={assessment.isBinary}
          workerId={workerId}
          workerName={workerName}
          initial={{
            rating: activityRating?.rating ?? null,
            binary_value: activityRating?.binary_value ?? null,
          }}
        >
          {chip}
        </InlineRatingPopover>
      ) : (
        chip
      )}
      <span
        title={`Cumulative ${cumulative ?? "—"}`}
        className={`inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded border border-white/70 text-[9px] tabular-nums leading-none ${ratingBgClass(
          cumulative
        )}`}
      >
        c{cumulative ?? "—"}
      </span>
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
