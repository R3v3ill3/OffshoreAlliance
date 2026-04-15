"use client";

import Image from "next/image";
import type { MouseEvent } from "react";
import { getWallChartDefaultCumulative, isWorkerMemberLike } from "@/lib/campaign/constants";
import { ratingBgClass } from "./rating-colour";
import type { WallChartRatingSummary, WallChartWorker } from "./types";

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
};

export function WorkerTile({
  worker,
  rating,
  ouId,
  inMultipleUnits,
  otherUnitNames,
  canWrite,
  onClick,
  onCopy,
  isSelected,
}: WorkerTileProps) {
  const mt = worker.member_role_type;
  const um = worker.union_membership_type;
  const storedCum = rating?.cumulative_rating ?? null;
  const last = rating?.last_activity_rating ?? null;

  const defaultCum =
    storedCum == null
      ? getWallChartDefaultCumulative({
          unionMembershipTypeName: um?.type_name,
          memberRoleName: mt?.role_name,
          isBargainingRep: worker.is_bargaining_rep,
        })
      : null;
  const colourCum = storedCum ?? defaultCum;
  const isMemberLike = isWorkerMemberLike({
    unionMembershipTypeName: um?.type_name,
    memberRoleName: mt?.role_name,
    isBargainingRep: worker.is_bargaining_rep,
  });

  const displayName = `${worker.first_name} ${worker.last_name}`;
  const titleRatings = `Cumulative ${storedCum ?? "—"}, last activity ${last ?? "—"}`;
  const titleDefaultHint =
    defaultCum != null
      ? ` Background uses default ${defaultCum} (${defaultCum === 1 ? "leadership" : "member"}) for colour only.`
      : "";
  const titleMultiUnit = inMultipleUnits && otherUnitNames?.length
    ? ` Also in: ${otherUnitNames.join(", ")}.`
    : "";
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

  return (
    <div
      className="relative"
      data-worker-id={worker.worker_id}
      data-ou-id={ouId ?? ""}
      onContextMenu={(e) => {
        if (!canWrite || !onCopy) return;
        e.preventDefault();
        onCopy(worker.worker_id);
      }}
    >
      <button
        type="button"
        disabled={!canWrite}
        title={`${displayName}. ${titleRatings}.${titleDefaultHint}${titleMultiUnit}${titleHints}`}
        aria-pressed={isSelected ? true : undefined}
        onClick={handleClick}
        className={`w-full text-left text-[11px] leading-tight p-1.5 rounded border min-h-[3.25rem] flex flex-col gap-0.5 justify-between ${ratingBgClass(
          colourCum
        )} ${canWrite ? "cursor-pointer hover:opacity-90" : ""} ${
          isSelected ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""
        }`}
      >
        <span className="font-medium line-clamp-2 break-words">{displayName}</span>
        <span className="text-[9px] text-muted-foreground tabular-nums">
          c{storedCum ?? "—"} · L{last ?? "—"}
        </span>
        <div className="flex items-center gap-0.5 flex-wrap">
          {mt?.role_name && (
            <span className="text-[9px] uppercase bg-background/60 px-0.5 rounded leading-none py-px">
              {mt.display_name ?? mt.role_name}
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
