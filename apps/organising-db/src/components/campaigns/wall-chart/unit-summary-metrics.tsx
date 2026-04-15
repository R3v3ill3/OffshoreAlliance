"use client";

import { pctOrDash, type WallChartMetrics } from "./metrics";

export type DisplayMode = "pct" | "count";

export type UnitSummaryMetricsProps = {
  metrics: WallChartMetrics;
  mode: DisplayMode;
  /** Compact layout for per-unit cards (single row chips). */
  compact?: boolean;
  participationLabel?: string;
};

type MetricCell = {
  label: string;
  value: number;
  /** When null, use `total` as denominator for % display. */
  denominator?: number;
};

export function UnitSummaryMetrics({
  metrics,
  mode,
  compact,
  participationLabel,
}: UnitSummaryMetricsProps) {
  const cells: MetricCell[] = [
    { label: "Members", value: metrics.members },
    { label: "Delegates", value: metrics.delegates },
    { label: "Activists", value: metrics.activists },
    { label: "Contacts", value: metrics.contacts },
    { label: "HSRs", value: metrics.hsrs },
    { label: "Bargaining reps", value: metrics.bargainingReps },
  ];

  const formatValue = (value: number, denom: number): string => {
    if (mode === "pct") return pctOrDash(value, denom);
    return String(value);
  };

  const containerClass = compact
    ? "flex flex-wrap gap-1.5"
    : "grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2";

  return (
    <div className="space-y-2">
      <div className={containerClass}>
        {cells.map((c) => (
          <MetricChip
            key={c.label}
            label={c.label}
            value={formatValue(c.value, c.denominator ?? metrics.total)}
            raw={c.value}
            compact={compact}
          />
        ))}
      </div>
      <div className={compact ? "flex flex-wrap gap-1.5" : "grid grid-cols-2 sm:grid-cols-3 gap-2"}>
        <MetricChip
          label="Avg rating"
          value={metrics.avgCumulative != null ? metrics.avgCumulative.toFixed(1) : "—"}
          raw={metrics.ratedCount}
          compact={compact}
          hint={
            metrics.ratedCount
              ? `${metrics.ratedCount} / ${metrics.total} rated`
              : `0 rated`
          }
        />
        <MetricChip
          label={participationLabel ?? "Participation"}
          value={formatValue(metrics.participationCount, metrics.participationTotal)}
          raw={metrics.participationCount}
          compact={compact}
          hint={`${metrics.participationCount} / ${metrics.participationTotal}`}
        />
        <MetricChip
          label="Workers"
          value={String(metrics.total)}
          raw={metrics.total}
          compact={compact}
        />
      </div>
    </div>
  );
}

function MetricChip({
  label,
  value,
  raw,
  compact,
  hint,
}: {
  label: string;
  value: string;
  raw: number;
  compact?: boolean;
  hint?: string;
}) {
  const tooltip = hint ?? `${raw}`;
  if (compact) {
    return (
      <span
        title={tooltip}
        className="inline-flex items-baseline gap-1 rounded border bg-background px-1.5 py-0.5 text-[11px]"
      >
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </span>
    );
  }
  return (
    <div
      title={tooltip}
      className="rounded border bg-background px-2 py-1.5 flex flex-col gap-0.5"
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
