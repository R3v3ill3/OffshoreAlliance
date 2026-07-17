"use client";

/**
 * Overview-tab nudge card for activist development: overdue next
 * contacts, active WOCs gone quiet (no meeting in 6+ weeks), and
 * open coverage gaps — each deep-linking into the relevant view.
 * Renders nothing when there is nothing to nudge about.
 */
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActivistRegister } from "./use-activist-data";
import { useCoverageSummary } from "./use-coverage-data";
import { useWocMeetingRecency } from "./use-woc-recency";

const STALE_WOC_DAYS = 42;

function isContactOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date(new Date().toDateString());
}

function isWocStale(status: string, lastMeeting: string | null): boolean {
  if (status !== "active") return false;
  if (lastMeeting == null) return true;
  const ageDays =
    (Date.now() - new Date(lastMeeting).getTime()) / (24 * 60 * 60 * 1000);
  return ageDays > STALE_WOC_DAYS;
}

export function ActivistOverviewCard({ campaignId }: { campaignId: string }) {
  const { data: registerRows = [] } = useActivistRegister(campaignId);
  const { data: summary } = useCoverageSummary(campaignId);
  const { data: recency = [] } = useWocMeetingRecency(campaignId);

  const overdueContacts = registerRows.filter(
    (r) => !r.is_archived && isContactOverdue(r.next_contact_date)
  );

  const staleWocs = recency.filter((w) => isWocStale(w.status, w.lastMeeting));

  const gaps = Number(summary?.units_gap ?? 0);

  if (overdueContacts.length === 0 && staleWocs.length === 0 && gaps === 0) {
    return null;
  }

  const base = `/campaigns/${campaignId}?tab=workforce`;

  return (
    <Card className="border-amber-400/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Activist development — needs attention
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 text-sm">
        {overdueContacts.length > 0 && (
          <Link href={`${base}&sub=activists&view=register`}>
            <Badge
              variant="outline"
              className="cursor-pointer border-red-500 text-red-600 hover:bg-red-500/10 dark:border-red-600 dark:text-red-400"
            >
              {overdueContacts.length} overdue next contact
              {overdueContacts.length === 1 ? "" : "s"}
            </Badge>
          </Link>
        )}
        {staleWocs.length > 0 && (
          <Link href={`${base}&sub=activists&view=wocs`}>
            <Badge
              variant="outline"
              className="cursor-pointer border-amber-500 text-amber-700 hover:bg-amber-500/10 dark:border-amber-600 dark:text-amber-400"
            >
              {staleWocs.length} active WOC{staleWocs.length === 1 ? "" : "s"} with no
              meeting in {STALE_WOC_DAYS / 7}+ weeks
            </Badge>
          </Link>
        )}
        {gaps > 0 && (
          <Link href={`${base}&sub=campaign-units`}>
            <Badge
              variant="outline"
              className="cursor-pointer border-red-500 text-red-600 hover:bg-red-500/10 dark:border-red-600 dark:text-red-400"
            >
              {gaps} unit{gaps === 1 ? "" : "s"} with no named leader
            </Badge>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
