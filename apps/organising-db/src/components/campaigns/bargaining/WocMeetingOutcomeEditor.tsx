"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WocOutcome {
  employer_offer_summary?: string
  counter_offer_summary?: string
  decision?: "endorsed_counter_offer" | "rejected" | "deferred" | "information_only"
  endorsement_method?: "show_of_hands" | "online_vote" | "secret_ballot"
  endorsement_count?: number
  eligible_count?: number
  notes?: string
}

interface FormState {
  employer_offer_summary: string
  counter_offer_summary: string
  decision: WocOutcome["decision"] | ""
  endorsement_method: WocOutcome["endorsement_method"] | ""
  endorsement_count: string
  eligible_count: string
  notes: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyForm(): FormState {
  return {
    employer_offer_summary: "",
    counter_offer_summary: "",
    decision: "",
    endorsement_method: "",
    endorsement_count: "",
    eligible_count: "",
    notes: "",
  }
}

function outcomeToForm(outcome: WocOutcome): FormState {
  return {
    employer_offer_summary: outcome.employer_offer_summary ?? "",
    counter_offer_summary: outcome.counter_offer_summary ?? "",
    decision: outcome.decision ?? "",
    endorsement_method: outcome.endorsement_method ?? "",
    endorsement_count:
      outcome.endorsement_count != null ? String(outcome.endorsement_count) : "",
    eligible_count:
      outcome.eligible_count != null ? String(outcome.eligible_count) : "",
    notes: outcome.notes ?? "",
  }
}

function intOrUndefined(v: string): number | undefined {
  const n = parseInt(v, 10)
  return isNaN(n) ? undefined : n
}

function formToOutcome(form: FormState): WocOutcome {
  const outcome: WocOutcome = {}

  if (form.employer_offer_summary.trim())
    outcome.employer_offer_summary = form.employer_offer_summary.trim()
  if (form.counter_offer_summary.trim())
    outcome.counter_offer_summary = form.counter_offer_summary.trim()
  if (form.decision) outcome.decision = form.decision
  if (form.decision === "endorsed_counter_offer") {
    if (form.endorsement_method)
      outcome.endorsement_method = form.endorsement_method
    const ec = intOrUndefined(form.endorsement_count)
    if (ec != null) outcome.endorsement_count = ec
    const elc = intOrUndefined(form.eligible_count)
    if (elc != null) outcome.eligible_count = elc
  }
  if (form.notes.trim()) outcome.notes = form.notes.trim()

  return outcome
}

function isConcludedByDecision(decision: WocOutcome["decision"] | ""): boolean {
  return decision === "endorsed_counter_offer" || decision === "rejected"
}

const DECISION_LABELS: Record<NonNullable<WocOutcome["decision"]>, string> = {
  endorsed_counter_offer: "Endorsed counter-offer",
  rejected: "Rejected offer",
  deferred: "Deferred (no decision)",
  information_only: "Information only",
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface WocMeetingOutcomeEditorProps {
  eventId: number
  campaignActivityId: number
  /** Pre-populate the form from an existing saved outcome. */
  initialOutcome?: WocOutcome
  /** Called after a successful save. */
  onSave?: () => void
}

/**
 * Form for recording WOC (Wages Outcome Committee) meeting outcomes.
 *
 * Renders when an activity_event has event_kind='meeting' and its parent
 * campaign_activity has activity_kind='woc_meeting'.
 *
 * Persists structured JSONB into activity_events.outcome and toggles
 * is_concluded based on the decision.
 */
export function WocMeetingOutcomeEditor({
  eventId,
  campaignActivityId,
  initialOutcome,
  onSave,
}: WocMeetingOutcomeEditorProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormState>(
    initialOutcome ? outcomeToForm(initialOutcome) : emptyForm()
  )

  // Re-populate when initialOutcome changes (e.g. parent re-fetches)
  useEffect(() => {
    setForm(initialOutcome ? outcomeToForm(initialOutcome) : emptyForm())
  }, [initialOutcome])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const saveMutation = useMutation({
    mutationFn: async (payload: FormState) => {
      const outcome = formToOutcome(payload)
      const is_concluded = isConcludedByDecision(payload.decision)

      const { error } = await (supabase as unknown as ReturnType<typeof createClient>)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("activity_events" as any)
        .update({
          outcome: outcome as unknown as Record<string, unknown>,
          is_concluded,
          ...(is_concluded ? { concluded_at: new Date().toISOString() } : {}),
        })
        .eq("event_id", eventId)

      if (error) {
        const parts = [error.message, error.details, error.hint].filter(Boolean)
        throw new Error(parts.join(" — ") || "Failed to save WOC meeting outcome")
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["activity-events", campaignActivityId],
      })
      queryClient.invalidateQueries({
        queryKey: ["woc-last-outcome"],
      })
      onSave?.()
    },
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await saveMutation.mutateAsync(form)
  }

  const isSubmitting = saveMutation.isPending
  const errorMsg = (saveMutation.error as Error | null)?.message

  const showEndorsementFields = form.decision === "endorsed_counter_offer"

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Employer offer summary */}
      <div className="space-y-1.5">
        <Label htmlFor={`woc-employer-offer-${eventId}`}>
          Employer&apos;s offer summary
        </Label>
        <Textarea
          id={`woc-employer-offer-${eventId}`}
          placeholder="Describe the employer's current offer on the table…"
          rows={3}
          value={form.employer_offer_summary}
          onChange={(e) => set("employer_offer_summary", e.target.value)}
        />
      </div>

      {/* Union counter-offer summary */}
      <div className="space-y-1.5">
        <Label htmlFor={`woc-counter-offer-${eventId}`}>
          Union counter-offer summary
        </Label>
        <Textarea
          id={`woc-counter-offer-${eventId}`}
          placeholder="Describe the union's counter-proposal or position…"
          rows={3}
          value={form.counter_offer_summary}
          onChange={(e) => set("counter_offer_summary", e.target.value)}
        />
      </div>

      {/* Decision */}
      <div className="space-y-1.5">
        <Label htmlFor={`woc-decision-${eventId}`}>Committee decision</Label>
        <Select
          value={form.decision}
          onValueChange={(v) => {
            set("decision", v as WocOutcome["decision"])
            // Clear endorsement fields when decision changes away from endorsed
            if (v !== "endorsed_counter_offer") {
              setForm((prev) => ({
                ...prev,
                decision: v as WocOutcome["decision"],
                endorsement_method: "",
                endorsement_count: "",
                eligible_count: "",
              }))
            }
          }}
        >
          <SelectTrigger id={`woc-decision-${eventId}`}>
            <SelectValue placeholder="Select outcome" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="endorsed_counter_offer">
              {DECISION_LABELS.endorsed_counter_offer}
            </SelectItem>
            <SelectItem value="rejected">{DECISION_LABELS.rejected}</SelectItem>
            <SelectItem value="deferred">{DECISION_LABELS.deferred}</SelectItem>
            <SelectItem value="information_only">
              {DECISION_LABELS.information_only}
            </SelectItem>
          </SelectContent>
        </Select>
        {isConcludedByDecision(form.decision) && (
          <p className="text-xs text-muted-foreground">
            This decision will mark the event as concluded.
          </p>
        )}
      </div>

      {/* Endorsement details — shown only when endorsed */}
      {showEndorsementFields && (
        <fieldset className="space-y-4 rounded-md border p-4">
          <legend className="px-1 text-xs font-semibold text-muted-foreground">
            Endorsement details
          </legend>

          <div className="space-y-1.5">
            <Label htmlFor={`woc-method-${eventId}`}>Endorsement method</Label>
            <Select
              value={form.endorsement_method}
              onValueChange={(v) =>
                set("endorsement_method", v as WocOutcome["endorsement_method"])
              }
            >
              <SelectTrigger id={`woc-method-${eventId}`}>
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="show_of_hands">Show of hands</SelectItem>
                <SelectItem value="online_vote">Online vote</SelectItem>
                <SelectItem value="secret_ballot">Secret ballot</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`woc-endorsed-count-${eventId}`}>
                Endorsed (votes in favour)
              </Label>
              <Input
                id={`woc-endorsed-count-${eventId}`}
                type="number"
                min={0}
                placeholder="e.g. 42"
                value={form.endorsement_count}
                onChange={(e) => set("endorsement_count", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`woc-eligible-count-${eventId}`}>
                Eligible members
              </Label>
              <Input
                id={`woc-eligible-count-${eventId}`}
                type="number"
                min={0}
                placeholder="e.g. 60"
                value={form.eligible_count}
                onChange={(e) => set("eligible_count", e.target.value)}
              />
            </div>
          </div>
        </fieldset>
      )}

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor={`woc-notes-${eventId}`}>Notes</Label>
        <Textarea
          id={`woc-notes-${eventId}`}
          placeholder="Any additional context from the meeting…"
          rows={3}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>

      {errorMsg && (
        <p className="text-sm text-destructive">{errorMsg}</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save outcome
        </Button>
      </div>
    </form>
  )
}
