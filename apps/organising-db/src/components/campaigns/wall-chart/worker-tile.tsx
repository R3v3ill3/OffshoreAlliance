"use client";

import Image from "next/image";
import { Mail, Phone } from "lucide-react";
import type { DragEvent, MouseEvent } from "react";
import { cn } from "@/lib/utils/cn";
import { getWallChartDefaultCumulative, isWorkerMemberLike } from "@/lib/campaign/constants";
import {
  isNonOaMembershipType,
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
  /** Phone / email icon → open worker sheet with that field focused (when canWrite). */
  onContactBadgeClick?: (workerId: number, field: WorkerTileContactField) => void;
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
  onContactBadgeClick,
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
  const isMemberLike = isWorkerMemberLike({
    unionMembershipTypeName: um?.type_name,
    memberRoleName: mt?.role_name,
    isBargainingRep: worker.is_bargaining_rep,
  });
  const isNonOaMember = isNonOaMembershipType(um?.type_name);

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
  const titleHints =
    canWrite ? " Click to open, \u2318/Ctrl-click to select, Shift-click to add, right-click to copy." : "";

  const hasPhone = Boolean(worker.phone?.trim());
  const hasEmail = Boolean(worker.email?.trim());

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

  const largeBadgeDisplay = isAssessmentMode && assessment
    ? (assessment.isBinary
      ? binaryShortLabel(activityRating?.binary_value ?? null)
      : activityRating?.rating != null
        ? String(activityRating.rating)
        : "—")
    : (last ?? "—");

  const largeBadgeAriaLabel = isAssessmentMode && assessment
    ? `Rate ${displayName} on ${assessment.title}. Current: ${largeBadgeDisplay}.`
    : `Latest rating: ${largeBadgeDisplay}`;

  const largeBadgeClass = cn(
    "inline-flex items-center justify-center shrink-0 w-6 h-6 rounded-full bg-white text-sm font-bold leading-none border shadow-sm",
    ratingBorderTextClass(
      isAssessmentMode ? assessmentColourNumeric : last
    ),
    canWrite && isAssessmentMode ? "cursor-pointer hover:bg-slate-50" : "cursor-default"
  );

  const largeBadge = (
    <span
      role={canWrite && isAssessmentMode ? "button" : undefined}
      tabIndex={canWrite && isAssessmentMode ? 0 : -1}
      aria-label={canWrite && isAssessmentMode ? largeBadgeAriaLabel : undefined}
      onClick={(e) => {
        if (!canWrite || !isAssessmentMode) return;
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (!canWrite || !isAssessmentMode) return;
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
        onCopy(worker.worker_id);
      }}
    >
      <button
        type="button"
        disabled={!canWrite}
        title={`${displayName}. ${titleRatings}.${titleAssessment}${titleDefaultHint}${titleMultiUnit}${titleHsr}${titleOtherUnion}${titleHints}`}
        aria-pressed={isSelected ? true : undefined}
        onClick={handleClick}
        className={`w-full h-full text-left text-[11px] leading-tight p-1.5 rounded border min-h-[3.25rem] flex flex-col gap-0.5 justify-between ${ratingBgClass(
          colourSource
        )} ${canWrite ? "cursor-pointer hover:opacity-90" : ""} ${
          isSelected ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-1 w-full">
          <div className="flex items-start gap-1 min-w-0 pt-0.5">
            <span
              title={`Cumulative ${storedCum ?? "—"}`}
              className={cn(
                "inline-flex items-center justify-center shrink-0 w-3.5 h-3.5 rounded-full bg-white text-[8px] font-bold leading-none border mt-[1px]",
                ratingBorderTextClass(storedCum)
              )}
            >
              {storedCum ?? "—"}
            </span>
            <span className="font-medium line-clamp-2 break-words">{displayName}</span>
          </div>
          <div className="shrink-0">{largeBadgeRendered}</div>
        </div>
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
          {showOtherBadge && worker.non_oa_union_option && (
            <span
              title={otherUnionTitle ?? undefined}
              aria-label={otherUnionTitle ?? "Other union member"}
              className="text-[9px] font-semibold uppercase bg-sky-800/95 text-white px-0.5 rounded leading-none py-px"
            >
              {worker.non_oa_union_option.badge_initials}
            </span>
          )}
          {isMemberLike && !isNonOaMember && (
            <Image
              src="/eurekaflag.gif"
              alt="Member"
              width={14}
              height={10}
              className="rounded-sm shrink-0"
              unoptimized
            />
          )}
          {isNonOaMember && isMemberLike && (
            <span
              aria-label="Union member (other union)"
              title="Union member (other union)"
              className="inline-flex items-center justify-center h-[10px] w-[10px] rounded-full bg-red-600 text-white text-[7px] font-bold leading-none shrink-0"
            >
              U
            </span>
          )}
          <WorkerContactBadge
            kind="phone"
            hasValue={hasPhone}
            canWrite={canWrite}
            workerId={worker.worker_id}
            onContactBadgeClick={onContactBadgeClick}
          />
          <WorkerContactBadge
            kind="email"
            hasValue={hasEmail}
            canWrite={canWrite}
            workerId={worker.worker_id}
            onContactBadgeClick={onContactBadgeClick}
          />
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

function WorkerContactBadge({
  kind,
  hasValue,
  canWrite,
  workerId,
  onContactBadgeClick,
}: {
  kind: WorkerTileContactField;
  hasValue: boolean;
  canWrite: boolean;
  workerId: number;
  onContactBadgeClick?: (workerId: number, field: WorkerTileContactField) => void;
}) {
  const Icon = kind === "phone" ? Phone : Mail;
  const noun = kind === "phone" ? "phone" : "email";
  const shortTitle = hasValue ? `${noun} on file` : `No ${noun}`;
  const actionHint = canWrite ? ` Open worker details, focus ${noun}.` : "";
  const title = `${shortTitle}.${actionHint}`;

  const shellClass = cn(
    "inline-flex shrink-0 items-center justify-center rounded-sm",
    "h-[10px] w-[10px]",
    hasValue
      ? "border border-primary/30 bg-primary/20 text-primary"
      : "border border-muted-foreground/25 bg-muted/50 text-muted-foreground opacity-60"
  );

  const iconClass = hasValue ? "h-2.5 w-2.5" : "h-2 w-2";

  return (
    <span
      role={canWrite ? "button" : undefined}
      tabIndex={canWrite ? 0 : -1}
      title={title.trim()}
      aria-label={title.trim()}
      className={cn(shellClass, canWrite ? "cursor-pointer hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" : "cursor-default")}
      onClick={canWrite ? (e) => {
        e.stopPropagation();
        onContactBadgeClick?.(workerId, kind);
      } : undefined}
      onKeyDown={canWrite ? (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          onContactBadgeClick?.(workerId, kind);
        }
      } : undefined}
    >
      <Icon className={cn(iconClass, "mx-auto")} aria-hidden />
    </span>
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
