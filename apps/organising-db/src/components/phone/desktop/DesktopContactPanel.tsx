"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  Check,
  Clock,
  Copy,
  Mail,
  MapPin,
  PhoneCall,
} from "lucide-react";
import { formatAustralianPhoneDisplay } from "@/lib/phone/format-phone-display";
import type { CallListItemWithWorker } from "@/types/planner-types";

interface DesktopContactPanelProps {
  contact: CallListItemWithWorker;
  /** Cross-list dedup hint — see `MobileContact`. */
  recentCrossListContact?: {
    list_name: string;
    caller_label: string;
    outcome_label: string;
    contacted_at: string;
  } | null;
}

/**
 * Desktop contact card. Unlike the mobile dialer there is no tap-to-dial
 * button — the caller dials the number on a separate handset, so the number is
 * shown large with a copy affordance and a "dial on your phone" hint.
 */
export function DesktopContactPanel({ contact, recentCrossListContact }: DesktopContactPanelProps) {
  const { worker, connection, recent_attempts } = contact;
  const [phoneCopied, setPhoneCopied] = useState(false);
  if (!worker) return null;

  const displayPhone = worker.phone ? formatAustralianPhoneDisplay(worker.phone) : null;
  const lastAttempt = recent_attempts?.[0];
  const fullName = `${worker.first_name ?? ""} ${worker.last_name ?? ""}`.trim() || "Unnamed contact";

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
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-semibold text-primary">
            {worker.first_name?.[0]}
            {worker.last_name?.[0]}
          </div>
          <div className="min-w-0 space-y-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Now calling</p>
              <h2 className="text-2xl font-semibold leading-tight tracking-tight">{fullName}</h2>
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              {worker.occupation ? (
                <p className="flex items-center gap-1.5">
                  <Briefcase className="h-4 w-4 shrink-0" />
                  {worker.occupation}
                </p>
              ) : null}
              {worker.employer_name ? (
                <p className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 shrink-0" />
                  {worker.employer_name}
                  {worker.worksite_name ? ` · ${worker.worksite_name}` : ""}
                </p>
              ) : null}
              {worker.email ? (
                <p className="flex items-center gap-1.5">
                  <Mail className="h-4 w-4 shrink-0" />
                  {worker.email}
                </p>
              ) : null}
            </div>
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

        {/* Phone-to-dial block */}
        <div className="w-full shrink-0 sm:w-auto">
          {displayPhone ? (
            <div className="rounded-xl border bg-muted/40 px-4 py-3 sm:min-w-[220px]">
              <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <PhoneCall className="h-3.5 w-3.5" />
                Dial on your phone
              </p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="font-mono text-xl font-semibold tabular-nums">{displayPhone}</span>
                <button
                  type="button"
                  onClick={handleCopyPhone}
                  aria-label="Copy phone number"
                  title="Copy number"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-background"
                >
                  {phoneCopied ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground sm:min-w-[220px]">
              No phone on file.
            </p>
          )}
        </div>
      </div>

      {lastAttempt ? (
        <div className="mt-4 rounded-xl bg-muted/30 p-3 text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            Last call:{" "}
            {new Date(lastAttempt.started_at).toLocaleDateString("en-AU", {
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
  );
}
