"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useConfirmUpcomingProjectMatch } from "@/lib/hooks/useConfirmUpcomingProjectMatch";
import { useEmployerSearch } from "@/lib/hooks/useEmployerSearch";
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [trackedRowId, setTrackedRowId] = useState<number | undefined>(row?.id);
  const confirmMutation = useConfirmUpcomingProjectMatch();
  const employerSearch = useEmployerSearch(debouncedSearch);

  // Reset transient state when the displayed row changes (using the
  // documented React pattern for prop-derived state — avoids an effect).
  if (row?.id !== trackedRowId) {
    setTrackedRowId(row?.id);
    setSearchOpen(false);
    setSearchInput("");
    setDebouncedSearch("");
    setNotes("");
  }

  // Debounce search-input → server query.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSearchOpen(false);
      setSearchInput("");
      setDebouncedSearch("");
      setNotes("");
    }
    onOpenChange(next);
  };

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
    setSearchOpen(false);
    setSearchInput("");
    setDebouncedSearch("");
    onOpenChange(false);
  };

  const sticky =
    match?.match_status === "confirmed" ||
    match?.match_status === "overridden" ||
    match?.match_status === "rejected";

  const seedSearchFromOrganisation = () => {
    setSearchInput(row.organisation ?? "");
    setSearchOpen(true);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{row.title ?? "Untitled activity"}</SheetTitle>
          <SheetDescription>
            {row.organisation
              ? `Scraped organisation: ${row.organisation}`
              : "No organisation listed."}
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
              <p className="text-muted-foreground">
                No match record yet — rescrape needed.
              </p>
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
                    <div className="text-xs text-muted-foreground">
                      Currently linked
                    </div>
                    <div className="font-medium">
                      {match.matched_employer.employer_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {match.matched_employer.employer_category ?? "uncategorised"}
                    </div>
                  </div>
                )}

                {match.candidate_proposals.length > 0 && !sticky && (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      Auto-suggested candidates
                    </div>
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

                {/* Override / pick-different-employer search */}
                {isAdmin && (
                  <div className="space-y-2">
                    {!searchOpen ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={confirmMutation.isPending}
                        onClick={seedSearchFromOrganisation}
                      >
                        <Search className="h-3.5 w-3.5 mr-2" />
                        {match.matched_employer
                          ? "Pick a different employer"
                          : "Search for an employer"}
                      </Button>
                    ) : (
                      <div className="rounded border p-2 space-y-2 bg-muted/20">
                        <div className="flex items-center gap-2">
                          <Input
                            autoFocus
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Type at least 2 letters of an employer name…"
                            className="h-8"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSearchOpen(false);
                              setSearchInput("");
                              setDebouncedSearch("");
                            }}
                            aria-label="Close search"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="max-h-64 overflow-y-auto space-y-1">
                          {debouncedSearch.length < 2 && (
                            <p className="text-xs text-muted-foreground px-1">
                              Searches `employer_name` and `trading_name`.
                            </p>
                          )}
                          {employerSearch.isFetching && debouncedSearch.length >= 2 && (
                            <p className="text-xs text-muted-foreground px-1 inline-flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                            </p>
                          )}
                          {employerSearch.data?.length === 0 &&
                            !employerSearch.isFetching && (
                              <p className="text-xs text-muted-foreground px-1">
                                No matches.
                              </p>
                            )}
                          {(employerSearch.data ?? []).map((e) => (
                            <button
                              key={e.employer_id}
                              type="button"
                              onClick={() =>
                                void submit("override", e.employer_id)
                              }
                              className="w-full text-left rounded px-2 py-1.5 hover:bg-accent flex items-center justify-between gap-2 disabled:opacity-50"
                              disabled={confirmMutation.isPending}
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">
                                  {e.employer_name}
                                </div>
                                {e.trading_name &&
                                  e.trading_name !== e.employer_name && (
                                    <div className="text-[11px] text-muted-foreground truncate">
                                      Trading as {e.trading_name}
                                    </div>
                                  )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {e.employer_category === "Principal_Employer" && (
                                  <Badge variant="info" className="h-4 text-[9px]">
                                    PE
                                  </Badge>
                                )}
                                <span className="text-[11px] text-muted-foreground">
                                  {e.employer_category ?? "—"}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

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
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />{" "}
                          Saving…
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
