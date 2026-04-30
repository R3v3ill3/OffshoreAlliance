"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil, Sparkles, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { useSituationAnalysis } from "@/lib/hooks/useSituationAnalysis";
import {
  EMPLOYER_INTERACTION_STATES,
  HR_SENTIMENT_SCALE,
  type EmployerInteractionState,
  type HrSentiment,
} from "@/lib/situation-analysis/constants";
import { cn } from "@/lib/utils/cn";

interface SituationAnalysisCardProps {
  campaignId: number;
  /**
   * When provided, clicking the Edit / Add button calls this callback
   * instead of navigating to the campaign wizard. Use this from surfaces
   * (e.g. the campaign overview tab) that want to open an inline editor
   * rather than bounce the user to a separate page.
   */
  onEdit?: () => void;
  /**
   * When false the Edit / Add button is hidden. Defaults to true so the
   * existing plan-hub usage continues to show the button to all viewers
   * (the wizard itself enforces write permission).
   */
  canWrite?: boolean;
  /**
   * The campaign's current_phase value (Wave 1 addition). When provided,
   * the "Bargaining context" section is shown automatically for campaigns
   * beyond the 'preparing_to_bargain' phase.
   */
  currentPhase?: string | null;
}

/**
 * Read-only summary of the campaign's saved situation analysis. Surfaced
 * on the plan hub and campaign overview tab.
 *
 * - When `onEdit` is provided the button fires the callback (inline sheet).
 * - When `onEdit` is absent the button navigates to the campaign wizard
 *   at step 7 (the original behaviour, preserved for the plan hub page).
 * - When `canWrite` is false the button is not rendered.
 */
export function SituationAnalysisCard({
  campaignId,
  onEdit,
  canWrite = true,
  currentPhase,
}: SituationAnalysisCardProps) {
  const { data, isLoading } = useSituationAnalysis(campaignId);
  const row = data?.row ?? null;

  const editButton = canWrite ? (
    onEdit ? (
      <Button variant="outline" size="sm" onClick={onEdit}>
        <Pencil className="h-4 w-4 mr-2" />
        {row ? "Edit" : "Add"}
      </Button>
    ) : (
      <Button asChild variant="outline" size="sm">
        <Link
          href={`/campaigns/new?cid=${campaignId}&step=7&edit=1`}
          prefetch={false}
        >
          <Pencil className="h-4 w-4 mr-2" />
          {row ? "Edit" : "Add"}
        </Link>
      </Button>
    )
  ) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-sky-500" />
          <CardTitle className="text-base">Situation analysis</CardTitle>
        </div>
        {editButton}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !row ? (
          <p className="text-sm text-muted-foreground">
            No situation analysis on file yet. The wizard captures employer
            state, top issues, predicted playbook and workforce populations —
            comms drafts and theory-of-winning use this as their grounding.
          </p>
        ) : (
          <SituationSummary row={row} currentPhase={currentPhase} />
        )}
      </CardContent>
    </Card>
  );
}

// ── Bargaining context types (Phase 2 additions) ─────────────────────────────
interface BargainingRow {
  nerr_status?: string | null
  nerr_issued_at?: string | null
  bargaining_phase_state?: string | null
  employer_ballot_intent?: string | null
  prior_employer_ballots?: Array<{
    ballot_kind?: string
    conducted_at?: string
    eligible_count?: number
    votes_yes?: number
    votes_no?: number
    outcome?: string
    source_of_evidence?: string
    notes?: string
  }>
  key_disputes?: Array<{
    topic?: string
    oa_position?: string
    employer_position?: string
    urgency?: number
    notes?: string
  }>
  worker_support_estimate?: {
    percent_supportive_estimated?: number
    basis_of_estimate?: string
    notes?: string
  }
}

const NERR_STATUS_LABELS: Record<string, string> = {
  not_issued: 'Not issued',
  issued: 'Issued',
  superseded: 'Superseded',
  unknown: 'Unknown',
}

const BARGAINING_PHASE_LABELS: Record<string, string> = {
  not_commenced: 'Not commenced',
  commenced: 'Commenced',
  stalled: 'Stalled',
  agreement_drafting: 'Agreement drafting',
  balloted: 'Balloted',
  post_settlement: 'Post settlement',
  unknown: 'Unknown',
}

const BALLOT_INTENT_LABELS: Record<string, string> = {
  none: 'None',
  signalled: 'Signalled',
  imminent: 'Imminent',
  unknown: 'Unknown',
}

function BargainingContextSection({
  row,
  defaultOpen = false,
}: {
  row: BargainingRow
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  const hasData =
    (row.nerr_status && row.nerr_status !== 'unknown') ||
    row.nerr_issued_at ||
    (row.bargaining_phase_state && row.bargaining_phase_state !== 'unknown') ||
    row.employer_ballot_intent ||
    (row.prior_employer_ballots ?? []).length > 0 ||
    (row.key_disputes ?? []).length > 0 ||
    (row.worker_support_estimate &&
      Object.keys(row.worker_support_estimate).length > 0)

  return (
    <div className="border-t pt-3">
      <button
        type="button"
        className="w-full flex items-center justify-between text-left group"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium group-hover:text-foreground transition-colors">
          Bargaining context
        </span>
        <div className="flex items-center gap-1">
          {!hasData && (
            <span className="text-[10px] text-muted-foreground italic">no data</span>
          )}
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          open ? 'max-h-[800px] opacity-100 mt-3' : 'max-h-0 opacity-0'
        )}
      >
        <div className="space-y-3 text-sm">
          {/* NERR + bargaining phase */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                NERR status
              </p>
              <p>
                {row.nerr_status
                  ? NERR_STATUS_LABELS[row.nerr_status] ?? row.nerr_status
                  : <span className="italic text-muted-foreground">Not set</span>}
              </p>
              {row.nerr_issued_at && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Issued {new Date(row.nerr_issued_at).toLocaleDateString('en-AU', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Bargaining phase
              </p>
              {row.bargaining_phase_state ? (
                <p>{BARGAINING_PHASE_LABELS[row.bargaining_phase_state] ?? row.bargaining_phase_state}</p>
              ) : (
                <p className="italic text-muted-foreground">Not set</p>
              )}
            </div>
          </div>

          {/* Employer ballot intent */}
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Employer ballot intent
            </p>
            {row.employer_ballot_intent ? (
              <p>{BALLOT_INTENT_LABELS[row.employer_ballot_intent] ?? row.employer_ballot_intent}</p>
            ) : (
              <p className="italic text-muted-foreground">Not set</p>
            )}
          </div>

          {/* Worker support estimate */}
          {row.worker_support_estimate &&
            row.worker_support_estimate.percent_supportive_estimated != null && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Worker support estimate
                </p>
                <p>
                  <span className="font-semibold">
                    {row.worker_support_estimate.percent_supportive_estimated}%
                  </span>{' '}
                  supportive (estimated)
                </p>
                {row.worker_support_estimate.basis_of_estimate && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Basis: {row.worker_support_estimate.basis_of_estimate}
                  </p>
                )}
                {row.worker_support_estimate.notes && (
                  <p className="text-xs text-muted-foreground">
                    {row.worker_support_estimate.notes}
                  </p>
                )}
              </div>
            )}

          {/* Key disputes */}
          {(row.key_disputes ?? []).length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Key disputes
              </p>
              <ul className="space-y-1.5">
                {(row.key_disputes ?? []).slice(0, 5).map((d, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {d.urgency != null && (
                      <Badge variant="secondary" className="shrink-0 mt-0.5">
                        {d.urgency}/5
                      </Badge>
                    )}
                    <div className="min-w-0">
                      <span className="font-medium">{d.topic}</span>
                      {d.oa_position && (
                        <span className="text-muted-foreground"> — OA: {d.oa_position}</span>
                      )}
                      {d.employer_position && (
                        <span className="text-muted-foreground">
                          {' '} / Employer: {d.employer_position}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Prior employer ballots */}
          {(row.prior_employer_ballots ?? []).length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Prior employer ballots
              </p>
              <ul className="space-y-1 list-disc list-inside">
                {(row.prior_employer_ballots ?? []).map((b, i) => (
                  <li key={i}>
                    {b.ballot_kind && (
                      <span className="font-medium">{b.ballot_kind} </span>
                    )}
                    {b.conducted_at && (
                      <span className="text-muted-foreground">
                        ({new Date(b.conducted_at).toLocaleDateString('en-AU', {
                          month: 'short', year: 'numeric',
                        })})
                      </span>
                    )}
                    {b.outcome && (
                      <span className="text-muted-foreground"> — {b.outcome}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SituationSummary({
  row,
  currentPhase,
}: {
  row: NonNullable<ReturnType<typeof useSituationAnalysis>["data"]>["row"];
  currentPhase?: string | null;
}) {
  if (!row) return null;

  // Auto-expand bargaining context when campaign is beyond preparing_to_bargain.
  // The section is always rendered so organisers can expand it via the toggle
  // even for campaigns still in the preparing_to_bargain phase.
  const bargainingDefaultOpen = currentPhase !== 'preparing_to_bargain'

  const stateLabel = EMPLOYER_INTERACTION_STATES.find(
    (s) => s.id === (row.employer_interaction_state as EmployerInteractionState | null)
  )?.label;

  const hrLabel = HR_SENTIMENT_SCALE.find(
    (s) => s.id === (row.hr_posture?.sentiment as HrSentiment | null | undefined)
  )?.label;

  const topIssues = (row.top_issues ?? [])
    .filter((i) => i.label && i.label.trim().length > 0)
    .sort((a, b) => (b.heat ?? 0) - (a.heat ?? 0))
    .slice(0, 5);

  const playbook = (row.company_playbook ?? []).slice(0, 4);
  const populations = (row.workforce_populations ?? []).slice(0, 4);
  const gaps = (row.information_gaps ?? []).slice(0, 5);

  return (
    <div className="space-y-4 text-sm">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Employer state
          </p>
          {stateLabel ? (
            <p>{stateLabel}</p>
          ) : (
            <p className="italic text-muted-foreground">Not set</p>
          )}
          {row.employer_state_notes && (
            <p className="text-xs text-muted-foreground mt-1">
              {row.employer_state_notes}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            HR posture
          </p>
          {hrLabel ? (
            <p>{hrLabel}</p>
          ) : (
            <p className="italic text-muted-foreground">Not set</p>
          )}
        </div>
      </div>

      {topIssues.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Top issues
          </p>
          <ul className="space-y-1">
            {topIssues.map((issue, i) => (
              <li key={i} className="flex items-center gap-2">
                <Badge variant="secondary">{issue.heat}/5</Badge>
                <span>{issue.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {playbook.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Predicted employer playbook
          </p>
          <ul className="space-y-1 list-disc list-inside">
            {playbook.map((move, i) => (
              <li key={i}>
                <span className="font-medium">{move.move}</span>
                {move.disruption_point && (
                  <span className="text-muted-foreground">
                    {" "}
                    — counter: {move.disruption_point}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {populations.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Workforce populations
          </p>
          <ul className="space-y-1">
            {populations.map((pop, i) => (
              <li key={i}>
                <span className="font-medium">{pop.name}</span>
                {pop.approx_size != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    (~{pop.approx_size})
                  </span>
                )}
                {pop.soc_emphasis && (
                  <span className="text-muted-foreground"> — {pop.soc_emphasis}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {gaps.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900 p-3">
          <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-amber-900 dark:text-amber-200 mb-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Information gaps to verify
          </p>
          <ul className="space-y-1 list-disc list-inside">
            {gaps.map((gap, i) => (
              <li key={i}>{gap.question}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Bargaining context — always rendered so organisers can use the toggle.
          defaultOpen=true when campaign is beyond preparing_to_bargain. */}
      <BargainingContextSection
        row={row as unknown as BargainingRow}
        defaultOpen={bargainingDefaultOpen}
      />

      <p className="text-xs text-muted-foreground italic pt-2 border-t">
        Last updated {new Date(row.updated_at).toLocaleString()}
        {row.ai_generated ? " · AI-assisted" : ""}
      </p>
    </div>
  );
}
