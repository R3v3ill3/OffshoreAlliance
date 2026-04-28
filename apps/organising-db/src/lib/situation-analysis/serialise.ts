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
import type { CampaignSituationAnalysis } from "./types";

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

  if (lines.length === 0) return null;

  return `SITUATION ANALYSIS (organiser-confirmed):\n${lines.join("\n")}`;
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
        "employer_interaction_state, employer_state_notes, balloted_count, top_issues, upcoming_workforce_changes, employer_relationships, hr_posture, union_history, strategic_context_summary, company_playbook, workforce_populations, leverage_and_maths, information_gaps"
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
