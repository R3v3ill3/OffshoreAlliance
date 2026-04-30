"use client";

import { Button } from "@/components/ui/button";

export type WallChartSelectionBarProps = {
  count: number;
  canWrite: boolean;
  onMove: () => void;
  onCopy: () => void;
  onLinkToLeader: () => void;
  onClear: () => void;
  /** When true, the "Link to leader" button is disabled (used during v2.1 before the dialog lands). */
  linkDisabled?: boolean;
  /** When provided, shows a "Remove from unit" button. Pass undefined to hide (e.g. when all selected are already unassigned). */
  onRemove?: () => void;
};

export function WallChartSelectionBar({
  count,
  canWrite,
  onMove,
  onCopy,
  onLinkToLeader,
  onClear,
  linkDisabled,
  onRemove,
}: WallChartSelectionBarProps) {
  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-label="Wall chart selection"
      className="sticky top-0 z-10 -mx-1 mb-2 flex flex-wrap items-center gap-2 rounded border bg-primary/10 px-3 py-1.5 text-xs backdrop-blur print:hidden"
    >
      <span className="font-medium">
        {count} {count === 1 ? "worker" : "workers"} selected
      </span>
      <span className="text-muted-foreground hidden sm:inline">
        ·  Hold ⌘/Ctrl-click to add, Esc to clear
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-7 px-2 text-xs"
          onClick={onMove}
          disabled={!canWrite}
        >
          Move to unit…
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={onCopy}
          disabled={!canWrite}
        >
          Copy to unit…
        </Button>
        {onRemove && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="h-7 px-2 text-xs"
            onClick={onRemove}
            disabled={!canWrite}
          >
            Remove from unit
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={onLinkToLeader}
          disabled={!canWrite || linkDisabled}
          title={linkDisabled ? "Available in the next update" : undefined}
        >
          Link to leader…
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={onClear}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
