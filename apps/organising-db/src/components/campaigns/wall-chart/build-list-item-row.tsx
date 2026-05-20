"use client";

import { Loader2, Mail, Phone, X, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { CampaignWorkerNameButton } from "../campaign-worker-detail-provider";
import { ratingBorderTextClass } from "./rating-colour";
import type { BuildListItem } from "./use-build-list";

export type BuildListItemRowProps = {
  item: BuildListItem;
  /** When true, item is highlighted as missing the field needed by current purpose. */
  missingContact?: "email" | "phone" | null;
  /** Drag handle support — wired by parent to reorder. */
  onDragStart?: (workerId: number, e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (workerId: number, e: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (workerId: number, e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  /** Called when the user clicks the X. */
  onRemove?: (workerId: number) => void;
  /** Called when the row is clicked (for opening detail / promoting to leader, etc.). */
  onClick?: (workerId: number) => void;
  /** Optional right-side action button (e.g. "Set as leader"). */
  rightAction?: React.ReactNode;
  /** Visual state when this row is being dragged into the leader slot. */
  draggable?: boolean;
  /** When true, the row is an optimistic placeholder waiting for server confirmation — render a small saving spinner. */
  pending?: boolean;
};

export function BuildListItemRow({
  item,
  missingContact,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onRemove,
  onClick,
  rightAction,
  draggable = true,
  pending,
}: BuildListItemRowProps) {
  const w = item.worker;
  if (!w) {
    return (
      <div className="rounded border bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
        Worker #{item.worker_id} (unavailable)
      </div>
    );
  }

  const fullName = `${w.first_name} ${w.last_name}`.trim() || `Worker ${w.worker_id}`;
  const role = w.member_role_type?.display_name ?? w.member_role_type?.role_name ?? null;
  const hasEmail = Boolean(w.email?.trim());
  const hasPhone = Boolean(w.phone?.trim());
  const cumulative = item.cumulative_rating;
  const sourceUnitLabel = item.source_ou?.name?.trim() || null;

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(item.worker_id, e)}
      onDragOver={(e) => {
        if (onDragOver) {
          e.preventDefault();
          onDragOver(item.worker_id, e);
        }
      }}
      onDrop={(e) => {
        if (onDrop) {
          e.preventDefault();
          onDrop(item.worker_id, e);
        }
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group flex items-center gap-2 rounded border bg-card px-2 py-1.5 text-xs",
        "hover:bg-accent/50 transition-colors",
        missingContact && "border-amber-400/70 bg-amber-50/40 dark:bg-amber-950/20",
        pending && "opacity-70"
      )}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : -1}
      onClick={onClick ? () => onClick(item.worker_id) : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(item.worker_id);
              }
            }
          : undefined
      }
    >
      {pending ? (
        <Loader2
          className="h-3 w-3 shrink-0 animate-spin text-muted-foreground"
          aria-label="Saving"
        />
      ) : (
        <GripVertical
          className="h-3 w-3 shrink-0 cursor-grab text-muted-foreground opacity-50 group-hover:opacity-100"
          aria-hidden
        />
      )}

      <span
        title={`Cumulative rating ${cumulative ?? "—"}`}
        className={cn(
          "inline-flex items-center justify-center shrink-0 w-5 h-5 rounded-full bg-white text-[10px] font-bold leading-none border",
          ratingBorderTextClass(cumulative)
        )}
      >
        {cumulative ?? "—"}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <CampaignWorkerNameButton workerId={item.worker_id} className="truncate">
            {fullName}
          </CampaignWorkerNameButton>
          {role && (
            <span className="text-[9px] uppercase bg-background border rounded px-1 leading-none py-px">
              {role}
            </span>
          )}
          {w.is_hsr && (
            <span className="text-[9px] uppercase bg-amber-600/80 text-white rounded px-1 leading-none py-px">
              HSR
            </span>
          )}
          {w.is_bargaining_rep && (
            <span className="text-[9px] uppercase bg-purple-700/80 text-white rounded px-1 leading-none py-px">
              BR
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
          <ContactIndicator kind="email" hasValue={hasEmail} flagged={missingContact === "email"} />
          <ContactIndicator kind="phone" hasValue={hasPhone} flagged={missingContact === "phone"} />
          {sourceUnitLabel && (
            <span className="truncate" title={`From: ${sourceUnitLabel}`}>
              · {sourceUnitLabel}
            </span>
          )}
        </div>
      </div>

      {rightAction}

      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${fullName} from list`}
          title="Remove from list"
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-60 hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.worker_id);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function ContactIndicator({
  kind,
  hasValue,
  flagged,
}: {
  kind: "email" | "phone";
  hasValue: boolean;
  flagged?: boolean;
}) {
  const Icon = kind === "email" ? Mail : Phone;
  const noun = kind === "email" ? "Email" : "Phone";
  const title = hasValue ? `${noun} on file` : `No ${noun.toLowerCase()}`;
  return (
    <span
      title={title}
      aria-label={title}
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-0.5",
        flagged
          ? "text-amber-700 dark:text-amber-400 font-semibold"
          : hasValue
            ? "text-muted-foreground"
            : "text-muted-foreground/50"
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
    </span>
  );
}
