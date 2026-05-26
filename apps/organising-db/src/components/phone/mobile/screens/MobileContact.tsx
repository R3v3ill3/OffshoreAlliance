"use client";

import { useState } from "react";
import { Briefcase, MapPin, Mail, Copy, Check, Clock, AlertTriangle } from "lucide-react";
import { MobileCallButton } from "@/components/phone/mobile/primitives/MobileCallButton";
import { MobileHeader } from "@/components/phone/mobile/primitives/MobileHeader";
import { tokens } from "@/lib/ui/dialer-tokens";
import { formatAustralianPhoneDisplay } from "@/lib/phone/format-phone-display";
import type { CallListItemWithWorker } from "@/types/planner-types";
import type { CallSessionCaller } from "@/lib/phone/session/types";

interface MobileContactProps {
  contact: CallListItemWithWorker;
  listName: string;
  callerLabel: CallSessionCaller["label"];
  /**
   * Cross-list dedup hint surfaced when the same worker has been recently
   * called via a different list/share-token in this campaign. Optional —
   * the data only flows once W4's campaign-dedup view ships.
   */
  recentCrossListContact?: {
    list_name: string;
    caller_label: string;
    outcome_label: string;
    contacted_at: string;
  } | null;
  /** Triggered once the user has tapped the call button. */
  onCallPlaced: () => void;
  /** Skip this contact without dialling (records 'no_answer' silently). */
  onSkip: () => void;
  /** Return the claim (release without recording any outcome). */
  onHandBack: () => void;
  onLogout?: () => void;
}

export function MobileContact({
  contact,
  listName,
  callerLabel,
  recentCrossListContact,
  onCallPlaced,
  onSkip,
  onHandBack,
  onLogout,
}: MobileContactProps) {
  const { worker, connection, recent_attempts } = contact;
  const [phoneCopied, setPhoneCopied] = useState(false);
  if (!worker) return null;

  const displayPhone = worker.phone ? formatAustralianPhoneDisplay(worker.phone) : null;
  const lastAttempt = recent_attempts?.[0];
  const fullName = `${worker.first_name ?? ""} ${worker.last_name ?? ""}`.trim();

  const handleCopyPhone = async () => {
    if (!worker.phone) return;
    try {
      await navigator.clipboard.writeText(worker.phone);
      setPhoneCopied(true);
      setTimeout(() => setPhoneCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className={tokens.layout.mobileScreen}>
      <MobileHeader
        campaignName={null}
        listName={listName}
        callerLabel={callerLabel}
        claimedAt={contact.claimed_at ?? null}
        onLogout={onLogout}
      />

      <main className="flex-1 px-4 pt-5 pb-3 space-y-4">
        <div className={`${tokens.layout.mobileCard} p-5`}>
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-semibold text-primary">
              {worker.first_name?.[0]}
              {worker.last_name?.[0]}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <h2 className={tokens.type.hero}>{fullName}</h2>
                {worker.occupation ? (
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Briefcase className="h-3.5 w-3.5" />
                    {worker.occupation}
                  </p>
                ) : null}
              </div>
              {worker.employer_name ? (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {worker.employer_name}
                  {worker.worksite_name ? ` · ${worker.worksite_name}` : ""}
                </p>
              ) : null}
              {worker.email ? (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  {worker.email}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {connection?.support_level ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                    {connection.support_level.replace(/_/g, " ")}
                  </span>
                ) : null}
                {connection?.connection_status ? (
                  <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium">
                    {connection.connection_status}
                  </span>
                ) : null}
                {contact.attempts_count > 0 ? (
                  <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium">
                    {contact.attempts_count} prior attempt
                    {contact.attempts_count !== 1 ? "s" : ""}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {displayPhone ? (
            <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm">
              <span className="font-mono text-base tabular-nums">{displayPhone}</span>
              <button
                type="button"
                onClick={handleCopyPhone}
                aria-label="Copy phone number"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-background"
              >
                {phoneCopied ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              No phone on file.
            </p>
          )}

          {lastAttempt ? (
            <div className="mt-3 rounded-xl bg-muted/30 p-3 text-xs">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                Last call: {new Date(lastAttempt.started_at).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                })}
                {" — "}
                {lastAttempt.dial_disposition.replace(/_/g, " ")}
                {lastAttempt.call_disposition
                  ? ` / ${lastAttempt.call_disposition.replace(/_/g, " ")}`
                  : ""}
              </div>
              {lastAttempt.overall_notes ? (
                <p className="mt-1 line-clamp-2 text-muted-foreground">
                  &ldquo;{lastAttempt.overall_notes}&rdquo;
                </p>
              ) : null}
            </div>
          ) : null}

          {recentCrossListContact ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="font-semibold">Recently contacted via another list</p>
                <p>
                  {recentCrossListContact.caller_label} reached this worker on{" "}
                  <strong>{recentCrossListContact.list_name}</strong> —{" "}
                  {recentCrossListContact.outcome_label} (
                  {new Date(recentCrossListContact.contacted_at).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                  })}
                  ). Skip if it&apos;s too soon.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </main>

      <div className={tokens.layout.mobileActionBar}>
        {worker.phone ? (
          <MobileCallButton
            phoneNumber={worker.phone}
            contactLabel={fullName}
            onCallPlaced={onCallPlaced}
          />
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onSkip}
            className={tokens.buttons.actionSecondary}
            aria-label="Skip this contact"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onHandBack}
            className={tokens.buttons.actionSecondary}
            aria-label="Hand contact back to the queue without recording an outcome"
          >
            Hand back
          </button>
        </div>
      </div>
    </div>
  );
}
