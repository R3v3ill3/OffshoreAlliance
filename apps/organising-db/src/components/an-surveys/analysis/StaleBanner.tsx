"use client";

/**
 * Shown when the report's narrative was generated against a batch that is
 * no longer current. The figures on screen are always the current batch's
 * (the route recomputes them); only the prose is behind.
 */

import { format } from "date-fns";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export interface StaleBannerProps {
  /** Upload date of the batch the narrative was written against, if known. */
  reportBatchUploadedAt: string | null;
  /** When the narrative was generated — the fallback date. */
  generatedAt: string;
  /** A saved brief exists, so a one-click re-run is possible. */
  canRerun: boolean;
  canWrite: boolean;
  busy: boolean;
  onRerun: () => void;
  onStartOver: () => void;
  className?: string;
}

export function StaleBanner({
  reportBatchUploadedAt,
  generatedAt,
  canRerun,
  canWrite,
  busy,
  onRerun,
  onStartOver,
  className,
}: StaleBannerProps) {
  const date = reportBatchUploadedAt ?? generatedAt;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40",
        className
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
      <p className="min-w-48 flex-1">
        <span className="font-medium">Narrative reflects the upload of {format(new Date(date), "d MMM yyyy")}.</span>{" "}
        <span className="text-muted-foreground">
          The figures below are from the current data; the AI text has not been re-run since.
        </span>
      </p>
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          {canRerun && (
            <Button type="button" size="sm" disabled={busy} onClick={onRerun}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
              Re-run analysis
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onStartOver}>
            Start over
          </Button>
        </div>
      )}
    </div>
  );
}
