"use client";

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useConfirmUpcomingProjectMatch } from "@/lib/hooks/useConfirmUpcomingProjectMatch";
import type {
  MatchStatus,
  UpcomingProjectRow,
} from "@/lib/hooks/useUpcomingProjects";

interface Props {
  row: UpcomingProjectRow | null;
  isAdmin: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MatchReviewPanel({ row, isAdmin, open, onOpenChange }: Props) {
  const [notes, setNotes] = useState("");
  const confirmMutation = useConfirmUpcomingProjectMatch();

  if (!row) return null;
  const match = row.match;

  const submit = async (
    action: "confirm" | "override" | "reject" | "reopen",
    employerId?: number
  ) => {
    if (!match) return;
    await confirmMutation.mutateAsync({
      id: match.id,
      action,
      employer_id: employerId ?? null,
      notes: notes.trim() ? notes.trim() : null,
    });
    setNotes("");
    onOpenChange(false);
  };

  const sticky =
    match?.match_status === "confirmed" ||
    match?.match_status === "overridden" ||
    match?.match_status === "rejected";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{row.title ?? "Untitled activity"}</SheetTitle>
          <SheetDescription>
            {row.organisation ? `Scraped organisation: ${row.organisation}` : "No organisation listed."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jurisdiction" value={row.jurisdiction ?? "—"} />
            <Field label="Region code" value={row.region_code ?? "—"} />
            <Field label="Activity type" value={row.activity_type ?? "—"} />
            <Field label="Lifecycle" value={row.lifecycle_classification ?? "—"} />
            <Field label="Project name" value={row.project_name ?? "—"} />
            <Field label="Associated project" value={row.associated_project ?? "—"} />
            <Field label="Location" value={row.location_text ?? "—"} />
            <Field label="Status" value={row.status ?? "—"} />
            <Field label="Start date" value={row.start_date ?? "—"} />
            <Field label="End date" value={row.end_date ?? "—"} />
          </div>

          <div>
            <a
              href={row.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
            >
              View on NOPSEMA
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold mb-2">Employer match</h3>
            {!match && (
              <p className="text-muted-foreground">No match record yet — rescrape needed.</p>
            )}

            {match && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Status:</span>
                  <MatchStatusBadge status={match.match_status} />
                  {match.match_score !== null && (
                    <span className="text-xs text-muted-foreground">
                      Score {match.match_score.toFixed(3)}
                    </span>
                  )}
                </div>

                {match.matched_employer && (
                  <div className="rounded border bg-muted/30 p-3">
                    <div className="font-medium">{match.matched_employer.employer_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {match.matched_employer.employer_category ?? "uncategorised"}
                    </div>
                  </div>
                )}

                {match.candidate_proposals.length > 0 && !sticky && (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Top candidates</div>
                    {match.candidate_proposals.map((c) => (
                      <div
                        key={c.employer_id}
                        className="flex items-center justify-between rounded border p-2"
                      >
                        <div>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground flex gap-2">
                            <span>Score {c.score.toFixed(3)}</span>
                            {c.is_principal && (
                              <Badge variant="info" className="h-4 text-[10px]">
                                Principal
                              </Badge>
                            )}
                          </div>
                        </div>
                        {isAdmin && (
                          <Button
                            size="sm"
                            disabled={confirmMutation.isPending}
                            onClick={() => void submit("confirm", c.employer_id)}
                          >
                            Confirm
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {isAdmin && (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Optional admin note (visible to other admins)"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="min-h-[60px]"
                    />
                    <div className="flex flex-wrap gap-2">
                      {!sticky && match.match_status !== "unmatched" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={confirmMutation.isPending}
                          onClick={() => void submit("reject")}
                        >
                          Mark unmatchable
                        </Button>
                      )}
                      {sticky && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={confirmMutation.isPending}
                          onClick={() => void submit("reopen")}
                        >
                          Reopen for review
                        </Button>
                      )}
                      {confirmMutation.isPending && (
                        <span className="inline-flex items-center text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Saving…
                        </span>
                      )}
                    </div>
                    {confirmMutation.isError && (
                      <p className="text-xs text-destructive">
                        {(confirmMutation.error as Error).message}
                      </p>
                    )}
                  </div>
                )}

                {!isAdmin && (
                  <p className="text-xs text-muted-foreground">
                    Match decisions can only be made by admins.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium break-words">{value}</div>
    </div>
  );
}

function MatchStatusBadge({ status }: { status: MatchStatus }) {
  switch (status) {
    case "auto":
      return <Badge variant="success">Auto</Badge>;
    case "confirmed":
      return <Badge variant="success">Confirmed</Badge>;
    case "needs_review":
      return <Badge variant="warning">Needs review</Badge>;
    case "unmatched":
      return <Badge variant="destructive">Unmatched</Badge>;
    case "overridden":
      return <Badge variant="info">Overridden</Badge>;
    case "rejected":
      return <Badge variant="outline">Rejected</Badge>;
    default:
      return <Badge variant="outline">{String(status)}</Badge>;
  }
}
