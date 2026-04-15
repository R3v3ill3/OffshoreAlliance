"use client";

import Image from "next/image";
import { getWallChartDefaultCumulative, isWorkerMemberLike } from "@/lib/campaign/constants";
import { ratingBgClass } from "./rating-colour";
import type { WallChartRatingSummary, WallChartWorker } from "./types";

export type WorkerTileProps = {
  worker: WallChartWorker;
  rating?: WallChartRatingSummary | null;
  ouId?: number | null;
  /** True if this worker is assigned to more than one OU within the campaign. */
  inMultipleUnits?: boolean;
  /** Names of the other units this worker also belongs to (for tooltip). */
  otherUnitNames?: string[];
  canWrite: boolean;
  onClick?: (workerId: number) => void;
  onCopy?: (workerId: number) => void;
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
        title={`${displayName}. ${titleRatings}.${titleDefaultHint}${titleMultiUnit}`}
        onClick={() => canWrite && onClick?.(worker.worker_id)}
        className={`w-full text-left text-[11px] leading-tight p-1.5 rounded border min-h-[3.25rem] flex flex-col gap-0.5 justify-between ${ratingBgClass(
          colourCum
        )} ${canWrite ? "cursor-pointer hover:opacity-90" : ""}`}
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
