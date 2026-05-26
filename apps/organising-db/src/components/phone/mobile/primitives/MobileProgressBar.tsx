"use client";

interface MobileProgressBarProps {
  /** Number of completed / skipped items in this list. */
  completed: number;
  /** Total items in the list. */
  total: number;
  /** Optional secondary tally for "your contributions" tracking. */
  callerCompleted?: number;
}

/**
 * Slim progress bar shown on queue and contact screens. Communicates list-wide
 * progress (primary) and optionally the caller's own contribution (secondary).
 */
export function MobileProgressBar({ completed, total, callerCompleted }: MobileProgressBarProps) {
  const safeTotal = Math.max(total, 1);
  const completedPct = Math.min(100, Math.round((completed / safeTotal) * 100));
  const callerPct =
    callerCompleted != null
      ? Math.min(100, Math.round((callerCompleted / safeTotal) * 100))
      : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium tabular-nums">
          {completed} of {total} done
        </span>
        <span className="text-muted-foreground tabular-nums">{completedPct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={completedPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Call list ${completedPct}% complete`}
        className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-300"
          style={{ width: `${completedPct}%` }}
        />
        {callerPct != null ? (
          <div
            className="absolute inset-y-0 left-0 border-r-2 border-emerald-500"
            style={{ width: `${callerPct}%` }}
            aria-label={`Your share: ${callerPct}%`}
          />
        ) : null}
      </div>
      {callerCompleted != null ? (
        <p className="text-[11px] text-muted-foreground tabular-nums">
          You: <span className="font-semibold text-emerald-700">{callerCompleted}</span> · Team: {completed - callerCompleted}
        </p>
      ) : null}
    </div>
  );
}
