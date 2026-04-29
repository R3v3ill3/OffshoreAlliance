"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sparkles,
  ChevronDown,
  Loader2,
  Check,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  fetchApi,
  API_FETCH_TIMEOUT_LLM_MS,
} from "@/lib/api/fetch-api";
import type {
  CompanyPlaybookMove,
  InformationGap,
  LeverageAndMaths,
  SituationAnalysisDraft,
  WorkforcePopulation,
} from "@/lib/situation-analysis/types";

interface AiAssistPanelProps {
  campaignId: number;
  draft: SituationAnalysisDraft;
  onApply: (next: SituationAnalysisDraft) => void;
}

interface SuggestResponse {
  strategic_context_summary?: string | null;
  company_playbook?: CompanyPlaybookMove[];
  workforce_populations?: WorkforcePopulation[];
  leverage_and_maths?: LeverageAndMaths;
  information_gaps?: InformationGap[];
  error?: string;
}

/**
 * Phase 2 AI assist: single-shot "Generate suggestions" button that calls
 * /api/situation-analysis/suggest, displays the model's proposed playbook
 * / populations / leverage / gaps, and lets the organiser accept or
 * reject each section before it writes to the draft.
 */
export function AiAssistPanel({ campaignId, draft, onApply }: AiAssistPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<SuggestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setSuggestion(null);
    try {
      const res = await fetchApi("/api/situation-analysis/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaignId, draft }),
        timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? `Request failed (${res.status})`);
      }
      const json = (await res.json()) as SuggestResponse;
      setSuggestion(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  };

  const acceptSection = (
    section:
      | "strategic_context_summary"
      | "company_playbook"
      | "workforce_populations"
      | "leverage_and_maths"
      | "information_gaps"
  ) => {
    if (!suggestion) return;
    if (section === "strategic_context_summary") {
      onApply({
        ...draft,
        strategic_context_summary:
          suggestion.strategic_context_summary ?? draft.strategic_context_summary,
      });
    } else if (section === "company_playbook" && suggestion.company_playbook) {
      onApply({ ...draft, company_playbook: suggestion.company_playbook });
    } else if (
      section === "workforce_populations" &&
      suggestion.workforce_populations
    ) {
      onApply({
        ...draft,
        workforce_populations: suggestion.workforce_populations,
      });
    } else if (section === "leverage_and_maths" && suggestion.leverage_and_maths) {
      onApply({ ...draft, leverage_and_maths: suggestion.leverage_and_maths });
    } else if (section === "information_gaps" && suggestion.information_gaps) {
      onApply({ ...draft, information_gaps: suggestion.information_gaps });
    }
    // Clear that section from the suggestion view so it disappears once
    // applied.
    setSuggestion((prev) => (prev ? { ...prev, [section]: undefined } : prev));
  };

  const rejectSection = (
    section: keyof Omit<SuggestResponse, "error">
  ) => {
    setSuggestion((prev) => (prev ? { ...prev, [section]: undefined } : prev));
  };

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setOpen((s) => !s)}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              Deepen with AI assist (optional)
            </CardTitle>
            <CardDescription>
              Generate a draft &ldquo;company playbook&rdquo;, workforce population
              breakdown, leverage maths, and information-gap list from your
              survey + existing OA data. The model uses only internal data — it
              will not invent regulatory specifics, dates, or vote counts.
              Every suggestion is shown for explicit accept/reject.
            </CardDescription>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate suggestions
                </>
              )}
            </Button>
            {suggestion && (
              <span className="text-xs text-muted-foreground">
                Review each section. Nothing writes until you accept.
              </span>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-3 text-sm text-red-900 dark:text-red-200">
              {error}
            </div>
          )}

          {suggestion && (
            <div className="space-y-4">
              {suggestion.strategic_context_summary && (
                <SuggestionBlock
                  title="Strategic context summary"
                  onAccept={() => acceptSection("strategic_context_summary")}
                  onReject={() => rejectSection("strategic_context_summary")}
                >
                  <p className="text-sm">
                    {suggestion.strategic_context_summary}
                  </p>
                </SuggestionBlock>
              )}

              {suggestion.company_playbook &&
                suggestion.company_playbook.length > 0 && (
                  <SuggestionBlock
                    title="Predicted employer playbook"
                    onAccept={() => acceptSection("company_playbook")}
                    onReject={() => rejectSection("company_playbook")}
                  >
                    <ul className="space-y-2 text-sm">
                      {suggestion.company_playbook.map((move, i) => (
                        <li key={i}>
                          <p className="font-medium">{move.move}</p>
                          {move.why && (
                            <p className="text-muted-foreground text-xs">
                              Why: {move.why}
                            </p>
                          )}
                          {move.disruption_point && (
                            <p className="text-muted-foreground text-xs">
                              Counter: {move.disruption_point}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </SuggestionBlock>
                )}

              {suggestion.workforce_populations &&
                suggestion.workforce_populations.length > 0 && (
                  <SuggestionBlock
                    title="Workforce populations"
                    onAccept={() => acceptSection("workforce_populations")}
                    onReject={() => rejectSection("workforce_populations")}
                  >
                    <ul className="space-y-2 text-sm">
                      {suggestion.workforce_populations.map((pop, i) => (
                        <li key={i}>
                          <p className="font-medium">
                            {pop.name}
                            {pop.approx_size != null && (
                              <span className="text-muted-foreground font-normal">
                                {" "}
                                (~{pop.approx_size})
                              </span>
                            )}
                          </p>
                          {pop.soc_emphasis && (
                            <p className="text-muted-foreground text-xs">
                              SOC emphasis: {pop.soc_emphasis}
                            </p>
                          )}
                          {pop.source_of_evidence && (
                            <p className="text-muted-foreground text-xs italic">
                              Evidence: {pop.source_of_evidence}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </SuggestionBlock>
                )}

              {suggestion.leverage_and_maths &&
                (suggestion.leverage_and_maths.timing_constraints ||
                  suggestion.leverage_and_maths.vote_arithmetic ||
                  suggestion.leverage_and_maths.regulatory_window) && (
                  <SuggestionBlock
                    title="Leverage & maths"
                    onAccept={() => acceptSection("leverage_and_maths")}
                    onReject={() => rejectSection("leverage_and_maths")}
                  >
                    <dl className="space-y-1 text-sm">
                      {suggestion.leverage_and_maths.timing_constraints && (
                        <>
                          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                            Timing
                          </dt>
                          <dd>
                            {suggestion.leverage_and_maths.timing_constraints}
                          </dd>
                        </>
                      )}
                      {suggestion.leverage_and_maths.vote_arithmetic && (
                        <>
                          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                            Vote maths
                          </dt>
                          <dd>{suggestion.leverage_and_maths.vote_arithmetic}</dd>
                        </>
                      )}
                      {suggestion.leverage_and_maths.regulatory_window && (
                        <>
                          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                            Regulatory window
                          </dt>
                          <dd>
                            {suggestion.leverage_and_maths.regulatory_window}
                          </dd>
                        </>
                      )}
                    </dl>
                  </SuggestionBlock>
                )}

              {suggestion.information_gaps &&
                suggestion.information_gaps.length > 0 && (
                  <SuggestionBlock
                    title="Information gaps"
                    icon={
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    }
                    onAccept={() => acceptSection("information_gaps")}
                    onReject={() => rejectSection("information_gaps")}
                  >
                    <ul className="space-y-1 text-sm list-disc list-inside">
                      {suggestion.information_gaps.map((gap, i) => (
                        <li key={i}>
                          <span className="font-medium">{gap.question}</span>
                          {gap.why_it_matters && (
                            <span className="text-muted-foreground">
                              {" "}
                              — {gap.why_it_matters}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </SuggestionBlock>
                )}

              {!suggestion.strategic_context_summary &&
                (!suggestion.company_playbook ||
                  suggestion.company_playbook.length === 0) &&
                (!suggestion.workforce_populations ||
                  suggestion.workforce_populations.length === 0) &&
                (!suggestion.leverage_and_maths ||
                  (!suggestion.leverage_and_maths.timing_constraints &&
                    !suggestion.leverage_and_maths.vote_arithmetic &&
                    !suggestion.leverage_and_maths.regulatory_window)) &&
                (!suggestion.information_gaps ||
                  suggestion.information_gaps.length === 0) && (
                  <p className="text-sm text-muted-foreground italic">
                    All suggestions reviewed. Generate again after updating the
                    survey for fresh proposals.
                  </p>
                )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function SuggestionBlock({
  title,
  icon,
  children,
  onAccept,
  onReject,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <h4 className="font-medium text-sm">{title}</h4>
          <Badge variant="outline" className="gap-1">
            <Sparkles className="h-3 w-3" />
            AI suggestion
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onReject}>
            <X className="h-4 w-4 mr-1" />
            Reject
          </Button>
          <Button size="sm" onClick={onAccept}>
            <Check className="h-4 w-4 mr-1" />
            Accept
          </Button>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}
