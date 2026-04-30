"use client";

import { CheckCircle2, Clock, MinusCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { MemberEndorsementVote } from "@oa/db-types";

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

const KIND_LABELS: Record<MemberEndorsementVote["vote_kind"], string> = {
  employer_proposal: "Employer Proposal",
  union_in_principle: "Union In-Principle",
  final_eba: "Final EBA Vote",
};

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

interface OutcomeIconProps {
  outcome: MemberEndorsementVote["outcome"];
}

function OutcomeIcon({ outcome }: OutcomeIconProps) {
  if (outcome === "yes")
    return <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />;
  if (outcome === "no")
    return <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />;
  if (outcome === "withdrawn")
    return <MinusCircle className="h-5 w-5 text-muted-foreground" />;
  return <Clock className="h-5 w-5 text-amber-500" />;
}

function OutcomeBadge({ outcome }: { outcome: MemberEndorsementVote["outcome"] }) {
  const label =
    outcome === "yes"
      ? "Approved"
      : outcome === "no"
        ? "Rejected"
        : outcome === "withdrawn"
          ? "Withdrawn"
          : "Pending";

  const variant =
    outcome === "yes"
      ? "success"
      : outcome === "no"
        ? "destructive"
        : outcome === "withdrawn"
          ? "secondary"
          : "warning";

  return <Badge variant={variant}>{label}</Badge>;
}

// ──────────────────────────────────────────────────────────────────
// Sub-component: a single percentage bar row
// ──────────────────────────────────────────────────────────────────

interface BarRowProps {
  label: string;
  count: number;
  percentage: number;
  colorClass: string;
}

function BarRow({ label, count, percentage, colorClass }: BarRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {count.toLocaleString()} ({percentage}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full ${colorClass} transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────

interface EndorsementResultsCardProps {
  vote: MemberEndorsementVote;
  /** Minimum quorum threshold as a percentage (0–100). Defaults to 50. */
  quorumPct?: number;
}

export function EndorsementResultsCard({
  vote,
  quorumPct = 50,
}: EndorsementResultsCardProps) {
  const yes = vote.votes_yes ?? 0;
  const no = vote.votes_no ?? 0;
  const abstain = vote.votes_abstain ?? 0;
  const informal = vote.informal_count ?? 0;
  const totalCast = yes + no + abstain + informal;
  const eligible = vote.eligible_count ?? 0;

  // Turnout: cast / eligible (only if eligible is known)
  const turnoutPct = eligible > 0 ? pct(totalCast, eligible) : null;
  const meetsQuorum = turnoutPct !== null ? turnoutPct >= quorumPct : null;

  // Percentages of formal votes (yes + no + abstain, excluding informal)
  const formalTotal = yes + no + abstain;
  const yesPct = pct(yes, formalTotal);
  const noPct = pct(no, formalTotal);
  const abstainPct = pct(abstain, formalTotal);

  const title = `${KIND_LABELS[vote.vote_kind]}${vote.proposal_label ? ` — ${vote.proposal_label}` : ""}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <OutcomeIcon outcome={vote.outcome} />
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
          </div>
          <OutcomeBadge outcome={vote.outcome} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Summary numbers */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              { label: "Eligible", value: eligible > 0 ? eligible : null },
              { label: "Total cast", value: totalCast > 0 ? totalCast : null },
              { label: "Informal", value: informal > 0 ? informal : null },
              {
                label: "Turnout",
                value: turnoutPct !== null ? `${turnoutPct}%` : null,
              },
            ] as { label: string; value: number | string | null }[]
          ).map(({ label, value }) => (
            <div key={label} className="rounded-md border px-3 py-2">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold tabular-nums">
                {value != null ? value.toLocaleString() : "—"}
              </p>
            </div>
          ))}
        </div>

        {/* Vote breakdown bars */}
        {formalTotal > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Formal Votes
            </p>
            <BarRow
              label="Yes"
              count={yes}
              percentage={yesPct}
              colorClass="bg-green-500 dark:bg-green-400"
            />
            <BarRow
              label="No"
              count={no}
              percentage={noPct}
              colorClass="bg-red-500 dark:bg-red-400"
            />
            {abstain > 0 && (
              <BarRow
                label="Abstain"
                count={abstain}
                percentage={abstainPct}
                colorClass="bg-slate-400"
              />
            )}
          </div>
        )}

        {/* Quorum status */}
        {turnoutPct !== null && (
          <div className="space-y-1.5 rounded-md border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                Quorum ({quorumPct}% required)
              </span>
              <Badge variant={meetsQuorum ? "success" : "warning"}>
                {meetsQuorum ? "Met" : "Not met"}
              </Badge>
            </div>
            <Progress value={Math.min(turnoutPct, 100)} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Turnout: {turnoutPct}%
              {eligible > 0 &&
                ` (${totalCast.toLocaleString()} of ${eligible.toLocaleString()})`}
            </p>
          </div>
        )}

        {/* FWC info */}
        {(vote.fwc_application_number || vote.fwc_notification_sent_at) && (
          <div className="space-y-0.5 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {vote.fwc_application_number && (
              <p>
                <span className="font-medium">FWC Application:</span>{" "}
                {vote.fwc_application_number}
              </p>
            )}
            {vote.fwc_notification_sent_at && (
              <p>
                <span className="font-medium">FWC Notification:</span>{" "}
                {new Date(vote.fwc_notification_sent_at).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {/* Notes */}
        {vote.notes && (
          <p className="text-sm text-muted-foreground">{vote.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}
