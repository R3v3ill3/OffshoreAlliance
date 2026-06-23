"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Flame,
  History,
  Loader2,
  PhoneForwarded,
  ShieldAlert,
  SkipForward,
} from "lucide-react";
import {
  callFlowReducer,
  canAdvanceSection,
  getInitialCallFlowState,
  type CapturedIssue,
  type CapturedObjection,
} from "@/lib/phone/call-flow-state";
import {
  deriveOutcomeClassification,
  OUTCOME_META,
  type OutcomeClassification,
} from "@/lib/phone/outcome-model";
import {
  buildCallAttemptPayload,
  buildSkipAttemptPayload,
} from "@/lib/phone/session/build-attempt-payload";
import { useClaimAutoRenew } from "@/lib/phone/session/use-claim-auto-renew";
import { useScriptVariables } from "@/lib/phone/session/use-script-variables";
import { dialerTelemetry } from "@/lib/phone/telemetry";
import { Textarea } from "@/components/ui/textarea";
import { DesktopShellHeader } from "./DesktopShell";
import { DesktopContactPanel } from "./DesktopContactPanel";
import { MobileDialOutcomeBar } from "@/components/phone/mobile/in-call/MobileDialOutcomeBar";
import { MobileConversationStepper } from "@/components/phone/mobile/in-call/MobileConversationStepper";
import { MobileCtaPanel } from "@/components/phone/mobile/in-call/MobileCtaPanel";
import {
  MobileAssessmentPanel,
  type AssessmentValue,
} from "@/components/phone/mobile/in-call/MobileAssessmentPanel";
import { MobileOutcomeWheel } from "@/components/phone/mobile/in-call/MobileOutcomeWheel";
import { MobileCallbackPicker } from "@/components/phone/mobile/in-call/MobileCallbackPicker";
import { MobileObjectionsSheet } from "@/components/phone/mobile/in-call/MobileObjectionsSheet";
import { MobileIssuesSheet } from "@/components/phone/mobile/in-call/MobileIssuesSheet";
import type { RecentMobileAttempt } from "@/components/phone/mobile/screens/MobileQueue";
import type { CallSessionDataSource } from "@/lib/phone/session/types";
import type { CtaRatingValue } from "@/components/phone/CtaRatingsPanel";
import type {
  CallDisposition,
  CallListItemWithWorker,
  CallScriptSection,
  SupportLevel,
} from "@/types/planner-types";

const SKIP_REASONS: { value: string; label: string }[] = [
  { value: "no_phone", label: "No phone on file" },
  { value: "not_ready", label: "Not ready yet" },
  { value: "language_barrier", label: "Language barrier" },
  { value: "other_caller", label: "Other caller better suited" },
  { value: "personal_relationship", label: "Conflict of interest" },
];

interface DesktopCallSessionProps {
  contact: CallListItemWithWorker;
  dataSource: CallSessionDataSource;
  /** Recent attempts placed by this caller in the session (side panel). */
  recent: RecentMobileAttempt[];
  /** Called once the attempt is recorded; parent picks up the next contact. */
  onAttemptRecorded: (result: {
    attempt_id: number;
    outcome_classification: OutcomeClassification | null;
    contact: CallListItemWithWorker;
  }) => void;
  /** Skip (records a no_answer attempt with the chosen reason). */
  onSkipContact: () => void;
  /** Hand the claim back without recording any attempt. */
  onHandBack: () => void;
  /** Called when the server confirms the claim has been lost. */
  onClaimLost?: () => void;
  onSwitchToMobile?: () => void;
}

/**
 * Desktop record-the-outcome screen for the shareable call list.
 *
 * The caller dials the contact on a separate handset, then records the
 * connection outcome (dial disposition), assessment (support level, CTA and
 * session-assessment ratings, conversation outcome) and notes — all on one
 * wide screen. There is no in-app calling; "Save & next contact" records the
 * attempt and the orchestrator claims the next contact.
 */
export function DesktopCallSession({
  contact,
  dataSource,
  recent,
  onAttemptRecorded,
  onSkipContact,
  onHandBack,
  onClaimLost,
  onSwitchToMobile,
}: DesktopCallSessionProps) {
  const { bootstrap, caller } = dataSource;
  const [flowState, dispatch] = useReducer(callFlowReducer, getInitialCallFlowState());
  const [notes, setNotes] = useState("");
  const [supportLevel, setSupportLevel] = useState<SupportLevel | null>(null);
  const [callDisposition, setCallDisposition] = useState<CallDisposition | null>(null);
  const [outcome, setOutcome] = useState<OutcomeClassification | null>(null);
  const [callbackAt, setCallbackAt] = useState<string | null>(null);
  const [ctaRatings, setCtaRatings] = useState<Map<number, CtaRatingValue>>(new Map());
  const [assessmentValues, setAssessmentValues] = useState<Map<number, AssessmentValue>>(new Map());
  const [stepNotes, setStepNotes] = useState<Record<number, string>>({});
  const [stepReached, setStepReached] = useState<Set<number>>(new Set([0]));
  const [showObjections, setShowObjections] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drive claim TTL renewal from interaction + a background poll.
  const { claimedAt: liveClaimedAt, touch: renewClaim } = useClaimAutoRenew({
    dataSource,
    itemId: contact.item_id,
    initialClaimedAt: contact.claimed_at ?? null,
    onClaimLost,
  });

  const currentLink =
    bootstrap.linkedScripts.find((link) => link.is_current) ?? bootstrap.linkedScripts[0] ?? null;
  const activeScript =
    currentLink?.call_scripts ??
    (bootstrap.list as { call_scripts?: NonNullable<typeof currentLink>["call_scripts"] }).call_scripts ??
    null;
  const sections: CallScriptSection[] = useMemo(
    () =>
      [...((activeScript?.call_script_sections as CallScriptSection[] | undefined) ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order,
      ),
    [activeScript],
  );
  const scriptVariables = useScriptVariables(bootstrap.scriptContext, contact);

  const isPreCall = flowState.dialDisposition == null;
  const isConnected = flowState.dialDisposition === "connected";

  // Auto-derive the outcome so the wheel reflects the conversation even before
  // the caller taps a chip.
  useEffect(() => {
    if (outcome) return;
    if (flowState.dialDisposition == null) return;
    const joinPositive = Array.from(ctaRatings.values()).some(
      (rating) => rating.binary_value === "yes" || (rating.rating != null && rating.rating >= 4),
    );
    const derived = deriveOutcomeClassification({
      dialDisposition: flowState.dialDisposition,
      callDisposition,
      supportLevel,
      joinPositive,
      existingMember: contact.worker?.union_membership_type_name === "financial_member",
    });
    if (derived) setOutcome(derived);
  }, [
    outcome,
    flowState.dialDisposition,
    callDisposition,
    supportLevel,
    ctaRatings,
    contact.worker?.union_membership_type_name,
  ]);

  const handleDial = useCallback(
    (disposition: NonNullable<typeof flowState.dialDisposition>) => {
      dialerTelemetry.dialOutcomeSelected({
        item_id: contact.item_id,
        dial_disposition: disposition,
      });
      dispatch({ type: "DIAL_OUTCOME", disposition });
      if (disposition === "connected") {
        setStepReached(new Set([0]));
      }
    },
    [contact.item_id],
  );

  const finalize = useCallback(async () => {
    setSubmitting(true);
    setError(null);

    const attempt = buildCallAttemptPayload({
      contact,
      scriptId: activeScript?.script_id ?? bootstrap.list.script_id ?? null,
      dialDisposition: flowState.dialDisposition,
      callDisposition,
      notes,
      callbackAt,
      supportLevel,
      outcome,
      // The call is placed on an external handset, so we can't measure
      // connect-to-hangup duration from the webform.
      durationSeconds: null,
      sections,
      stepReached,
      stepNotes,
      isConnected,
      objections: flowState.capturedObjections,
      issues: flowState.capturedIssues,
      ctaRatings,
      assessmentValues,
      actionId: bootstrap.actionId,
    });

    try {
      const result = await dataSource.recordAttempt(attempt);
      dialerTelemetry.attemptRecorded({
        item_id: contact.item_id,
        attempt_id: result.attempt_id,
        outcome_classification: outcome,
        duration_seconds: null,
      });
      onAttemptRecorded({ attempt_id: result.attempt_id, outcome_classification: outcome, contact });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record attempt");
    } finally {
      setSubmitting(false);
    }
  }, [
    activeScript,
    assessmentValues,
    bootstrap.actionId,
    bootstrap.list.script_id,
    callDisposition,
    callbackAt,
    contact,
    ctaRatings,
    dataSource,
    flowState.capturedIssues,
    flowState.capturedObjections,
    flowState.dialDisposition,
    isConnected,
    notes,
    onAttemptRecorded,
    outcome,
    sections,
    stepNotes,
    stepReached,
    supportLevel,
  ]);

  const handleSkipWithReason = useCallback(
    async (reason: string) => {
      const attempt = buildSkipAttemptPayload({
        contact,
        scriptId: activeScript?.script_id ?? bootstrap.list.script_id ?? null,
        reason,
        notes,
        actionId: bootstrap.actionId,
      });
      try {
        await dataSource.recordAttempt(attempt);
        dialerTelemetry.skipUsed({ item_id: contact.item_id, reason });
        onSkipContact();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to record skip");
      }
    },
    [activeScript, bootstrap.actionId, bootstrap.list.script_id, contact, dataSource, notes, onSkipContact],
  );

  const recentCrossListContact = useMemo(() => {
    const crossList = contact.cross_list_status ?? null;
    if (!crossList) return null;
    return {
      list_name: crossList.list_name,
      caller_label: crossList.last_caller_session_label ?? "Another caller",
      outcome_label:
        crossList.last_outcome_classification?.replace(/_/g, " ") ??
        crossList.last_call_disposition?.replace(/_/g, " ") ??
        crossList.last_dial_disposition?.replace(/_/g, " ") ??
        "contacted",
      contacted_at: crossList.last_attempt_at,
    };
  }, [contact.cross_list_status]);

  const list = bootstrap.list as { name: string; total_items?: number; completed_items?: number };
  const total = list.total_items ?? 0;
  const completed = list.completed_items ?? 0;
  const remaining = Math.max(total - completed, 0);

  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-muted/20"
      onPointerDownCapture={renewClaim}
      onKeyDownCapture={renewClaim}
    >
      <DesktopShellHeader
        listName={list.name}
        callerLabel={caller.label}
        claimedAt={liveClaimedAt}
        onSwitchToMobile={onSwitchToMobile}
        onLogout={dataSource.onLogout}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 pb-28">
        {error ? (
          <p className="mb-4 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-800">{error}</p>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* ── Left: record the outcome ── */}
          <div className="space-y-5 lg:col-span-7">
            <DesktopContactPanel contact={contact} recentCrossListContact={recentCrossListContact} />

            <section className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
              <MobileDialOutcomeBar value={flowState.dialDisposition} onSelect={handleDial} />

              {isPreCall ? (
                <p className="rounded-xl border border-dashed p-3 text-center text-sm text-muted-foreground">
                  Dial the number above, then record what happened on the call.
                </p>
              ) : null}

              {isConnected ? (
                <>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <SupportLevelSelect value={supportLevel} onChange={setSupportLevel} />
                    <CallDispositionSelect value={callDisposition} onChange={setCallDisposition} />
                  </div>
                  <MobileCtaPanel
                    ambitions={bootstrap.ctaAmbitions}
                    values={ctaRatings}
                    onChange={(id, next) => {
                      setCtaRatings((prev) => {
                        const map = new Map(prev);
                        if (next == null) map.delete(id);
                        else map.set(id, next);
                        return map;
                      });
                      if (next != null) {
                        dialerTelemetry.ctaRated({ item_id: contact.item_id, cta_ambition_id: id });
                      }
                    }}
                  />
                  <MobileAssessmentPanel
                    assessments={bootstrap.sessionAssessments}
                    values={assessmentValues}
                    onChange={(activityId, next) => {
                      setAssessmentValues((prev) => {
                        const map = new Map(prev);
                        if (next == null) map.delete(activityId);
                        else map.set(activityId, next);
                        return map;
                      });
                      if (next != null) {
                        dialerTelemetry.assessmentRated({
                          item_id: contact.item_id,
                          activity_id: activityId,
                        });
                      }
                    }}
                  />
                </>
              ) : null}
            </section>

            {flowState.dialDisposition ? (
              <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
                <MobileOutcomeWheel
                  value={outcome}
                  onChange={(next) => {
                    setOutcome(next);
                    dialerTelemetry.outcomeSelected({
                      item_id: contact.item_id,
                      outcome_classification: next,
                    });
                  }}
                />
                {outcome && OUTCOME_META[outcome]?.schedulesCallback ? (
                  <MobileCallbackPicker value={callbackAt} onChange={setCallbackAt} />
                ) : null}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Notes
                  </label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="What happened? What did they care about?"
                    rows={4}
                    className="text-sm"
                  />
                </div>
              </section>
            ) : null}
          </div>

          {/* ── Right: reference + progress ── */}
          <div className="space-y-5 lg:col-span-5">
            {isConnected && sections.length > 0 ? (
              <section className="rounded-2xl border bg-card p-5 shadow-sm">
                <MobileConversationStepper
                  sections={sections}
                  currentIndex={flowState.currentSectionIndex}
                  reachedSections={stepReached}
                  stepNotes={stepNotes}
                  onAdvance={() => {
                    if (canAdvanceSection(flowState, sections.length)) {
                      setStepReached((prev) => new Set([...prev, flowState.currentSectionIndex + 1]));
                      dispatch({ type: "ADVANCE_SECTION" });
                    }
                  }}
                  onGoTo={(index) => {
                    setStepReached((prev) => new Set([...prev, index]));
                    dispatch({ type: "GO_TO_SECTION", sectionIndex: index });
                  }}
                  onSetReached={(index, reached) => {
                    setStepReached((prev) => {
                      const next = new Set(prev);
                      if (reached) next.add(index);
                      else next.delete(index);
                      return next;
                    });
                  }}
                  onNoteChange={(index, note) =>
                    setStepNotes((prev) => ({ ...prev, [index]: note }))
                  }
                  workerContext={scriptVariables}
                />
              </section>
            ) : null}

            {isConnected ? (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setShowObjections(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm font-medium shadow-sm transition hover:bg-muted"
                >
                  <ShieldAlert className="h-4 w-4" />
                  Objections
                  {flowState.capturedObjections.length > 0 ? (
                    <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                      {flowState.capturedObjections.length}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => setShowIssues(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm font-medium shadow-sm transition hover:bg-muted"
                >
                  <Flame className="h-4 w-4" />
                  Issues
                  {flowState.capturedIssues.length > 0 ? (
                    <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                      {flowState.capturedIssues.length}
                    </span>
                  ) : null}
                </button>
              </div>
            ) : null}

            <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                List progress
              </p>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular-nums">{remaining}</span>
                <span className="text-xs text-muted-foreground">remaining of {total}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${total > 0 ? Math.min(100, (completed / total) * 100) : 0}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                You&apos;ve recorded {recent.length} call{recent.length === 1 ? "" : "s"} this session.
              </p>
            </section>

            {recent.length > 0 ? (
              <section className="rounded-2xl border bg-card p-5 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <History className="h-3.5 w-3.5" />
                  Your recent calls
                </p>
                <ul className="mt-2 divide-y">
                  {recent.slice(0, 8).map((entry) => {
                    const meta = entry.outcome_classification
                      ? OUTCOME_META[entry.outcome_classification]
                      : null;
                    return (
                      <li
                        key={entry.attempt_id}
                        className="flex items-center justify-between gap-3 py-2 text-sm"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {entry.contact_label}
                        </span>
                        {meta ? (
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                            {meta.label}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      </main>

      {/* ── Sticky action bar ── */}
      <div className="sticky bottom-0 z-30 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-6 py-3">
          <SkipMenu onSelect={(reason) => void handleSkipWithReason(reason)} />
          <button
            type="button"
            onClick={onHandBack}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Hand back
          </button>
          <div className="flex-1" />
          <button
            type="button"
            disabled={submitting || !outcome}
            onClick={() => void finalize()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <PhoneForwarded className="h-5 w-5" aria-hidden="true" />
            )}
            Save &amp; next contact
          </button>
        </div>
      </div>

      <MobileObjectionsSheet
        open={showObjections}
        onClose={() => setShowObjections(false)}
        bank={bootstrap.objectionBank}
        captured={flowState.capturedObjections}
        onAdd={(objection: CapturedObjection) => {
          dialerTelemetry.objectionLogged({
            item_id: contact.item_id,
            source: objection.objection_id != null ? "bank" : "custom",
          });
          dispatch({ type: "ADD_OBJECTION", objection });
        }}
        onUpdate={(index, objection: CapturedObjection) =>
          dispatch({ type: "UPDATE_OBJECTION", index, objection })
        }
        onRemove={(index) => dispatch({ type: "REMOVE_OBJECTION", index })}
      />

      <MobileIssuesSheet
        open={showIssues}
        onClose={() => setShowIssues(false)}
        expected={bootstrap.expectedIssues}
        captured={flowState.capturedIssues}
        onAdd={(issue: CapturedIssue) => {
          dialerTelemetry.issueLogged({ item_id: contact.item_id, heat: issue.heat ?? null });
          dispatch({ type: "ADD_ISSUE", issue });
        }}
        onUpdate={(index, issue: CapturedIssue) => dispatch({ type: "UPDATE_ISSUE", index, issue })}
        onRemove={(index) => dispatch({ type: "REMOVE_ISSUE", index })}
      />
    </div>
  );
}

function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (next: T | null) => void;
}) {
  return (
    <section className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(selected ? null : option.value)}
              aria-pressed={selected}
              className={`inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium transition ${
                selected
                  ? "border-primary bg-primary text-primary-foreground shadow"
                  : "border-muted-foreground/20 bg-background hover:bg-muted"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SupportLevelSelect({
  value,
  onChange,
}: {
  value: SupportLevel | null;
  onChange: (next: SupportLevel | null) => void;
}) {
  return (
    <ChipRow<SupportLevel>
      label="Support level"
      value={value}
      onChange={onChange}
      options={[
        { value: "strong_supporter", label: "Strong supporter" },
        { value: "supporter", label: "Supporter" },
        { value: "neutral", label: "Neutral" },
        { value: "unsupportive", label: "Unsupportive" },
        { value: "hostile", label: "Hostile" },
      ]}
    />
  );
}

function CallDispositionSelect({
  value,
  onChange,
}: {
  value: CallDisposition | null;
  onChange: (next: CallDisposition | null) => void;
}) {
  return (
    <ChipRow<CallDisposition>
      label="Conversation outcome"
      value={value}
      onChange={onChange}
      options={[
        { value: "completed_positive", label: "Positive outcome" },
        { value: "completed_neutral", label: "Neutral outcome" },
        { value: "completed_negative", label: "Negative outcome" },
        { value: "partial_hung_up", label: "Hung up" },
        { value: "partial_asked_callback", label: "Asked for callback" },
        { value: "referred_to_other", label: "Referred to other" },
        { value: "removed_from_campaign", label: "Remove from campaign" },
        { value: "no_longer_in_universe", label: "No longer in universe" },
      ]}
    />
  );
}

function SkipMenu({ onSelect }: { onSelect: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <SkipForward className="h-4 w-4" />
        Skip
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-60 rounded-xl border bg-popover p-1.5 shadow-lg">
          <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Skip reason
          </p>
          {SKIP_REASONS.map((reason) => (
            <button
              key={reason.value}
              type="button"
              onClick={() => {
                setOpen(false);
                onSelect(reason.label);
              }}
              className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-accent"
            >
              {reason.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
