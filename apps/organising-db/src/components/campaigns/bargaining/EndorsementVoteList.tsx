"use client";

import { format } from "date-fns";
import { CalendarRange, CheckCircle2, Clock, Users, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEndorsementVotes } from "@/hooks/useEndorsementVotes";
import type { MemberEndorsementVote } from "@oa/db-types";

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

const KIND_LABELS: Record<MemberEndorsementVote["vote_kind"], string> = {
  employer_proposal: "Employer Proposal",
  union_in_principle: "Union In-Principle",
  final_eba: "Final EBA Vote",
};

function OutcomeBadge({ outcome }: { outcome: MemberEndorsementVote["outcome"] }) {
  if (!outcome || outcome === "pending") {
    return (
      <Badge variant="warning" className="gap-1">
        <Clock className="h-3 w-3" />
        Pending
      </Badge>
    );
  }
  if (outcome === "yes") {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Yes
      </Badge>
    );
  }
  if (outcome === "no") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        No
      </Badge>
    );
  }
  // withdrawn
  return (
    <Badge variant="secondary" className="gap-1">
      Withdrawn
    </Badge>
  );
}

function formatDateRange(
  opensAt: string | null | undefined,
  closesAt: string | null | undefined
) {
  if (!opensAt && !closesAt) return null;
  const open = opensAt ? format(new Date(opensAt), "d MMM yyyy") : "?";
  const close = closesAt ? format(new Date(closesAt), "d MMM yyyy") : "?";
  return `${open} – ${close}`;
}

// ──────────────────────────────────────────────────────────────────
// Sub-component: single vote row
// ──────────────────────────────────────────────────────────────────

interface VoteRowProps {
  vote: MemberEndorsementVote;
  onEdit?: (vote: MemberEndorsementVote) => void;
}

function VoteRow({ vote, onEdit }: VoteRowProps) {
  const dateRange = formatDateRange(vote.vote_opens_at, vote.vote_closes_at);
  const actualCount =
    (vote.votes_yes ?? 0) + (vote.votes_no ?? 0) + (vote.votes_abstain ?? 0);

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4 text-sm">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {KIND_LABELS[vote.vote_kind]}
          </span>
          {vote.proposal_label && (
            <span className="text-muted-foreground truncate">
              — {vote.proposal_label}
            </span>
          )}
          {vote.proposal_version > 1 && (
            <Badge variant="outline" className="text-xs">
              v{vote.proposal_version}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
          {dateRange && (
            <span className="flex items-center gap-1">
              <CalendarRange className="h-3.5 w-3.5 shrink-0" />
              {dateRange}
            </span>
          )}
          {vote.eligible_count != null && (
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5 shrink-0" />
              {vote.eligible_count.toLocaleString()} eligible
            </span>
          )}
          {actualCount > 0 && (
            <span>{actualCount.toLocaleString()} votes cast</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <OutcomeBadge outcome={vote.outcome} />
        {onEdit && (
          <Button size="sm" variant="ghost" onClick={() => onEdit(vote)}>
            Edit
          </Button>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────

interface EndorsementVoteListProps {
  campaignId: number;
  /** Callback to open the editor for a new vote. */
  onAddVote?: () => void;
  /** Callback to open the editor for an existing vote. */
  onEditVote?: (vote: MemberEndorsementVote) => void;
}

export function EndorsementVoteList({
  campaignId,
  onAddVote,
  onEditVote,
}: EndorsementVoteListProps) {
  const { data: votes, isLoading, isError } = useEndorsementVotes(campaignId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base font-semibold">Endorsement Votes</CardTitle>
        {onAddVote && (
          <Button size="sm" onClick={onAddVote}>
            Record Vote
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading && (
          <>
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </>
        )}

        {isError && (
          <p className="text-sm text-muted-foreground">
            Failed to load endorsement votes.
          </p>
        )}

        {!isLoading && !isError && (!votes || votes.length === 0) && (
          <p className="text-sm text-muted-foreground">
            No endorsement votes recorded yet.
          </p>
        )}

        {!isLoading &&
          votes?.map((vote) => (
            <VoteRow key={vote.vote_id} vote={vote} onEdit={onEditVote} />
          ))}
      </CardContent>
    </Card>
  );
}
