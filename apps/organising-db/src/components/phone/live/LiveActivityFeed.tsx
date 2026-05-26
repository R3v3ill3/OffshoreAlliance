"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Activity } from "lucide-react";

interface LiveActivityFeedProps {
  activity: { kind: "attempt" | "event"; at: string; label: string; detail: string }[];
}

/**
 * Newest-first combined feed of call attempts and share-form events,
 * scoped to the campaign. Roughly the same shape an organiser would expect
 * from a phone bank "war room".
 */
export function LiveActivityFeed({ activity }: LiveActivityFeedProps) {
  return (
    <Card>
      <CardContent className="p-3">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4" />
          Live activity
        </h3>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recent activity. Calls and share-link events will appear here as they happen.
          </p>
        ) : (
          <ol className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1 text-xs">
            {activity.map((row, idx) => (
              <li
                key={`${row.kind}:${row.at}:${idx}`}
                className="flex items-start gap-2 rounded border bg-muted/20 px-2 py-1.5"
              >
                <span
                  className={`mt-0.5 inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                    row.kind === "attempt" ? "bg-emerald-500" : "bg-blue-500"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{row.label}</span>
                  <span className="ml-2 text-muted-foreground">{row.detail}</span>
                </span>
                <time className="tabular-nums text-muted-foreground">
                  {new Date(row.at).toLocaleTimeString("en-AU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
