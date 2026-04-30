"use client";

import { format, parseISO } from "date-fns";
import { CalendarDays, ChevronRight, ClipboardList, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { PaboApplication, PaboStatus } from "@/hooks/usePaboApplications";

// ── Status badge colours ───────────────────────────────────────────────────

const STATUS_VARIANT: Record<
  PaboStatus,
  "default" | "secondary" | "info" | "success" | "warning" | "destructive" | "outline"
> = {
  drafting: "secondary",
  lodged: "info",
  granted: "success",
  denied: "destructive",
  expired: "warning",
  superseded: "outline",
  withdrawn: "secondary",
};

const STATUS_LABEL: Record<PaboStatus, string> = {
  drafting: "Drafting",
  lodged: "Lodged",
  granted: "Granted",
  denied: "Denied",
  expired: "Expired",
  superseded: "Superseded",
  withdrawn: "Withdrawn",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return format(parseISO(val), "d MMM yyyy");
  } catch {
    return val;
  }
}

function fmtDateTime(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return format(parseISO(val), "d MMM yyyy HH:mm");
  } catch {
    return val;
  }
}

// ── Component ──────────────────────────────────────────────────────────────

interface PaboApplicationCardProps {
  pabo: PaboApplication;
  /** Called when the user clicks "View questions" CTA */
  onViewQuestions?: (paboId: number) => void;
}

export function PaboApplicationCard({
  pabo,
  onViewQuestions,
}: PaboApplicationCardProps) {
  const statusVariant = pabo.status
    ? STATUS_VARIANT[pabo.status]
    : "secondary";
  const statusLabel = pabo.status ? STATUS_LABEL[pabo.status] : "Unknown";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base">
              {pabo.fwc_application_number
                ? `Application ${pabo.fwc_application_number}`
                : "PABO Application"}
            </CardTitle>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>
          <CardDescription className="text-xs">
            Filed: {fmtDate(pabo.application_filed_at)} &nbsp;·&nbsp; Order
            made: {fmtDate(pabo.ballot_order_made_at)}
          </CardDescription>
        </div>

        {onViewQuestions && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewQuestions(pabo.pabo_id)}
            className="shrink-0"
          >
            <ClipboardList className="h-4 w-4" />
            View questions
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Ballot dates */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground flex items-center gap-1 mb-0.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Ballot opens
            </p>
            <p className="font-medium">{fmtDateTime(pabo.ballot_opens_at)}</p>
          </div>
          <div>
            <p className="text-muted-foreground flex items-center gap-1 mb-0.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Ballot closes
            </p>
            <p className="font-medium">{fmtDateTime(pabo.ballot_closes_at)}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-0.5">Valid from</p>
            <p className="font-medium">{fmtDate(pabo.valid_from)}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-0.5">Valid until</p>
            <p className="font-medium">{fmtDate(pabo.valid_until)}</p>
          </div>
        </div>

        {/* Voter stats */}
        {(pabo.eligible_voter_count != null || pabo.votes_cast != null) && (
          <div className="rounded-md bg-muted/50 px-4 py-3 grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground flex items-center gap-1 mb-0.5">
                <Users className="h-3.5 w-3.5" />
                Eligible voters
              </p>
              <p className="font-semibold text-lg leading-tight">
                {pabo.eligible_voter_count ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">Votes cast</p>
              <p className="font-semibold text-lg leading-tight">
                {pabo.votes_cast ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">Turnout</p>
              <p className="font-semibold text-lg leading-tight">
                {pabo.voter_turnout_pct != null
                  ? `${pabo.voter_turnout_pct}%`
                  : "—"}
              </p>
            </div>
          </div>
        )}

        {/* AEC agent */}
        {pabo.aec_ballot_agent && (
          <div className="text-sm">
            <span className="text-muted-foreground">AEC ballot agent: </span>
            <span className="font-medium">{pabo.aec_ballot_agent}</span>
          </div>
        )}

        {/* Notice period */}
        <div className="text-sm">
          <span className="text-muted-foreground">Notice period required: </span>
          <span className="font-medium">
            {pabo.notice_period_required_days} day
            {pabo.notice_period_required_days !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Notes */}
        {pabo.notes && (
          <div className="text-sm border-t pt-3 mt-1">
            <p className="text-muted-foreground mb-0.5">Notes</p>
            <p className="whitespace-pre-wrap">{pabo.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
