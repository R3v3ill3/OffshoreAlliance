"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ArrowRight, Loader2, RotateCcw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useDecideNameMatch,
  type DecideNameMatchInput,
  type DecideNameMatchResult,
  type NameCreatePayload,
  type NameDecisionAction,
} from "@/lib/hooks/useDecideNameMatch";
import type { NameEntitySearchHit } from "@/lib/hooks/useNameEntitySearch";
import type { NameReviewRow, NameReviewStatus } from "@/lib/hooks/useNameMatchReviews";
import { CreateNewDialog } from "./create-new-dialog";
import { EntitySearch } from "./entity-search";

const STATUS_VARIANTS: Record<NameReviewStatus, "success" | "warning" | "destructive" | "info" | "outline"> = {
  auto: "success",
  confirmed: "success",
  needs_review: "warning",
  unmatched: "destructive",
  overridden: "info",
  rejected: "outline",
};

const STATUS_LABELS: Record<NameReviewStatus, string> = {
  auto: "Auto-matched",
  confirmed: "Confirmed",
  needs_review: "Needs review",
  unmatched: "Unmatched",
  overridden: "Mapped by search",
  rejected: "Rejected",
};

const METHOD_LABELS: Record<string, string> = {
  fuzzy: "fuzzy match",
  manual: "search",
  created: "created new",
  exact: "exact",
  alias: "alias",
};

export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd MMM yyyy");
  } catch {
    return d;
  }
}

export interface DecisionReport {
  rawName: string;
  action: NameDecisionAction;
  result: DecideNameMatchResult;
}

interface Props {
  row: NameReviewRow;
  isAdmin: boolean;
  deciderName: string | null;
  onDecided: (report: DecisionReport) => void;
}

export function ReviewRow({ row, isAdmin, deciderName, onDecided }: Props) {
  const decide = useDecideNameMatch();
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const entityNoun = row.entity === "employer" ? "employer" : "worksite";
  const otherLabel = row.entity === "employer" ? "Worksite in file" : "Employer in file";
  const isOpen = row.status === "needs_review" || row.status === "unmatched";
  const isAuto = row.status === "auto";
  const autoTargetId = row.entity === "employer" ? row.resolved_employer_id : row.resolved_worksite_id;
  const decided = row.status === "confirmed" || row.status === "overridden" || row.status === "rejected";
  const resolvedName =
    row.entity === "employer" ? row.employers?.employer_name : row.worksites?.worksite_name;
  const otherRaw = row.source_context.other_raw_name;
  const errorMessage = decide.isError ? decide.error.message : null;

  const run = (input: Omit<DecideNameMatchInput, "id" | "notes">) => {
    decide.mutate(
      { id: row.id, notes: notes.trim() || null, ...input },
      {
        onSuccess: (result) => {
          setSearchOpen(false);
          setCreateOpen(false);
          setNotes("");
          onDecided({ rawName: row.raw_name, action: input.action, result });
        },
      }
    );
  };

  const target = (id: number) =>
    row.entity === "employer" ? { employer_id: id } : { worksite_id: id };

  const pick = (hit: NameEntitySearchHit) => run({ action: "override", ...target(hit.id) });
  const create = (payload: NameCreatePayload) => run({ action: "create", create: payload });

  return (
    <li className="rounded-lg border p-4 space-y-3" data-testid={`name-review-${row.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold break-words">{row.raw_name}</span>
            <Badge variant={STATUS_VARIANTS[row.status] ?? "outline"}>
              {STATUS_LABELS[row.status] ?? row.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {row.occurrences} row{row.occurrences === 1 ? "" : "s"}
            </span>
          </div>
          {otherRaw && (
            <div className="text-xs text-muted-foreground">
              {otherLabel}: <span className="text-foreground">{otherRaw}</span>
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            {row.import_logs
              ? `Import: ${row.import_logs.file_name} · ${formatDate(row.import_logs.imported_at)}`
              : `Queued ${formatDate(row.created_at)}`}
          </div>
        </div>
        {decided && (
          <div className="text-xs text-muted-foreground text-right">
            Decided {formatDate(row.decided_at)}
            {deciderName ? ` by ${deciderName}` : ""}
          </div>
        )}
      </div>

      {resolvedName && (
        <div className="flex items-center gap-2 text-sm">
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span>
            Mapped to <span className="font-medium">{resolvedName}</span>
          </span>
          {row.match_method && (
            <span className="text-xs text-muted-foreground">
              ({METHOD_LABELS[row.match_method] ?? row.match_method}
              {row.match_score != null ? `, score ${row.match_score.toFixed(3)}` : ""})
            </span>
          )}
        </div>
      )}
      {row.notes && <div className="text-xs text-muted-foreground">Note: {row.notes}</div>}

      {row.candidate_proposals.length > 0 && isOpen && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Suggested {entityNoun}s</div>
          {row.candidate_proposals.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 rounded border px-2 py-1.5"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>Score {p.score.toFixed(3)}</span>
                  {p.is_principal && (
                    <Badge variant="info" className="h-4 text-[10px]">
                      Principal
                    </Badge>
                  )}
                </div>
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  disabled={decide.isPending}
                  onClick={() => run({ action: "confirm", ...target(p.id) })}
                  aria-label={`Confirm ${p.name}`}
                >
                  Confirm
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {row.candidate_proposals.length === 0 && row.status === "unmatched" && (
        <div className="text-xs text-muted-foreground">
          No existing {entityNoun} scored high enough to suggest.
        </div>
      )}

      {/* Auto rows (review round 2, §8 D23): the alias was written on import.
          Only confirm that target or reject; mapping elsewhere would hit the
          decision function's ambiguity guard (409) until DA1.4. */}
      {isAdmin && isAuto && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            The alias was already written on import. Re-pointing an alias to a different{" "}
            {entityNoun} is handled later (DA1.4).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note"
              aria-label="Decision note"
              className="h-8 max-w-sm"
            />
            {autoTargetId != null && (
              <Button
                size="sm"
                disabled={decide.isPending}
                onClick={() => run({ action: "confirm", ...target(autoTargetId) })}
                aria-label={`Confirm ${resolvedName ?? "auto match"}`}
              >
                Confirm
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={decide.isPending}
              onClick={() => run({ action: "reject" })}
            >
              Reject (not {row.entity === "employer" ? "an employer" : "a worksite"})
            </Button>
            {decide.isPending && (
              <span className="inline-flex items-center text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Saving…
              </span>
            )}
          </div>
        </div>
      )}

      {isAdmin && isOpen && (
        <div className="space-y-2">
          {searchOpen ? (
            <EntitySearch
              entity={row.entity}
              rawName={row.raw_name}
              disabled={decide.isPending}
              onPick={pick}
              onCreate={() => {
                decide.reset();
                setCreateOpen(true);
              }}
              onClose={() => setSearchOpen(false)}
            />
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={decide.isPending}
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-3.5 w-3.5 mr-2" />
              Search existing {entityNoun}s
            </Button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note"
              aria-label="Decision note"
              className="h-8 max-w-sm"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={decide.isPending}
              onClick={() => run({ action: "reject" })}
            >
              Reject (not {row.entity === "employer" ? "an employer" : "a worksite"})
            </Button>
            {decide.isPending && (
              <span className="inline-flex items-center text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Saving…
              </span>
            )}
          </div>
        </div>
      )}

      {isAdmin && decided && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={decide.isPending}
            onClick={() => run({ action: "reopen" })}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-2" />
            Reopen
          </Button>
          <span className="text-xs text-muted-foreground">
            Reopening keeps the alias and the worker updates already made.
          </span>
        </div>
      )}

      {errorMessage && !createOpen && (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      )}

      {isAdmin && (
        <CreateNewDialog
          entity={row.entity}
          rawName={row.raw_name}
          open={createOpen}
          onOpenChange={(next) => {
            setCreateOpen(next);
            if (!next) decide.reset();
          }}
          pending={decide.isPending}
          error={createOpen ? errorMessage : null}
          onSubmit={create}
        />
      )}
    </li>
  );
}
