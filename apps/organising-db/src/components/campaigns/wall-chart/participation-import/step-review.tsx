"use client";

import { CheckCircle2 } from "lucide-react";
import { RATING_LEVELS } from "@/types/planner-types";
import type { ParticipationImportController } from "./use-participation-import";

function describeValue(rating: number | null, binary: string | null): string {
  if (binary != null) return binary;
  if (rating != null) {
    const level = RATING_LEVELS.find((l) => l.value === rating);
    return level ? `${rating} — ${level.label}` : String(rating);
  }
  return "—";
}

/** Step 4 — dry-run preview with per-assessment conflicts, then the result. */
export function StepReview({ controller }: { controller: ParticipationImportController }) {
  const { preview, result } = controller;

  if (result) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-emerald-600">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
          <h3 className="text-sm font-semibold">Import complete</h3>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
          <SummaryItem label="Workers created" value={result.workers_created} />
          <SummaryItem label="Added to campaign" value={result.memberships_added} />
          <SummaryItem label="Rows skipped" value={result.rows_skipped} />
        </dl>
        <div className="space-y-2">
          {result.per_assessment.map((a) => (
            <div key={a.ref} className="rounded-md border p-3">
              <h4 className="text-xs font-semibold">{a.title}</h4>
              <dl className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                <SummaryItem label="Entries recorded" value={a.ratings_applied} />
                <SummaryItem label="New" value={a.rows_created} />
                <SummaryItem label="Updated" value={a.rows_updated} />
                {a.conflicts_kept > 0 && (
                  <SummaryItem label="Kept (fill blanks)" value={a.conflicts_kept} />
                )}
                {a.non_responders_marked > 0 && (
                  <SummaryItem label="Non-responders marked" value={a.non_responders_marked} />
                )}
              </dl>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          The wall chart and list view have been refreshed. Pick the assessments
          in the wall chart&apos;s assessment selector to see the imported data.
          Verbatim answers kept as notes appear in each worker&apos;s rating
          history.
        </p>
      </div>
    );
  }

  if (!preview) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Ready to apply</h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
        <SummaryItem label="Workers to create" value={preview.workers_to_create} />
        <SummaryItem label="Campaign additions" value={preview.memberships_to_add} />
        <SummaryItem label="Rows skipped" value={preview.rows_skipped} />
      </dl>

      <div className="space-y-3">
        {preview.per_assessment.map((a) => (
          <div key={a.ref} className="space-y-1.5 rounded-md border p-3">
            <h4 className="text-xs font-semibold">{a.title}</h4>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              <SummaryItem label="New entries" value={a.to_create} />
              <SummaryItem label="To update" value={a.to_update} />
              {a.conflicts_kept > 0 && (
                <SummaryItem label="Kept (fill blanks)" value={a.conflicts_kept} />
              )}
              {a.non_responder_count > 0 && (
                <SummaryItem label="Non-responders to mark" value={a.non_responder_count} />
              )}
            </dl>
            {a.conflicts.length > 0 && (
              <div className="space-y-1">
                <h5 className="text-[11px] font-semibold text-amber-700 dark:text-amber-500">
                  {a.conflicts.length} existing{" "}
                  {a.conflicts.length === 1 ? "entry" : "entries"} will be{" "}
                  {a.to_update > 0 ? "updated" : "kept (fill-blanks mode)"}
                </h5>
                <div className="max-h-40 overflow-y-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left">
                        <th className="p-2 font-medium">Worker</th>
                        <th className="p-2 font-medium">Current</th>
                        <th className="p-2 font-medium">Imported</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.conflicts.map((c) => (
                        <tr key={c.key} className="border-b last:border-0">
                          <td className="p-2">{c.worker_name}</td>
                          <td className="p-2">
                            {describeValue(c.existing_rating, c.existing_binary_value)}
                          </td>
                          <td className="p-2">
                            {describeValue(c.new_rating, c.new_binary_value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
