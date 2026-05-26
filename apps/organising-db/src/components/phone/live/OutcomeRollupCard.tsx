"use client";

import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { OUTCOME_META, type OutcomeClassification } from "@/lib/phone/outcome-model";
import { tokens as dialerTokens } from "@/lib/ui/dialer-tokens";

interface OutcomeRollupCardProps {
  outcomes: Record<string, number>;
  /** Drill into the attempts that produced this outcome bucket. */
  onSelect?: (outcomeKey: string, label: string) => void;
}

const SENTIMENT_ORDER: Record<string, number> = {
  positive: 0,
  neutral: 1,
  negative: 2,
  operational: 3,
};

export function OutcomeRollupCard({ outcomes, onSelect }: OutcomeRollupCardProps) {
  const total = Object.values(outcomes).reduce((sum, n) => sum + n, 0);
  const rows = Object.entries(outcomes)
    .map(([key, count]) => {
      const meta = OUTCOME_META[key as OutcomeClassification];
      return {
        key,
        label: meta?.label ?? key.replace(/_/g, " "),
        sentiment: meta?.sentiment ?? "neutral",
        count,
        share: total > 0 ? (count / total) * 100 : 0,
      };
    })
    .sort((a, b) => {
      const aOrder = SENTIMENT_ORDER[a.sentiment] ?? 10;
      const bOrder = SENTIMENT_ORDER[b.sentiment] ?? 10;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return b.count - a.count;
    });

  return (
    <Card>
      <CardContent className="p-3">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <BarChart3 className="h-4 w-4" />
          Outcomes (last 24h)
        </h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No outcomes recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.key} className="space-y-1">
                <button
                  type="button"
                  onClick={() => onSelect?.(row.key, row.label)}
                  disabled={!onSelect || row.key === "unknown"}
                  className="flex w-full items-baseline justify-between gap-2 rounded text-left disabled:cursor-default disabled:opacity-100 enabled:hover:bg-muted/40 enabled:px-1"
                >
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      dialerTokens.sentiment[row.sentiment as keyof typeof dialerTokens.sentiment] ?? ""
                    }`}
                  >
                    {row.label}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {row.count} ({row.share.toFixed(0)}%)
                  </span>
                </button>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${
                      row.sentiment === "positive"
                        ? "bg-emerald-500"
                        : row.sentiment === "negative"
                          ? "bg-rose-500"
                          : row.sentiment === "operational"
                            ? "bg-amber-500"
                            : "bg-slate-500"
                    }`}
                    style={{ width: `${row.share}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
