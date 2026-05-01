import {
  EMPLOYER_INTERACTION_STATES,
  EMPLOYER_RELATIONSHIP_TYPES,
  HR_SENTIMENT_SCALE,
  WORKFORCE_EVENT_SCALES,
  WORKFORCE_EVENT_TYPES,
  type EmployerInteractionState,
  type EmployerRelationshipType,
  type HrSentiment,
  type WorkforceEventScale,
  type WorkforceEventType,
} from "./constants";
import type {
  CampaignSituationAnalysis,
  KeyDispute,
  PriorEmployerBallot,
  SituationAnalysisDraft,
} from "./types";

/**
 * Loosely typed handle for the supabase client. We accept `any` rather
 * than a precise generic so callers can pass either the browser client or
 * the server client (both have very deep generic types) without forcing a
 * regeneration of `@oa/db-types` for the new
 * `campaign_situation_analyses` table — once that regen lands, callers
 * can swap in `SupabaseClient<Database>` here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

function labelFor<T extends { id: string; label: string }>(
  list: readonly T[],
  id: string | null | undefined
): string | null {
  if (!id) return null;
  return list.find((item) => item.id === id)?.label ?? id;
}

/**
 * Render the saved situation analysis as a compact, structured text block
 * suitable for stuffing into AI system / user prompts. Returns null when
 * the campaign has no analysis on file (or when the row is essentially
 * empty), so callers can short-circuit.
 *
 * Kept strictly under ~2 KB by:
 *   - using closed-vocab labels (no free-text in enum positions)
 *   - capping list lengths (top 5 issues, top 4 changes, top 4 relationships,
 *     top 5 playbook moves, top 5 populations, top 5 gaps)
 *   - omitting empty sections entirely
 */
export function renderSituationContext(
  row: Partial<CampaignSituationAnalysis> | null | undefined
): string | null {
  if (!row) return null;

  const lines: string[] = [];
  const stateLabel = labelFor(
    EMPLOYER_INTERACTION_STATES,
    row.employer_interaction_state as EmployerInteractionState | null
  );
  if (stateLabel) {
    let stateLine = `- State: ${stateLabel}`;
    if (
      row.employer_interaction_state === "agreement_balloted" &&
      row.balloted_count
    ) {
      stateLine += ` (balloted ${row.balloted_count}×)`;
    }
    if (row.employer_state_notes) {
      stateLine += `. "${truncate(row.employer_state_notes, 240)}"`;
    }
    lines.push(stateLine);
  }

  // Top issues — sort by heat desc.
  if (row.top_issues && row.top_issues.length > 0) {
    const issues = [...row.top_issues]
      .filter((i) => i.label && i.label.trim().length > 0)
      .sort((a, b) => (b.heat ?? 0) - (a.heat ?? 0))
      .slice(0, 5);
    if (issues.length > 0) {
      lines.push(
        `- Top issues: ${issues
          .map((i) => `${i.label} (${i.heat}/5)`)
          .join("; ")}`
      );
    }
  }

  if (row.upcoming_workforce_changes && row.upcoming_workforce_changes.length > 0) {
    const changes = row.upcoming_workforce_changes.slice(0, 4);
    lines.push(
      `- Upcoming workforce events: ${changes
        .map((c) => {
          const typeLabel =
            labelFor(WORKFORCE_EVENT_TYPES, c.event_type as WorkforceEventType) ??
            c.event_type;
          const scaleLabel = labelFor(
            WORKFORCE_EVENT_SCALES,
            c.scale as WorkforceEventScale | null
          );
          const date = c.expected_date ? ` (${c.expected_date})` : "";
          const scale = scaleLabel ? ` [${scaleLabel}]` : "";
          return `${typeLabel}: ${c.label || "—"}${date}${scale}`;
        })
        .join("; ")}`
    );
  }

  if (row.employer_relationships && row.employer_relationships.length > 0) {
    const rels = row.employer_relationships.slice(0, 4);
    lines.push(
      `- Employer relationships: ${rels
        .map((r) => {
          const typeLabel =
            labelFor(
              EMPLOYER_RELATIONSHIP_TYPES,
              r.relationship_type as EmployerRelationshipType
            ) ?? r.relationship_type;
          const behaviour = r.recent_behaviour
            ? ` — "${truncate(r.recent_behaviour, 160)}"`
            : "";
          return `${r.related_employer_name} (${typeLabel})${behaviour}`;
        })
        .join("; ")}`
    );
  }

  if (row.hr_posture && (row.hr_posture.sentiment || row.hr_posture.notes)) {
    const sentimentLabel = labelFor(
      HR_SENTIMENT_SCALE,
      row.hr_posture.sentiment as HrSentiment | null
    );
    const parts: string[] = [];
    if (sentimentLabel) parts.push(sentimentLabel);
    if (row.hr_posture.notes) parts.push(`"${truncate(row.hr_posture.notes, 200)}"`);
    if ((row.hr_posture.contacts ?? []).length > 0) {
      const contacts = (row.hr_posture.contacts ?? [])
        .slice(0, 3)
        .map((c) => `${c.name}${c.role ? ` (${c.role})` : ""}`)
        .join(", ");
      parts.push(`contacts: ${contacts}`);
    }
    if (parts.length > 0) {
      lines.push(`- HR posture: ${parts.join("; ")}`);
    }
  }

  if (row.union_history) {
    const h = row.union_history;
    const parts: string[] = [];
    if (typeof h.prior_eba_count === "number") {
      parts.push(`${h.prior_eba_count} prior EBA${h.prior_eba_count === 1 ? "" : "s"}`);
    }
    if ((h.prior_ballot_outcomes ?? []).length > 0) {
      parts.push(
        `prior ballots: ${(h.prior_ballot_outcomes ?? [])
          .slice(0, 3)
          .map((b) => {
            const pct =
              b.yes_pct != null && b.no_pct != null
                ? ` (${b.no_pct}% no / ${b.yes_pct}% yes)`
                : "";
            return `${b.when ? `${b.when}: ` : ""}${b.outcome || "—"}${pct}`;
          })
          .join("; ")}`
      );
    }
    if (h.delegate_structure) {
      parts.push(`delegate structure: ${h.delegate_structure}`);
    }
    if (parts.length > 0) lines.push(`- Union history: ${parts.join("; ")}`);
  }

  if (row.company_playbook && row.company_playbook.length > 0) {
    const moves = row.company_playbook.slice(0, 5);
    lines.push(
      `- Predicted employer playbook (organiser-confirmed): ${moves
        .map((m) =>
          m.disruption_point
            ? `${m.move} (counter: ${m.disruption_point})`
            : m.move
        )
        .join("; ")}`
    );
  }

  if (row.workforce_populations && row.workforce_populations.length > 0) {
    const pops = row.workforce_populations.slice(0, 5);
    lines.push(
      `- Workforce populations: ${pops
        .map((p) => {
          const size = p.approx_size ? ` (${p.approx_size})` : "";
          const emphasis = p.soc_emphasis
            ? ` — ${truncate(p.soc_emphasis, 140)}`
            : "";
          return `${p.name}${size}${emphasis}`;
        })
        .join("; ")}`
    );
  }

  if (row.leverage_and_maths) {
    const l = row.leverage_and_maths;
    const parts: string[] = [];
    if (l.timing_constraints) parts.push(`timing: ${truncate(l.timing_constraints, 200)}`);
    if (l.vote_arithmetic) parts.push(`vote maths: ${truncate(l.vote_arithmetic, 200)}`);
    if (l.regulatory_window) parts.push(`regulatory: ${truncate(l.regulatory_window, 200)}`);
    if (parts.length > 0) lines.push(`- Leverage & maths: ${parts.join("; ")}`);
  }

  if (row.strategic_context_summary) {
    lines.unshift(`- Summary: ${truncate(row.strategic_context_summary, 320)}`);
  }

  if (row.information_gaps && row.information_gaps.length > 0) {
    const gaps = row.information_gaps.slice(0, 5);
    lines.push(
      `- Information gaps to verify: ${gaps
        .map((g) => g.question)
        .join("; ")}`
    );
  }

  // Bargaining context fields (Phase 2)
  const bargainingRow = row as Partial<SituationAnalysisDraft>;
  if (bargainingRow.nerr_status) {
    const nerrParts = [`NERR: ${bargainingRow.nerr_status}`];
    if (bargainingRow.nerr_status === 'issued' && bargainingRow.nerr_issued_at) {
      nerrParts.push(`issued ${bargainingRow.nerr_issued_at}`);
    }
    lines.push(`- ${nerrParts.join(', ')}`);
  }
  if (bargainingRow.bargaining_phase_state) {
    lines.push(`- Bargaining phase: ${bargainingRow.bargaining_phase_state}`);
  }
  if (bargainingRow.worker_support_estimate != null) {
    lines.push(`- Worker support estimate: ${bargainingRow.worker_support_estimate}%`);
  }
  if (bargainingRow.employer_ballot_intent && bargainingRow.employer_ballot_intent !== 'none') {
    lines.push(`- Employer ballot intent: ${bargainingRow.employer_ballot_intent}`);
  }
  if (bargainingRow.prior_employer_ballots && bargainingRow.prior_employer_ballots.length > 0) {
    const ballots = bargainingRow.prior_employer_ballots.slice(0, 3);
    lines.push(
      `- Prior employer ballots: ${ballots
        .map((b) => {
          const parts: string[] = [];
          if (b.ballot_date) parts.push(b.ballot_date);
          if (b.outcome) parts.push(b.outcome);
          if (b.yes_count != null && b.no_count != null) {
            parts.push(`yes=${b.yes_count} no=${b.no_count}`);
          }
          return parts.join(' ') || '—';
        })
        .join('; ')}`
    );
  }
  if (bargainingRow.key_disputes && bargainingRow.key_disputes.length > 0) {
    const disputes = bargainingRow.key_disputes.slice(0, 5);
    lines.push(
      `- Key disputes: ${disputes.map((d) => d.issue_label).filter(Boolean).join('; ')}`
    );
  }

  if (lines.length === 0) return null;

  return `SITUATION ANALYSIS (organiser-confirmed):\n${lines.join("\n")}`;
}

// ─── Serialise / deserialise helpers for the wizard inline save ───────────────

/**
 * Builds the DB payload from a `SituationAnalysisDraft`, including the Phase 2
 * bargaining context fields. Used by the campaign wizard's
 * `saveSituationAnalysisMutation` and any other direct upsert callers.
 */
export function serialiseSituationAnalysisDraft(
  draft: SituationAnalysisDraft,
  campaignId: number
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    campaign_id: campaignId,
    version: 1,
    is_current: true,
    employer_interaction_state: draft.employer_interaction_state,
    employer_state_notes: draft.employer_state_notes || null,
    balloted_count: draft.balloted_count,
    top_issues: draft.top_issues,
    upcoming_workforce_changes: draft.upcoming_workforce_changes,
    employer_relationships: draft.employer_relationships,
    hr_posture: draft.hr_posture,
    union_history: draft.union_history,
    strategic_context_summary: draft.strategic_context_summary || null,
    company_playbook: draft.company_playbook,
    workforce_populations: draft.workforce_populations,
    leverage_and_maths: draft.leverage_and_maths,
    information_gaps: draft.information_gaps,
    // Bargaining context fields (Phase 2)
    nerr_status: draft.nerr_status ?? null,
    nerr_issued_at: draft.nerr_issued_at ?? null,
    bargaining_phase_state: draft.bargaining_phase_state ?? null,
    employer_ballot_intent: draft.employer_ballot_intent ?? null,
    prior_employer_ballots: draft.prior_employer_ballots ?? [],
    key_disputes: draft.key_disputes ?? [],
    worker_support_estimate: draft.worker_support_estimate ?? null,
  };
  return payload;
}

/**
 * Hydrates a `SituationAnalysisDraft` from a raw DB row (as returned by
 * Supabase). Handles missing bargaining fields gracefully — existing rows
 * without them deserialise as undefined/empty.
 */
export function deserialiseSituationAnalysisDraft(
  row: Record<string, unknown>
): SituationAnalysisDraft {
  return {
    situation_id: (row.situation_id as number) ?? null,
    employer_interaction_state:
      (row.employer_interaction_state as SituationAnalysisDraft['employer_interaction_state'] | null) ?? null,
    employer_state_notes: (row.employer_state_notes as string | null) ?? '',
    balloted_count: (row.balloted_count as number | null) ?? null,
    top_issues: (row.top_issues as SituationAnalysisDraft['top_issues']) ?? [],
    upcoming_workforce_changes:
      (row.upcoming_workforce_changes as SituationAnalysisDraft['upcoming_workforce_changes']) ?? [],
    employer_relationships:
      (row.employer_relationships as SituationAnalysisDraft['employer_relationships']) ?? [],
    hr_posture: (row.hr_posture as SituationAnalysisDraft['hr_posture']) ?? {},
    union_history: (row.union_history as SituationAnalysisDraft['union_history']) ?? {},
    strategic_context_summary: (row.strategic_context_summary as string | null) ?? '',
    company_playbook: (row.company_playbook as SituationAnalysisDraft['company_playbook']) ?? [],
    workforce_populations:
      (row.workforce_populations as SituationAnalysisDraft['workforce_populations']) ?? [],
    leverage_and_maths: (row.leverage_and_maths as SituationAnalysisDraft['leverage_and_maths']) ?? {},
    information_gaps: (row.information_gaps as SituationAnalysisDraft['information_gaps']) ?? [],
    // Bargaining context fields (Phase 2)
    nerr_status:
      (row.nerr_status as SituationAnalysisDraft['nerr_status'] | null) ?? undefined,
    nerr_issued_at: (row.nerr_issued_at as string | null) ?? undefined,
    bargaining_phase_state: (row.bargaining_phase_state as string | null) ?? undefined,
    employer_ballot_intent:
      (row.employer_ballot_intent as SituationAnalysisDraft['employer_ballot_intent'] | null) ?? undefined,
    prior_employer_ballots:
      (row.prior_employer_ballots as PriorEmployerBallot[] | null) ?? [],
    key_disputes: (row.key_disputes as KeyDispute[] | null) ?? [],
    worker_support_estimate:
      (row.worker_support_estimate as number | null) ?? undefined,
  };
}

/**
 * Server-side helper: load the current situation analysis row for a
 * campaign and return the rendered context block. Returns null when the
 * row is missing OR when the table is missing on older environments
 * (old migration baseline). Callers should treat null as "no extra
 * context" rather than an error.
 */
export async function loadSituationContextString(
  supabase: SupabaseLike,
  campaignId: number
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("campaign_situation_analyses")
      .select(
        "employer_interaction_state, employer_state_notes, balloted_count, top_issues, upcoming_workforce_changes, employer_relationships, hr_posture, union_history, strategic_context_summary, company_playbook, workforce_populations, leverage_and_maths, information_gaps, nerr_status, nerr_issued_at, bargaining_phase_state, employer_ballot_intent, prior_employer_ballots, key_disputes, worker_support_estimate"
      )
      .eq("campaign_id", campaignId)
      .eq("is_current", true)
      .maybeSingle();
    if (error) return null;
    return renderSituationContext(
      data as Partial<CampaignSituationAnalysis> | null
    );
  } catch {
    return null;
  }
}

function truncate(input: string, max: number): string {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}
