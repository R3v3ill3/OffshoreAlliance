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

/** Step 5 — dry-run preview with conflicts, then the post-apply summary. */
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
          <SummaryItem label="Entries recorded" value={result.ratings_applied} />
          <SummaryItem label="New entries" value={result.rows_created} />
          <SummaryItem label="Updated entries" value={result.rows_updated} />
          <SummaryItem label="Skipped rows" value={result.rows_skipped} />
          <SummaryItem label="Workers created" value={result.workers_created} />
          <SummaryItem label="Added to campaign" value={result.memberships_added} />
          {result.non_responders_marked > 0 && (
            <SummaryItem label="Non-responders marked" value={result.non_responders_marked} />
          )}
          {result.extra_ratings_applied > 0 && (
            <SummaryItem label="Extra assessment entries" value={result.extra_ratings_applied} />
          )}
          {result.contacts_promoted > 0 && (
            <SummaryItem label="Promoted to Contact" value={result.contacts_promoted} />
          )}
          {result.contacts_already_leader > 0 && (
            <SummaryItem label="Already Contact / Activist / Delegate" value={result.contacts_already_leader} />
          )}
        </dl>
        <p className="text-xs text-muted-foreground">
          The wall chart and list view have been refreshed. Select the
          assessment in the wall chart&apos;s assessment picker to see the
          imported ratings.
        </p>
      </div>
    );
  }

  if (!preview) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Ready to apply</h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
        <SummaryItem label="New entries" value={preview.to_create} />
        <SummaryItem label="Entries to update" value={preview.to_update} />
        <SummaryItem label="Rows skipped" value={preview.to_skip} />
        <SummaryItem label="Workers to create" value={preview.workers_to_create} />
        <SummaryItem label="Campaign additions" value={preview.memberships_to_add} />
        {preview.non_responder_count > 0 && (
          <SummaryItem label="Non-responders to mark" value={preview.non_responder_count} />
        )}
        {preview.extra_ratings_to_create + preview.extra_ratings_to_update > 0 && (
          <SummaryItem
            label="Extra assessment entries"
            value={preview.extra_ratings_to_create + preview.extra_ratings_to_update}
          />
        )}
        {preview.contacts_to_promote > 0 && (
          <SummaryItem label="Promote to Contact" value={preview.contacts_to_promote} />
        )}
        {preview.contacts_already_leader > 0 && (
          <SummaryItem
            label="Already Contact / Activist / Delegate"
            value={preview.contacts_already_leader}
          />
        )}
      </dl>

      {preview.extra_conflicts.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-500">
            {preview.extra_conflicts.length} extra-assessment{" "}
            {preview.extra_conflicts.length === 1 ? "entry" : "entries"} already exist
          </h4>
          <div className="max-h-48 overflow-y-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="p-2 font-medium">Worker</th>
                  <th className="p-2 font-medium">Assessment</th>
                  <th className="p-2 font-medium">Current</th>
                  <th className="p-2 font-medium">Imported</th>
                </tr>
              </thead>
              <tbody>
                {preview.extra_conflicts.map((c) => (
                  <tr key={c.key} className="border-b last:border-0">
                    <td className="p-2">{c.worker_name}</td>
                    <td className="p-2">{c.activity_label ?? "—"}</td>
                    <td className="p-2">
                      {describeValue(c.existing_rating, c.existing_binary_value)}
                    </td>
                    <td className="p-2">{describeValue(c.new_rating, c.new_binary_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {preview.conflicts.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-500">
            {preview.conflicts.length} existing{" "}
            {preview.conflicts.length === 1 ? "entry" : "entries"} will be{" "}
            {preview.to_update > 0 ? "updated" : "kept (fill-blanks mode)"}
          </h4>
          <div className="max-h-48 overflow-y-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="p-2 font-medium">Worker</th>
                  <th className="p-2 font-medium">Current</th>
                  <th className="p-2 font-medium">Imported</th>
                </tr>
              </thead>
              <tbody>
                {preview.conflicts.map((c) => (
                  <tr key={c.key} className="border-b last:border-0">
                    <td className="p-2">{c.worker_name}</td>
                    <td className="p-2">
                      {describeValue(c.existing_rating, c.existing_binary_value)}
                    </td>
                    <td className="p-2">{describeValue(c.new_rating, c.new_binary_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
