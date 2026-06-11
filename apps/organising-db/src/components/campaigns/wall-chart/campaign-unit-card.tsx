"use client";

import { ReactNode, useState } from "react";
import { ChevronDown, GripVertical, ListPlus } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { WALL_CHART_GRID_CLASS } from "./rating-colour";
import { humanizeOuType, ouDisplayName, type WallChartOU } from "./types";
import {
  DND_MIME_TYPE,
  DND_UNIT_MIME_TYPE,
  parseDragPayload,
  serializeUnitDragPayload,
  type WorkerDragMode,
  type WorkerDragPayload,
} from "./dnd";

export type CampaignUnitCardProps = {
  /** Pass null when rendering a pseudo-unit (e.g. unassigned). */
  ou: WallChartOU | null;
  /** Title override for pseudo-units like "Unassigned". */
  fallbackTitle?: string;
  workerCount: number;
  estimate?: number | null;
  /** Optional summary metric content rendered in the header band. */
  summary?: ReactNode;
  /** When true, render the summary behind a chevron toggle. */
  summaryCollapsible?: boolean;
  /** Initial open state for a collapsible summary. Defaults to closed. */
  summaryInitiallyExpanded?: boolean;
  /** Hide worker count + assessment label while a collapsible summary is closed. */
  hideHeaderDetailsWhenSummaryCollapsed?: boolean;
  /** Optional toolbar rendered next to the title (filters/sort). */
  toolbar?: ReactNode;
  /** Worker tiles. */
  children: ReactNode;
  /** Placeholder cells (greyed out) for unfilled estimate slots. */
  placeholders?: number;
  /** When present, renders a small "Assessing: {title}" chip under the unit name. */
  assessmentLabel?: string | null;
  /**
   * DnD drop handler. Called with the target ou id (the card's own ou),
   * the payload parsed from dataTransfer, and the resolved mode (copy if
   * Shift is held at drop time, else move).
   */
  onWorkerDrop?: (args: {
    targetOuId: number | null;
    payload: WorkerDragPayload;
    mode: WorkerDragMode;
  }) => void;
  /** Disable drop (e.g. read-only viewer). */
  dropDisabled?: boolean;
  /**
   * Optional sub-unit content rendered below the worker grid. Used to show
   * nested sub-unit cards under a parent OU (one level of nesting).
   */
  subUnits?: ReactNode;
  /** Optional chips/badges shown next to the unit name (e.g. sub-unit count). */
  headerBadges?: ReactNode;
  /** Optional subjective unit-rating control rendered in the header. */
  ratingControl?: ReactNode;
  /** Visual nesting indent — used when this card is itself a sub-unit. */
  nested?: boolean;
  /**
   * Number of unfilled slots from the campaign estimate not yet assigned to any
   * named worker (campaign estimate minus total named members). When provided
   * and > 0, shown as "· N unfilled" in the subtitle. Tiles are NOT rendered.
   */
  unfilledSlots?: number;
  /**
   * When provided, renders a drag handle in the card header. Dragging the
   * handle emits a unit-drag payload that build-list drop targets accept,
   * adding the listed worker IDs to the active list. The IDs should reflect
   * the unit's currently visible (filtered) workers, so list builders only
   * receive what the user can see.
   */
  unitDragPayload?: { workerIds: number[] };
  /** Fired when the unit drag handle starts / ends a drag (build list). */
  onUnitDragSessionStart?: () => void;
  onUnitDragSessionEnd?: () => void;
};

const PLACEHOLDER_CAP = 24;

export function CampaignUnitCard({
  ou,
  fallbackTitle,
  workerCount,
  estimate,
  summary,
  summaryCollapsible,
  summaryInitiallyExpanded = false,
  hideHeaderDetailsWhenSummaryCollapsed,
  toolbar,
  children,
  placeholders = 0,
  assessmentLabel,
  onWorkerDrop,
  dropDisabled,
  subUnits,
  headerBadges,
  ratingControl,
  nested,
  unfilledSlots,
  unitDragPayload,
  onUnitDragSessionStart,
  onUnitDragSessionEnd,
}: CampaignUnitCardProps) {
  const title = ou ? ouDisplayName(ou) : (fallbackTitle ?? "Unit");
  const typeChip = ou?.ou_type ? humanizeOuType(ou.ou_type) : null;
  const est = estimate ?? ou?.total_workers_estimated ?? 0;
  const cappedPlaceholders = Math.max(0, placeholders);

  const dropEnabled = !!onWorkerDrop && !dropDisabled;
  const [isDragOver, setIsDragOver] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(summaryInitiallyExpanded);

  const targetOuId: number | null = ou?.ou_id ?? null;
  const canToggleSummary = Boolean(summaryCollapsible && summary);
  const showSummary = Boolean(summary && (!canToggleSummary || summaryExpanded));
  const showHeaderDetails =
    !hideHeaderDetailsWhenSummaryCollapsed || !canToggleSummary || summaryExpanded;

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!dropEnabled) return;
    // Accept only our own payload.
    if (!e.dataTransfer.types.includes(DND_MIME_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = e.shiftKey ? "copy" : "move";
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!dropEnabled) return;
    // Only clear highlight when leaving the card itself (not a child).
    if (e.currentTarget === e.target) setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!dropEnabled || !onWorkerDrop) return;
    const raw = e.dataTransfer.getData(DND_MIME_TYPE);
    if (!raw) return;
    const payload = parseDragPayload(raw);
    if (!payload) return;
    e.preventDefault();
    setIsDragOver(false);
    const mode: WorkerDragMode = e.shiftKey ? "copy" : "move";
    onWorkerDrop({ targetOuId, payload, mode });
  };

  return (
    <Card
      className={`print:break-inside-avoid print:shadow-none transition-[box-shadow,ring] ${
        isDragOver ? "ring-2 ring-primary" : ""
      } ${nested ? "border-l-4 border-l-primary/40" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <CardHeader className="pb-2 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {unitDragPayload && unitDragPayload.workerIds.length > 0 && (
                <span
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData(
                      DND_UNIT_MIME_TYPE,
                      serializeUnitDragPayload({
                        version: 1,
                        ouId: targetOuId,
                        ouName: title,
                        workerIds: unitDragPayload.workerIds,
                      })
                    );
                    e.dataTransfer.setData(
                      "text/plain",
                      `${unitDragPayload.workerIds.length} workers from ${title}`
                    );
                    onUnitDragSessionStart?.();
                  }}
                  onDragEnd={() => onUnitDragSessionEnd?.()}
                  className={cn(
                    "inline-flex h-7 shrink-0 cursor-grab items-center gap-1 rounded-md border-2 border-dashed border-green-500",
                    "bg-green-500/10 px-2 text-[10px] font-semibold leading-none text-green-800",
                    "hover:bg-green-500/20 active:cursor-grabbing dark:text-green-300 print:hidden"
                  )}
                  title={`Drag to add ${unitDragPayload.workerIds.length} visible worker${unitDragPayload.workerIds.length === 1 ? "" : "s"} from "${title}" into the build list`}
                  aria-label={`Drag entire unit ${title} into the build list`}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                  <ListPlus className="h-3 w-3 shrink-0" aria-hidden />
                  <span>Add unit</span>
                </span>
              )}
              <h3 className="text-sm font-semibold leading-tight truncate">{title}</h3>
              {typeChip && (
                <span className="text-[10px] uppercase tracking-wide rounded border px-1.5 py-px text-muted-foreground">
                  {typeChip}
                </span>
              )}
              {headerBadges}
              {canToggleSummary && (
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground print:hidden"
                  onClick={() => setSummaryExpanded((v) => !v)}
                  aria-expanded={summaryExpanded}
                  aria-label={summaryExpanded ? "Hide unit summary" : "Show unit summary"}
                  title={summaryExpanded ? "Hide summary" : "Show summary"}
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform",
                      summaryExpanded && "rotate-180"
                    )}
                    aria-hidden
                  />
                </button>
              )}
            </div>
            {showHeaderDetails && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {workerCount} named{est > 0 && ` / ${est} est.`}{unfilledSlots != null && unfilledSlots > 0 && ` · ${unfilledSlots} unfilled`}
              </p>
            )}
            {showHeaderDetails && assessmentLabel && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Assessing:{" "}
                <span className="text-foreground font-medium">{assessmentLabel}</span>
              </p>
            )}
            {ratingControl && <div className="mt-1">{ratingControl}</div>}
          </div>
          {toolbar && <div className="flex items-center gap-1 print:hidden">{toolbar}</div>}
        </div>
        {showSummary && <div className="pt-1">{summary}</div>}
      </CardHeader>
      <CardContent>
        <div className={WALL_CHART_GRID_CLASS}>
          {children}
          {Array.from({ length: Math.min(cappedPlaceholders, PLACEHOLDER_CAP) }).map((_, i) => (
            <div
              key={`p-${i}`}
              className="min-h-[3.25rem] rounded border border-dashed bg-zinc-300/50 dark:bg-zinc-600/50"
            />
          ))}
        </div>
        {cappedPlaceholders > PLACEHOLDER_CAP && (
          <p className="text-xs text-muted-foreground mt-2">
            +{cappedPlaceholders - PLACEHOLDER_CAP} more placeholder cells
          </p>
        )}
        {subUnits && (
          <div className="mt-3 ml-3 pl-3 border-l-2 border-muted space-y-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Sub-units
            </div>
            {subUnits}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
