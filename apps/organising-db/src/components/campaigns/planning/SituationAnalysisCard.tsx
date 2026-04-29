"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil, Sparkles, AlertTriangle } from "lucide-react";
import { useSituationAnalysis } from "@/lib/hooks/useSituationAnalysis";
import {
  EMPLOYER_INTERACTION_STATES,
  HR_SENTIMENT_SCALE,
  type EmployerInteractionState,
  type HrSentiment,
} from "@/lib/situation-analysis/constants";

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
          <SituationSummary row={row} />
        )}
      </CardContent>
    </Card>
  );
}

function SituationSummary({
  row,
}: {
  row: NonNullable<ReturnType<typeof useSituationAnalysis>["data"]>["row"];
}) {
  if (!row) return null;

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

      <p className="text-xs text-muted-foreground italic pt-2 border-t">
        Last updated {new Date(row.updated_at).toLocaleString()}
        {row.ai_generated ? " · AI-assisted" : ""}
      </p>
    </div>
  );
}
