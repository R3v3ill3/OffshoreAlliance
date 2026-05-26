"use client";

import { useState } from "react";
import { Loader2, PhoneCall, History, CheckCircle2 } from "lucide-react";
import { MobileBottomSheet } from "@/components/phone/mobile/primitives/MobileBottomSheet";
import { MobileHeader } from "@/components/phone/mobile/primitives/MobileHeader";
import { MobileProgressBar } from "@/components/phone/mobile/primitives/MobileProgressBar";
import { tokens } from "@/lib/ui/dialer-tokens";
import type { CallSessionBootstrap, CallSessionCaller } from "@/lib/phone/session/types";
import type { OutcomeClassification } from "@/lib/phone/outcome-model";
import { OUTCOME_META } from "@/lib/phone/outcome-model";

export interface RecentMobileAttempt {
  attempt_id: number;
  contact_label: string;
  outcome_classification: OutcomeClassification | null;
  placed_at: Date;
}

interface MobileQueueProps {
  bootstrap: CallSessionBootstrap;
  caller: CallSessionCaller;
  callerCompleted: number;
  recent: RecentMobileAttempt[];
  isFetchingNext: boolean;
  onFetchNext: () => void;
  onLogout?: () => void;
}

/**
 * Between-calls screen. Shows progress and the primary "Get next contact"
 * CTA. The recent-attempts log lives in a bottom sheet so the queue card
 * stays focused on a single decision.
 */
export function MobileQueue({
  bootstrap,
  caller,
  callerCompleted,
  recent,
  isFetchingNext,
  onFetchNext,
  onLogout,
}: MobileQueueProps) {
  const [showHistory, setShowHistory] = useState(false);
  const list = bootstrap.list;
  const total = (list as { total_items?: number }).total_items ?? 0;
  const completed = (list as { completed_items?: number }).completed_items ?? 0;
  const remaining = Math.max(total - completed, 0);

  return (
    <div className={tokens.layout.mobileScreen}>
      <MobileHeader
        campaignName={null}
        listName={list.name}
        callerLabel={caller.label}
        onLogout={onLogout}
      />

      <main className="flex-1 px-4 pt-5">
        <div className={`${tokens.layout.mobileCard} p-5 space-y-5`}>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Queue</p>
            <p className={tokens.type.hero}>
              {remaining > 0 ? `${remaining} to go` : "Queue clear"}
            </p>
            <p className="text-sm text-muted-foreground">
              {remaining > 0
                ? "Tap below to grab the next contact. They’ll be held for you for 15 minutes."
                : "All contacts have been called or skipped. Check back later or finish your session."}
            </p>
          </div>

          <MobileProgressBar
            completed={completed}
            total={Math.max(total, 1)}
            callerCompleted={callerCompleted}
          />

          {recent.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className="flex w-full items-center justify-between rounded-xl border bg-card px-3 py-2.5 text-left text-sm hover:bg-muted/40"
            >
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <History className="h-4 w-4" />
                Your recent calls
              </span>
              <span className="text-xs font-semibold tabular-nums">{recent.length}</span>
            </button>
          ) : null}
        </div>
      </main>

      <div className={tokens.layout.mobileActionBar}>
        <button
          type="button"
          onClick={onFetchNext}
          disabled={isFetchingNext || remaining === 0}
          className={tokens.buttons.callPrimary}
        >
          {isFetchingNext ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : remaining === 0 ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <PhoneCall className="h-5 w-5" />
          )}
          {remaining === 0 ? "All done" : "Get next contact"}
        </button>
      </div>

      <MobileBottomSheet
        open={showHistory}
        onClose={() => setShowHistory(false)}
        title="Your recent calls"
        description="In this session, on this device."
      >
        <ul className="divide-y">
          {recent.map((entry) => {
            const meta = entry.outcome_classification
              ? OUTCOME_META[entry.outcome_classification]
              : null;
            return (
              <li
                key={entry.attempt_id}
                className="flex items-start justify-between gap-3 py-2.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{entry.contact_label}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.placed_at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
                {meta ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                    {meta.label}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </MobileBottomSheet>
    </div>
  );
}
