"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Loader2, PhoneForwarded, ShieldAlert, Flame, SkipForward, ArrowLeft } from "lucide-react";
import {
  callFlowReducer,
  getInitialCallFlowState,
  canAdvanceSection,
  type CapturedObjection,
  type CapturedIssue,
} from "@/lib/phone/call-flow-state";
import {
  deriveOutcomeClassification,
  type OutcomeClassification,
  OUTCOME_META,
} from "@/lib/phone/outcome-model";
import { tokens } from "@/lib/ui/dialer-tokens";
import { MobileHeader } from "@/components/phone/mobile/primitives/MobileHeader";
import { MobileCallButton } from "@/components/phone/mobile/primitives/MobileCallButton";
import { MobileNotesField } from "@/components/phone/mobile/primitives/MobileNotesField";
import { MobileDialOutcomeBar } from "@/components/phone/mobile/in-call/MobileDialOutcomeBar";
import { MobileConversationStepper } from "@/components/phone/mobile/in-call/MobileConversationStepper";
import { MobileCtaPanel } from "@/components/phone/mobile/in-call/MobileCtaPanel";
import { MobileAssessmentPanel, type AssessmentValue } from "@/components/phone/mobile/in-call/MobileAssessmentPanel";
import { MobileObjectionsSheet } from "@/components/phone/mobile/in-call/MobileObjectionsSheet";
import { MobileIssuesSheet } from "@/components/phone/mobile/in-call/MobileIssuesSheet";
import { MobileOutcomeWheel } from "@/components/phone/mobile/in-call/MobileOutcomeWheel";
import { MobileCallbackPicker } from "@/components/phone/mobile/in-call/MobileCallbackPicker";
import { useScriptVariables } from "@/lib/phone/session/use-script-variables";
import { useClaimAutoRenew } from "@/lib/phone/session/use-claim-auto-renew";
import { hapticError, hapticSuccess, hapticTap } from "@/lib/phone/haptics";
import { dialerTelemetry } from "@/lib/phone/telemetry";
import type { CallSessionDataSource } from "@/lib/phone/session/types";
import type { CtaRatingValue } from "@/components/phone/CtaRatingsPanel";
import type {
  CallDisposition,
  CallListItemWithWorker,
  CallScriptSection,
  CapturedAssessmentRatingPayload,
  CapturedCtaRatingPayload,
  RecordCallAttemptRequest,
  SupportLevel,
} from "@/types/planner-types";

const SKIP_REASONS: { value: string; label: string }[] = [
  { value: "no_phone", label: "No phone on file" },
  { value: "not_ready", label: "Not ready yet" },
  { value: "language_barrier", label: "Language barrier" },
  { value: "other_caller", label: "Other caller better suited" },
  { value: "personal_relationship", label: "Conflict of interest" },
];

interface MobileCallSessionProps {
  contact: CallListItemWithWorker;
  dataSource: CallSessionDataSource;
  /** Called once the attempt is recorded; parent picks up the next contact. */
  onAttemptRecorded: (result: {
    attempt_id: number;
    outcome_classification: OutcomeClassification | null;
    contact: CallListItemWithWorker;
  }) => void;
  /** Skip without dialling (records no_answer silently). */
  onSkipContact: () => void;
  /** Hand the claim back without recording any attempt. */
  onHandBack: () => void;
  /** Called when the server confirms the claim has been lost. */
  onClaimLost?: () => void;
}

/**
 * In-call screen. The flow:
 *   1. Contact card pinned at the top with the big green call button.
 *   2. Tap call -> the OS dialer takes over; we move to in-call mode.
 *   3. While connected, the conversation stepper, CTA ratings, and
 *      assessments are visible. Bottom bar offers Objections / Issues / Done.
 *   4. Tap Done -> outcome wheel + callback picker shown in the action bar.
 *   5. Save -> records the attempt with the full payload.
 */
export function MobileCallSession({
  contact,
  dataSource,
  onAttemptRecorded,
  onSkipContact,
  onHandBack,
  onClaimLost,
}: MobileCallSessionProps) {
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
  const [showSkipReasons, setShowSkipReasons] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callStartTime = useRef<Date | null>(null);

  // Drive claim TTL renewal from the in-call surface. The polling renewal
  // covers quiet phases of a call; the `touch()` callback is wired to the
  // root element below so any interaction (tap, scroll, key) refreshes the
  // claim window.
  const { claimedAt: liveClaimedAt, touch: renewClaim } = useClaimAutoRenew({
    dataSource,
    itemId: contact.item_id,
    initialClaimedAt: contact.claimed_at ?? null,
    onClaimLost,
  });

  // Pick the active script (current wave or single script).
  const currentLink =
    bootstrap.linkedScripts.find((link) => link.is_current) ?? bootstrap.linkedScripts[0] ?? null;
  const activeScript =
    currentLink?.call_scripts ??
    (bootstrap.list as { call_scripts?: typeof currentLink extends null ? never : NonNullable<typeof currentLink>["call_scripts"] }).call_scripts ??
    null;
  const sections: CallScriptSection[] = [
    ...((activeScript?.call_script_sections as CallScriptSection[] | undefined) ?? []),
  ].sort((a, b) => a.sort_order - b.sort_order);
  const scriptVariables = useScriptVariables(bootstrap.scriptContext, contact);

  const isPreCall = flowState.dialDisposition == null;
  const isConnected = flowState.dialDisposition === "connected";

  // Auto-derive the outcome whenever its inputs change so the wheel reflects
  // the conversation flow even before the caller explicitly taps a chip.
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

  const handleCallPlaced = useCallback(() => {
    callStartTime.current = new Date();
    hapticTap();
    dialerTelemetry.callPlaced({
      item_id: contact.item_id,
      surface: "share_link",
    });
    dispatch({ type: "START_DIAL" });
  }, [contact.item_id]);

  const handleDial = useCallback(
    (disposition: typeof flowState.dialDisposition) => {
      if (!disposition) return;
      hapticTap();
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
    const duration = callStartTime.current
      ? Math.round((Date.now() - callStartTime.current.getTime()) / 1000)
      : null;

    const stepOutcomes = sections.map((section, index) => ({
      section_id: section.section_id,
      reached: stepReached.has(index),
      outcome_value: null,
      notes: stepNotes[index] || null,
      sort_order: index,
    }));

    const ctaPayload: CapturedCtaRatingPayload[] = Array.from(ctaRatings.entries())
      .filter(([, value]) => value.rating != null || value.binary_value != null)
      .map(([id, value]) => ({
        cta_ambition_id: id,
        rating: value.rating,
        binary_value: value.binary_value,
        notes: value.notes,
      }));

    const assessmentPayload: CapturedAssessmentRatingPayload[] = Array.from(
      assessmentValues.entries(),
    )
      .filter(([, value]) => value.rating != null || (value.notes ?? "").trim().length > 0)
      .map(([activity_id, value]) => ({
        activity_id,
        rating: value.rating,
        notes: value.notes,
      }));

    const attempt: RecordCallAttemptRequest = {
      list_item_id: contact.item_id,
      script_id: activeScript?.script_id ?? bootstrap.list.script_id ?? null,
      dial_disposition: flowState.dialDisposition ?? "no_answer",
      call_disposition: callDisposition,
      overall_notes: notes.trim() || null,
      callback_datetime: callbackAt,
      support_level_assessed: supportLevel,
      cta_response: null,
      duration_seconds: duration,
      outcome_classification: outcome,
      step_outcomes: isConnected ? stepOutcomes : [],
      objections: flowState.capturedObjections,
      issues: flowState.capturedIssues,
      cta_ratings: ctaPayload,
      assessment_ratings: assessmentPayload,
      action_id: bootstrap.actionId,
    };

    try {
      const result = await dataSource.recordAttempt(attempt);
      hapticSuccess();
      if ((result as unknown as { queued_offline?: boolean }).queued_offline) {
        dialerTelemetry.attemptQueuedOffline({ item_id: contact.item_id });
      } else {
        dialerTelemetry.attemptRecorded({
          item_id: contact.item_id,
          attempt_id: result.attempt_id,
          outcome_classification: outcome,
          duration_seconds: duration,
        });
      }
      onAttemptRecorded({
        attempt_id: result.attempt_id,
        outcome_classification: outcome,
        contact,
      });
    } catch (err) {
      hapticError();
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
      const attempt: RecordCallAttemptRequest = {
        list_item_id: contact.item_id,
        script_id: activeScript?.script_id ?? bootstrap.list.script_id ?? null,
        dial_disposition: "no_answer",
        overall_notes: `[skipped: ${reason}]${notes ? `\n${notes}` : ""}`,
        outcome_classification: "unable_to_reach",
        action_id: bootstrap.actionId,
      };
      try {
        await dataSource.recordAttempt(attempt);
        dialerTelemetry.skipUsed({ item_id: contact.item_id, reason });
        onSkipContact();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to record skip");
      }
    },
    [
      activeScript,
      bootstrap.actionId,
      bootstrap.list.script_id,
      contact.item_id,
      dataSource,
      notes,
      onSkipContact,
    ],

  );

  const fullName =
    `${contact.worker?.first_name ?? ""} ${contact.worker?.last_name ?? ""}`.trim() ||
    "Unnamed contact";

  return (
    <div
      className={tokens.layout.mobileScreen}
      onPointerDownCapture={renewClaim}
      onKeyDownCapture={renewClaim}
    >
      <MobileHeader
        listName={bootstrap.list.name}
        callerLabel={caller.label}
        claimedAt={liveClaimedAt}
        onLogout={dataSource.onLogout}
      />

      <main className="flex-1 space-y-4 px-4 pt-4">
        <header className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Now calling
              </p>
              <h2 className={tokens.type.title}>{fullName}</h2>
              {contact.worker?.occupation ? (
                <p className="text-xs text-muted-foreground">{contact.worker.occupation}</p>
              ) : null}
            </div>
            {flowState.dialDisposition ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  isConnected
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {flowState.dialDisposition.replace(/_/g, " ")}
              </span>
            ) : null}
          </div>
          {error ? (
            <p className="mt-2 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          ) : null}
        </header>

        {isPreCall ? (
          <p className="rounded-xl border border-dashed p-3 text-center text-sm text-muted-foreground">
            Tap the green call button when you’re ready, then pick what happened.
          </p>
        ) : (
          <MobileDialOutcomeBar
            value={flowState.dialDisposition}
            onSelect={handleDial}
          />
        )}

        {isConnected ? (
          <>
            <MobileConversationStepper
              sections={sections}
              currentIndex={flowState.currentSectionIndex}
              reachedSections={stepReached}
              stepNotes={stepNotes}
              onAdvance={() => {
                if (canAdvanceSection(flowState, sections.length)) {
                  setStepReached(
                    (prev) => new Set([...prev, flowState.currentSectionIndex + 1]),
                  );
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
                  dialerTelemetry.ctaRated({
                    item_id: contact.item_id,
                    cta_ambition_id: id,
                  });
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

            <SupportLevelSelect value={supportLevel} onChange={setSupportLevel} />

            <CallDispositionSelect value={callDisposition} onChange={setCallDisposition} />
          </>
        ) : null}

        {flowState.dialDisposition ? (
          <>
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
            <MobileNotesField
              value={notes}
              onChange={setNotes}
              label="Notes"
              placeholder="What happened? What did they care about?"
            />
          </>
        ) : null}
      </main>

      <div className={tokens.layout.mobileActionBar}>
        {isPreCall && contact.worker?.phone ? (
          <MobileCallButton
            phoneNumber={contact.worker.phone}
            contactLabel={fullName}
            onCallPlaced={handleCallPlaced}
          />
        ) : null}

        {flowState.dialDisposition ? (
          <button
            type="button"
            disabled={submitting || !outcome}
            onClick={() => void finalize()}
            className={tokens.buttons.actionPrimary}
          >
            {submitting ? (
              <Loader2
                className="h-5 w-5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <PhoneForwarded className="h-5 w-5" aria-hidden="true" />
            )}
            Save & next contact
          </button>
        ) : null}

        {isConnected ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShowObjections(true)}
              className={tokens.buttons.actionSecondary}
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
              className={tokens.buttons.actionSecondary}
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

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setShowSkipReasons(true)}
            className={tokens.buttons.actionSecondary}
          >
            <SkipForward className="h-4 w-4" />
            Skip
          </button>
          <button
            type="button"
            onClick={onHandBack}
            className={tokens.buttons.actionSecondary}
          >
            <ArrowLeft className="h-4 w-4" />
            Hand back
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
          dialerTelemetry.issueLogged({
            item_id: contact.item_id,
            heat: issue.heat ?? null,
          });
          dispatch({ type: "ADD_ISSUE", issue });
        }}
        onUpdate={(index, issue: CapturedIssue) =>
          dispatch({ type: "UPDATE_ISSUE", index, issue })
        }
        onRemove={(index) => dispatch({ type: "REMOVE_ISSUE", index })}
      />

      <SkipReasonsSheet
        open={showSkipReasons}
        onClose={() => setShowSkipReasons(false)}
        onSelect={(reason) => {
          setShowSkipReasons(false);
          void handleSkipWithReason(reason);
        }}
      />
    </div>
  );
}

function SupportLevelSelect({
  value,
  onChange,
}: {
  value: SupportLevel | null;
  onChange: (next: SupportLevel | null) => void;
}) {
  const SUPPORT_OPTIONS: { value: SupportLevel; label: string }[] = [
    { value: "strong_supporter", label: "Strong supporter" },
    { value: "supporter", label: "Supporter" },
    { value: "neutral", label: "Neutral" },
    { value: "unsupportive", label: "Unsupportive" },
    { value: "hostile", label: "Hostile" },
  ];

  return (
    <section className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Support level
      </p>
      <div className="flex flex-wrap gap-1.5">
        {SUPPORT_OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(selected ? null : option.value)}
              aria-pressed={selected}
              className={`inline-flex h-10 items-center rounded-full border px-3 text-sm font-medium ${
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

function CallDispositionSelect({
  value,
  onChange,
}: {
  value: CallDisposition | null;
  onChange: (next: CallDisposition | null) => void;
}) {
  const OPTIONS: { value: CallDisposition; label: string }[] = [
    { value: "completed_positive", label: "Positive outcome" },
    { value: "completed_neutral", label: "Neutral outcome" },
    { value: "completed_negative", label: "Negative outcome" },
    { value: "partial_hung_up", label: "Hung up" },
    { value: "partial_asked_callback", label: "Asked for callback" },
    { value: "referred_to_other", label: "Referred to other" },
    { value: "removed_from_campaign", label: "Remove from campaign" },
    { value: "no_longer_in_universe", label: "No longer in universe" },
  ];

  return (
    <section className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Conversation outcome
      </p>
      <div className="flex flex-wrap gap-1.5">
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(selected ? null : option.value)}
              aria-pressed={selected}
              className={`inline-flex h-10 items-center rounded-full border px-3 text-sm font-medium ${
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

function SkipReasonsSheet({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (reason: string) => void;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-black/40"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="grow" />
      <div className="rounded-t-3xl border-t bg-background p-4 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <p className="mb-3 text-sm font-semibold">Skip reason</p>
        <ul className="space-y-1.5">
          {SKIP_REASONS.map((reason) => (
            <li key={reason.value}>
              <button
                type="button"
                onClick={() => onSelect(reason.label)}
                className="w-full rounded-xl border bg-card px-4 py-3 text-left text-sm font-medium hover:bg-muted"
              >
                {reason.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
