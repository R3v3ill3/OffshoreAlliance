"use client";

import Image from "next/image";
import { Check, ClipboardList, Mail, MessageSquare, Phone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { isWorkerMemberLike } from "@/lib/campaign/constants";
import {
  isNonOaMembershipType,
  otherUnionLabel,
  shouldShowOtherUnionBadge,
} from "@/lib/workers/other-union-display";
import { ratingBorderTextClass } from "./rating-colour";
import {
  LIST_ACTIVITY_CHANNELS,
  LIST_ACTIVITY_CHANNEL_LABELS,
  type ListActivityChannel,
  type WallChartWorker,
  type WallChartWorkerContactFocusField,
  type WorkerListActivityRow,
} from "./types";

export type WorkerContactBadgeKind = WallChartWorkerContactFocusField;

/**
 * Small cumulative-rating dot rendered next to the worker name on the wall
 * chart tile and the workforce list row. Pure presentation.
 */
export function CumulativeRatingDot({ value }: { value: number | null | undefined }) {
  return (
    <span
      title={`Cumulative ${value ?? "—"}`}
      className={cn(
        "inline-flex items-center justify-center shrink-0 w-3.5 h-3.5 rounded-full bg-white text-[8px] font-bold leading-none border mt-[1px]",
        ratingBorderTextClass(value ?? null)
      )}
    >
      {value ?? "—"}
    </span>
  );
}

export function RoleBadge({
  roleName,
  displayName,
}: {
  roleName: string | null | undefined;
  displayName: string | null | undefined;
}) {
  if (!roleName) return null;
  return (
    <span className="text-[9px] uppercase bg-background/60 px-0.5 rounded leading-none py-px">
      {displayName ?? roleName}
    </span>
  );
}

export function HSRBadge() {
  return (
    <span
      aria-label="Health and Safety Representative"
      className="text-[9px] uppercase bg-amber-600/80 text-white px-0.5 rounded leading-none py-px"
    >
      HSR
    </span>
  );
}

export function BargainingRepBadge() {
  return (
    <span
      aria-label="Bargaining representative"
      title="Bargaining representative"
      className="text-[9px] uppercase bg-violet-600/80 text-white px-0.5 rounded leading-none py-px"
    >
      BR
    </span>
  );
}

export function OtherUnionInitialsBadge({
  initials,
  title,
}: {
  initials: string;
  title?: string | null;
}) {
  return (
    <span
      title={title ?? undefined}
      aria-label={title ?? "Other union member"}
      className="text-[9px] font-semibold uppercase bg-sky-800/95 text-white px-0.5 rounded leading-none py-px"
    >
      {initials}
    </span>
  );
}

export function OAEurekaFlag() {
  return (
    <Image
      src="/eurekaflag.gif"
      alt="Member"
      width={14}
      height={10}
      className="rounded-sm shrink-0"
      unoptimized
    />
  );
}

export function NonOaUnionDot() {
  return (
    <span
      aria-label="Union member (other union)"
      title="Union member (other union)"
      className="inline-flex items-center justify-center h-[10px] w-[10px] rounded-full bg-red-600 text-white text-[7px] font-bold leading-none shrink-0"
    >
      U
    </span>
  );
}

/**
 * Renders the appropriate "is a member of some union" indicator for a worker:
 *   - OA member (eureka flag) when the worker is OA member-like and not non-OA;
 *   - Non-OA union dot (red "U") when the worker is non-OA and member-like;
 *   - Nothing otherwise.
 */
export function OAMembershipFlag({ worker }: { worker: WallChartWorker }) {
  const um = worker.union_membership_type;
  const mt = worker.member_role_type;
  const isMemberLike = isWorkerMemberLike({
    unionMembershipTypeName: um?.type_name,
    memberRoleName: mt?.role_name,
    isBargainingRep: worker.is_bargaining_rep,
  });
  const isNonOaMember = isNonOaMembershipType(um?.type_name);
  if (!isMemberLike) return null;
  return isNonOaMember ? <NonOaUnionDot /> : <OAEurekaFlag />;
}

export function MultiUnitIndicator({ otherUnitNames }: { otherUnitNames?: string[] }) {
  return (
    <span
      aria-label="In multiple organising units"
      title={otherUnitNames?.length ? `Also in: ${otherUnitNames.join(", ")}` : "In multiple units"}
      className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-sm bg-violet-600 text-white text-[8px] leading-none px-1 py-px shadow"
    >
      ◫
    </span>
  );
}

export function BuildListCheck() {
  return (
    <span
      aria-label="Already in the build list"
      title="Already in the build list"
      className="absolute -top-1 -left-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white shadow ring-1 ring-white print:hidden"
    >
      <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
    </span>
  );
}

export function WorkerContactBadge({
  kind,
  hasValue,
  canWrite,
  workerId,
  onContactBadgeClick,
}: {
  kind: WorkerContactBadgeKind;
  hasValue: boolean;
  canWrite: boolean;
  workerId: number;
  onContactBadgeClick?: (workerId: number, field: WorkerContactBadgeKind) => void;
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
      className={cn(
        shellClass,
        canWrite
          ? "cursor-pointer hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          : "cursor-default"
      )}
      onClick={
        canWrite
          ? (e) => {
              e.stopPropagation();
              onContactBadgeClick?.(workerId, kind);
            }
          : undefined
      }
      onKeyDown={
        canWrite
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onContactBadgeClick?.(workerId, kind);
              }
            }
          : undefined
      }
    >
      <Icon className={cn(iconClass, "mx-auto")} aria-hidden />
    </span>
  );
}

const LIST_ACTIVITY_ICONS: Record<ListActivityChannel, LucideIcon> = {
  phone: Phone,
  email: Mail,
  task: ClipboardList,
  sms: MessageSquare,
};

/**
 * Small "on a list" badges shown on the wall-chart tile: one per channel
 * (phone / email / activist list / sms) that is BOTH enabled in the badge
 * selector AND one the worker actually belongs to within the campaign.
 */
export function ListActivityBadges({
  enabledChannels,
  rows,
  className,
}: {
  enabledChannels: ReadonlySet<ListActivityChannel>;
  rows: WorkerListActivityRow[] | undefined;
  className?: string;
}) {
  if (enabledChannels.size === 0 || !rows || rows.length === 0) return null;

  const byChannel = new Map<ListActivityChannel, WorkerListActivityRow[]>();
  for (const row of rows) {
    const list = byChannel.get(row.channel);
    if (list) list.push(row);
    else byChannel.set(row.channel, [row]);
  }

  const shown = LIST_ACTIVITY_CHANNELS.filter(
    (channel) => enabledChannels.has(channel) && (byChannel.get(channel)?.length ?? 0) > 0
  );
  if (shown.length === 0) return null;

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {shown.map((channel) => {
        const Icon = LIST_ACTIVITY_ICONS[channel];
        const channelRows = byChannel.get(channel) ?? [];
        const label = LIST_ACTIVITY_CHANNEL_LABELS[channel];
        const names = channelRows
          .map((r) => {
            const name = r.list_name?.trim() || `List #${r.list_id}`;
            const date = r.added_at
              ? ` (${new Date(r.added_at).toLocaleDateString()})`
              : "";
            return `${name}${date}`;
          })
          .join(", ");
        const title = `On ${channelRows.length} ${label.toLowerCase()} list${
          channelRows.length === 1 ? "" : "s"
        }: ${names}`;
        return (
          <span
            key={channel}
            title={title}
            aria-label={title}
            className="inline-flex shrink-0 items-center gap-px rounded-sm border border-emerald-500/40 bg-emerald-500/15 px-0.5 py-px text-emerald-700 dark:text-emerald-300"
          >
            <Icon className="h-2.5 w-2.5" aria-hidden />
            {channelRows.length > 1 ? (
              <span className="text-[8px] font-semibold leading-none">
                {channelRows.length}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

export type WorkerBadgeRowProps = {
  worker: WallChartWorker;
  canWrite: boolean;
  onContactBadgeClick?: (workerId: number, field: WorkerContactBadgeKind) => void;
  /** When true, render a "BR" pill alongside the role/HSR/union badges. Off by default to match the existing wall-chart tile. */
  showBargainingRepBadge?: boolean;
  /** Adjust spacing/wrapping. Default mirrors the tile. */
  className?: string;
};

/**
 * Composite "metadata row" that renders the standard set of worker badges
 * used on the wall chart tile and the workforce list row:
 *   role · HSR · BR (opt-in) · other-union initials · OA/non-OA membership · contact dots.
 */
export function WorkerBadgeRow({
  worker,
  canWrite,
  onContactBadgeClick,
  showBargainingRepBadge,
  className,
}: WorkerBadgeRowProps) {
  const mt = worker.member_role_type;
  const um = worker.union_membership_type;
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
  const hasPhone = Boolean(worker.phone?.trim());
  const hasEmail = Boolean(worker.email?.trim());

  return (
    <div className={cn("flex items-center gap-0.5 flex-wrap", className)}>
      <RoleBadge roleName={mt?.role_name ?? null} displayName={mt?.display_name ?? null} />
      {worker.is_hsr ? <HSRBadge /> : null}
      {showBargainingRepBadge && worker.is_bargaining_rep ? <BargainingRepBadge /> : null}
      {showOtherBadge && worker.non_oa_union_option ? (
        <OtherUnionInitialsBadge
          initials={worker.non_oa_union_option.badge_initials}
          title={otherUnionTitle}
        />
      ) : null}
      <OAMembershipFlag worker={worker} />
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
  );
}
