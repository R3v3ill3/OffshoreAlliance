"use client";

import { pctOrDash, type WallChartMetrics } from "./metrics";

export type DisplayMode = "pct" | "count";

export type UnitSummaryMetricsProps = {
  metrics: WallChartMetrics;
  mode: DisplayMode;
  /** Compact layout for per-unit cards (single row chips). */
  compact?: boolean;
  participationLabel?: string;
  /** Title of the selected assessment — when present, replaces the cumulative metrics. */
  assessmentTitle?: string | null;
};

type MetricCell = {
  label: string;
  value: number;
  /** When null, use `total` as denominator for % display. */
  denominator?: number;
  /** Render with emerald OA-member styling. */
  highlight?: boolean;
};

function formatLeadershipRatioCompact(leadershipTotal: number, total: number): string {
  if (leadershipTotal === 0) return "—";
  if (total === 0) return `${leadershipTotal}`;
  const ratio = Math.round(total / leadershipTotal);
  return `1:${ratio}`;
}

/** Thin stacked rating bar for compact unit card summaries. */
function CompactRatingsBar({ buckets, total }: { buckets: WallChartMetrics["ratingBuckets"]; total: number }) {
  if (total === 0) return null;
  const segments: { key: string; count: number; cls: string; label: string }[] = [
    { key: "r1", count: buckets.r1, cls: "bg-sky-500", label: "Rating 1" },
    { key: "r2", count: buckets.r2, cls: "bg-emerald-500", label: "Rating 2" },
    { key: "r3", count: buckets.r3, cls: "bg-amber-500", label: "Rating 3" },
    { key: "r4", count: buckets.r4, cls: "bg-red-500", label: "Rating 4–5" },
    { key: "unrated", count: buckets.unrated, cls: "bg-zinc-300 dark:bg-zinc-600", label: "Unrated" },
  ].filter((s) => s.count > 0);

  if (segments.length === 0) return null;

  const tooltip = segments
    .map((s) => `${s.label}: ${s.count} (${Math.round((s.count / total) * 100)}%)`)
    .join(" | ");

  return (
    <div
      className="flex w-full h-[6px] overflow-hidden rounded"
      title={tooltip}
      aria-label="Rating distribution"
    >
      {segments.map((s) => (
        <div
          key={s.key}
          className={`${s.cls} flex-shrink-0`}
          style={{ width: `${(s.count / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

export function UnitSummaryMetrics({
  metrics,
  mode,
  compact,
  participationLabel,
  assessmentTitle,
}: UnitSummaryMetricsProps) {
  const formatValue = (value: number, denom: number): string => {
    if (mode === "pct") return pctOrDash(value, denom);
    return String(value);
  };

  const containerClass = compact
    ? "flex flex-wrap gap-1.5"
    : "grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2";

  // Assessment view: show assessment-scoped metrics in place of the
  // membership/cumulative block.
  if (assessmentTitle && metrics.assessment) {
    const am = metrics.assessment;
    return (
      <div className="space-y-1.5">
        {compact && (
          <CompactRatingsBar buckets={metrics.ratingBuckets} total={metrics.total} />
        )}
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Assessment: <span className="text-foreground font-medium">{assessmentTitle}</span>
        </p>
        <div className={compact ? "flex flex-wrap gap-1.5" : "grid grid-cols-2 sm:grid-cols-4 gap-2"}>
          {am.isBinary ? (
            <>
              <MetricChip
                label="Supportive"
                value={
                  am.binaryTotalRated > 0
                    ? `${am.binarySupportiveCount}/${am.binaryTotalRated}`
                    : "—"
                }
                raw={am.binarySupportiveCount}
                compact={compact}
                hint={`${am.binarySupportiveCount} of ${am.binaryTotalRated} rated`}
              />
              <MetricChip
                label="Rated"
                value={`${am.binaryTotalRated} / ${metrics.total}`}
                raw={am.binaryTotalRated}
                compact={compact}
              />
              <MetricChip
                label="Unassessed"
                value={formatValue(metrics.total - am.binaryTotalRated, metrics.total)}
                raw={metrics.total - am.binaryTotalRated}
                compact={compact}
              />
            </>
          ) : (
            <>
              <MetricChip
                label="Avg"
                value={am.avgRating != null ? am.avgRating.toFixed(1) : "—"}
                raw={am.ratedCount}
                compact={compact}
                hint={`${am.ratedCount} of ${metrics.total} rated`}
              />
              <MetricChip
                label="Supportive"
                value={formatValue(am.supportiveCount, am.ratedCount)}
                raw={am.supportiveCount}
                compact={compact}
                hint={`${am.supportiveCount} of ${am.ratedCount} rated`}
              />
              <MetricChip
                label="Opposed"
                value={formatValue(am.opposedCount, am.ratedCount)}
                raw={am.opposedCount}
                compact={compact}
                hint={`${am.opposedCount} of ${am.ratedCount} rated`}
              />
              <MetricChip
                label="Rated"
                value={`${am.ratedCount} / ${metrics.total}`}
                raw={am.ratedCount}
                compact={compact}
              />
            </>
          )}
        </div>
        {compact && (
          <CompactMappingChips metrics={metrics} />
        )}
      </div>
    );
  }

  const cells: MetricCell[] = [
    { label: "Members", value: metrics.members },
    { label: "OA Members", value: metrics.oaMembers, highlight: true },
    { label: "Delegates", value: metrics.delegates },
    { label: "Activists", value: metrics.activists },
    { label: "Contacts", value: metrics.contacts },
    { label: "HSRs", value: metrics.hsrs },
    { label: "Bargaining reps", value: metrics.bargainingReps },
  ];

  return (
    <div className="space-y-2">
      {compact && (
        <>
          <CompactRatingsBar buckets={metrics.ratingBuckets} total={metrics.total} />
          <CompactMappingChips metrics={metrics} />
        </>
      )}
      <div className={containerClass}>
        {cells.map((c) => (
          <MetricChip
            key={c.label}
            label={c.label}
            value={formatValue(c.value, c.denominator ?? metrics.total)}
            raw={c.value}
            compact={compact}
            highlight={c.highlight}
            hint={c.label === "OA Members" ? `${c.value} financial or pending OA members` : undefined}
          />
        ))}
      </div>
      {metrics.nonOaUnionCounts.length > 0 && (
        <div className={compact ? "flex flex-wrap gap-1" : "flex flex-wrap gap-1.5"}>
          {metrics.nonOaUnionCounts.map((e) => (
            <span
              key={e.initials}
              title="Non-OA members with union recorded"
              className={`inline-flex items-baseline gap-1 rounded border border-sky-800/40 bg-sky-950/20 px-1.5 py-0.5 tabular-nums ${
                compact ? "text-[10px]" : "text-xs"
              }`}
            >
              <span className="font-semibold text-sky-100">{e.initials}</span>
              <span className="text-muted-foreground">—</span>
              <span className="font-medium">{e.count}</span>
            </span>
          ))}
        </div>
      )}
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

/** Phone / email / leadership ratio / networks chips — compact unit cards only. */
function CompactMappingChips({ metrics }: { metrics: WallChartMetrics }) {
  const t = metrics.total;
  const leadershipTotal = metrics.delegates + metrics.activists + metrics.contacts;
  return (
    <div className="flex flex-wrap gap-1">
      <span
        title={`${metrics.phoneCount} of ${t} workers have a phone number`}
        className="inline-flex items-baseline gap-1 rounded border bg-background px-1.5 py-0.5 text-[10px]"
      >
        <span className="text-muted-foreground">Ph</span>
        <span className="font-semibold tabular-nums">{pctOrDash(metrics.phoneCount, t)}</span>
      </span>
      <span
        title={`${metrics.emailCount} of ${t} workers have an email address`}
        className="inline-flex items-baseline gap-1 rounded border bg-background px-1.5 py-0.5 text-[10px]"
      >
        <span className="text-muted-foreground">Em</span>
        <span className="font-semibold tabular-nums">{pctOrDash(metrics.emailCount, t)}</span>
      </span>
      <span
        title={`${leadershipTotal} leader${leadershipTotal !== 1 ? "s" : ""} (delegates + activists + contacts) of ${t} workers`}
        className="inline-flex items-baseline gap-1 rounded border bg-background px-1.5 py-0.5 text-[10px]"
      >
        <span className="text-muted-foreground">Lead</span>
        <span className="font-semibold tabular-nums">
          {formatLeadershipRatioCompact(leadershipTotal, t)}
        </span>
      </span>
      {metrics.multiUnitCount > 0 && (
        <span
          title={`${metrics.multiUnitCount} of ${t} workers also belong to other organising units`}
          className="inline-flex items-baseline gap-1 rounded border bg-background px-1.5 py-0.5 text-[10px]"
        >
          <span className="text-muted-foreground">Net</span>
          <span className="font-semibold tabular-nums">{pctOrDash(metrics.multiUnitCount, t)}</span>
        </span>
      )}
    </div>
  );
}

function MetricChip({
  label,
  value,
  raw,
  compact,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  raw: number;
  compact?: boolean;
  hint?: string;
  highlight?: boolean;
}) {
  const tooltip = hint ?? `${raw}`;
  if (compact) {
    return (
      <span
        title={tooltip}
        className={`inline-flex items-baseline gap-1 rounded border px-1.5 py-0.5 text-[11px] ${
          highlight
            ? "border-emerald-500/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300"
            : "bg-background"
        }`}
      >
        <span className={highlight ? "text-emerald-700 dark:text-emerald-400 font-medium" : "text-muted-foreground"}>{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </span>
    );
  }
  return (
    <div
      title={tooltip}
      className={`rounded border px-2 py-1.5 flex flex-col gap-0.5 ${
        highlight
          ? "border-emerald-500/60 bg-emerald-50 dark:bg-emerald-950/30"
          : "bg-background"
      }`}
    >
      <span className={`text-[10px] uppercase tracking-wide ${highlight ? "text-emerald-700 dark:text-emerald-400 font-semibold" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${highlight ? "text-emerald-900 dark:text-emerald-200" : ""}`}>{value}</span>
    </div>
  );
}
