"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Bell, AlertTriangle, CheckCircle, Clock } from "lucide-react";

interface NudgesCardProps {
  header: {
    total_contacts: number;
    completed: number;
    in_progress: number;
    abandoned_claims: number;
  };
  callers: { id: string; label: string | null; idle_minutes: number | null; current_claim_item_id: number | null }[];
  lists: { list_id: number; name: string; total_items: number | null; completed_items: number | null }[];
}

interface Nudge {
  id: string;
  severity: "info" | "warn" | "ok";
  icon: React.ReactNode;
  title: string;
  detail: string;
}

const IDLE_NUDGE_THRESHOLD_MIN = 15;
const NEAR_COMPLETION_PCT = 90;

/**
 * Surface a handful of actionable nudges so the coordinator doesn't have to
 * scan every tile. Severity ordering: warn > info > ok.
 */
export function NudgesCard({ header, callers, lists }: NudgesCardProps) {
  const nudges: Nudge[] = [];

  // Idle callers still holding a claim.
  const idle = callers.filter(
    (c) =>
      c.current_claim_item_id &&
      c.idle_minutes != null &&
      c.idle_minutes >= IDLE_NUDGE_THRESHOLD_MIN,
  );
  for (const caller of idle) {
    nudges.push({
      id: `idle:${caller.id}`,
      severity: "warn",
      icon: <AlertTriangle className="h-4 w-4" />,
      title: `${caller.label ?? "A caller"} has been idle ${caller.idle_minutes}m`,
      detail: "They are still holding an active contact. Force-release if they have stopped.",
    });
  }

  if (header.abandoned_claims > 0) {
    nudges.push({
      id: "abandoned",
      severity: "warn",
      icon: <AlertTriangle className="h-4 w-4" />,
      title: `${header.abandoned_claims} abandoned claim${header.abandoned_claims === 1 ? "" : "s"}`,
      detail: "Claims held longer than 10 minutes. They will auto-release at the 15-minute TTL.",
    });
  }

  for (const list of lists) {
    const total = list.total_items ?? 0;
    const completed = list.completed_items ?? 0;
    if (total > 0) {
      const pct = (completed / total) * 100;
      if (pct >= NEAR_COMPLETION_PCT && pct < 100) {
        nudges.push({
          id: `near-complete:${list.list_id}`,
          severity: "info",
          icon: <Clock className="h-4 w-4" />,
          title: `${list.name} is ${Math.round(pct)}% complete`,
          detail: `${total - completed} contact${total - completed === 1 ? "" : "s"} to go — consider increasing caller count.`,
        });
      }
      if (pct === 100) {
        nudges.push({
          id: `complete:${list.list_id}`,
          severity: "ok",
          icon: <CheckCircle className="h-4 w-4" />,
          title: `${list.name} is complete`,
          detail: "Archive or close out the list to keep the dashboard tidy.",
        });
      }
    }
  }

  return (
    <Card>
      <CardContent className="p-3">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Bell className="h-4 w-4" />
          Nudges
          {nudges.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 text-[10px] font-bold text-amber-800">
              {nudges.length}
            </span>
          ) : null}
        </h3>
        {nudges.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Everything looks healthy. We&apos;ll surface idle callers and near-complete lists here.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {nudges
              .slice()
              .sort((a, b) => {
                const order = { warn: 0, info: 1, ok: 2 } as const;
                return order[a.severity] - order[b.severity];
              })
              .map((nudge) => (
                <li
                  key={nudge.id}
                  className={`flex items-start gap-2 rounded border px-2 py-1.5 text-xs ${
                    nudge.severity === "warn"
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : nudge.severity === "info"
                        ? "border-blue-300 bg-blue-50 text-blue-900"
                        : "border-emerald-300 bg-emerald-50 text-emerald-900"
                  }`}
                >
                  <span className="mt-0.5">{nudge.icon}</span>
                  <span>
                    <span className="font-medium">{nudge.title}</span>
                    <span className="ml-1 text-[11px] opacity-80">{nudge.detail}</span>
                  </span>
                </li>
              ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
