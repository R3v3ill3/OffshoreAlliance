"use client";

import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { EmployerInteractionField } from "./EmployerInteractionField";
import { TopIssuesField } from "./TopIssuesField";
import { WorkforceChangesField } from "./WorkforceChangesField";
import { EmployerRelationshipsField } from "./EmployerRelationshipsField";
import { HrPostureField } from "./HrPostureField";
import { UnionHistoryField } from "./UnionHistoryField";
import type {
  KeyDispute,
  PriorEmployerBallot,
  SituationAnalysisDraft,
} from "@/lib/situation-analysis/types";
import type { WizardBargainingTriage } from "@/lib/situation-analysis/constants";

interface SurveyPanelProps {
  campaignId: number;
  campaignEmployerIds: number[];
  draft: SituationAnalysisDraft;
  onChange: (next: SituationAnalysisDraft) => void;
  /** Coarse bargaining triage from wizard step 1. When 'underway' or 'advanced', shows bargaining context section. */
  wizardBargainingTriage?: WizardBargainingTriage;
}

const BLANK_BALLOT: PriorEmployerBallot = {
  ballot_date: undefined,
  yes_count: undefined,
  no_count: undefined,
  total_eligible: undefined,
  outcome: undefined,
  notes: undefined,
};

const BLANK_DISPUTE: KeyDispute = {
  issue_label: '',
  notes: undefined,
};

interface SectionStatus {
  required: boolean;
  satisfied: boolean;
}

export function SurveyPanel({
  campaignId,
  campaignEmployerIds,
  draft,
  onChange,
  wizardBargainingTriage,
}: SurveyPanelProps) {
  const [openSections, setOpenSections] = useState<string[]>([
    "employer_interaction",
    "top_issues",
  ]);

  // Show the bargaining context section when the employer interaction state
  // is already in a bargaining mode OR when the wizard triage indicates
  // bargaining is underway or at an advanced stage.
  const bargainingInteractionStates = new Set([
    'bargaining_underway',
    'agreement_balloted',
    'industrial_action_phase',
  ]);
  const showBargainingContext =
    (draft.employer_interaction_state != null &&
      bargainingInteractionStates.has(draft.employer_interaction_state)) ||
    wizardBargainingTriage === 'underway' ||
    wizardBargainingTriage === 'advanced';

  // Whether NERR status is required (must be answered when triage is underway/advanced).
  const nerrRequired =
    wizardBargainingTriage === 'underway' || wizardBargainingTriage === 'advanced';

  function updateBallot(index: number, patch: Partial<PriorEmployerBallot>) {
    const ballots = draft.prior_employer_ballots ?? [];
    const updated = ballots.map((b, i) => (i === index ? { ...b, ...patch } : b));
    onChange({ ...draft, prior_employer_ballots: updated });
  }

  function removeBallot(index: number) {
    const ballots = draft.prior_employer_ballots ?? [];
    onChange({ ...draft, prior_employer_ballots: ballots.filter((_, i) => i !== index) });
  }

  function updateDispute(index: number, patch: Partial<KeyDispute>) {
    const disputes = draft.key_disputes ?? [];
    const updated = disputes.map((d, i) => (i === index ? { ...d, ...patch } : d));
    onChange({ ...draft, key_disputes: updated });
  }

  function removeDispute(index: number) {
    const disputes = draft.key_disputes ?? [];
    onChange({ ...draft, key_disputes: disputes.filter((_, i) => i !== index) });
  }

  const sectionStatus: Record<string, SectionStatus> = {
    employer_interaction: {
      required: true,
      satisfied: !!draft.employer_interaction_state,
    },
    top_issues: {
      required: true,
      satisfied: draft.top_issues.some((i) => i.label.trim().length > 0),
    },
    workforce_changes: {
      required: false,
      satisfied: draft.upcoming_workforce_changes.length > 0,
    },
    employer_relationships: {
      required: false,
      satisfied: draft.employer_relationships.length > 0,
    },
    hr_posture: {
      required: false,
      satisfied:
        !!draft.hr_posture.sentiment ||
        (draft.hr_posture.contacts ?? []).length > 0,
    },
    union_history: {
      required: false,
      satisfied:
        (draft.union_history.prior_eba_count ?? 0) > 0 ||
        (draft.union_history.prior_ballot_outcomes ?? []).length > 0 ||
        (draft.union_history.prior_campaigns ?? []).length > 0,
    },
    bargaining_context: {
      required: nerrRequired,
      satisfied: nerrRequired ? !!draft.nerr_status : !!(
        draft.nerr_status ||
        (draft.prior_employer_ballots ?? []).length > 0 ||
        (draft.key_disputes ?? []).length > 0 ||
        draft.worker_support_estimate != null
      ),
    },
  };

  const renderHeader = (key: string, title: string, summary?: string) => {
    const status = sectionStatus[key];
    return (
      <div className="flex flex-1 items-center gap-3 pr-3">
        <div className="flex-1 text-left">
          <span className="font-medium">{title}</span>
          {summary && (
            <p className="text-xs text-muted-foreground font-normal mt-0.5">
              {summary}
            </p>
          )}
        </div>
        {status.required && !status.satisfied && (
          <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
            <AlertCircle className="h-3 w-3" />
            Required
          </Badge>
        )}
        {status.satisfied && (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        )}
      </div>
    );
  };

  return (
    <Accordion
      type="multiple"
      value={openSections}
      onValueChange={setOpenSections}
      className="w-full"
    >
      <AccordionItem value="employer_interaction">
        <AccordionTrigger>
          {renderHeader(
            "employer_interaction",
            "1. State of employer interaction",
            "Where are things actually at right now?"
          )}
        </AccordionTrigger>
        <AccordionContent>
          <EmployerInteractionField
            value={draft.employer_interaction_state}
            notes={draft.employer_state_notes}
            ballotedCount={draft.balloted_count}
            onChange={({ value, notes, ballotedCount }) =>
              onChange({
                ...draft,
                employer_interaction_state: value,
                employer_state_notes: notes,
                balloted_count: ballotedCount,
              })
            }
          />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="top_issues">
        <AccordionTrigger>
          {renderHeader(
            "top_issues",
            "2. Top workplace issues",
            "What's got the most heat behind it?"
          )}
        </AccordionTrigger>
        <AccordionContent>
          <TopIssuesField
            issues={draft.top_issues}
            onChange={(top_issues) => onChange({ ...draft, top_issues })}
          />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="workforce_changes">
        <AccordionTrigger>
          {renderHeader(
            "workforce_changes",
            "3. Upcoming workforce changes",
            "Shutdowns, redundancies, scope changes that shift the timing window."
          )}
        </AccordionTrigger>
        <AccordionContent>
          <WorkforceChangesField
            changes={draft.upcoming_workforce_changes}
            onChange={(upcoming_workforce_changes) =>
              onChange({ ...draft, upcoming_workforce_changes })
            }
          />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="employer_relationships">
        <AccordionTrigger>
          {renderHeader(
            "employer_relationships",
            "4. Employer relationships",
            "Tier-one clients, parent/child, sister sites."
          )}
        </AccordionTrigger>
        <AccordionContent>
          <EmployerRelationshipsField
            campaignEmployerIds={campaignEmployerIds}
            relationships={draft.employer_relationships}
            onChange={(employer_relationships) =>
              onChange({ ...draft, employer_relationships })
            }
          />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="hr_posture">
        <AccordionTrigger>
          {renderHeader(
            "hr_posture",
            "5. HR / employer rep posture",
            "Hostile vs. cooperative, who's setting the tone."
          )}
        </AccordionTrigger>
        <AccordionContent>
          <HrPostureField
            posture={draft.hr_posture}
            onChange={(hr_posture) => onChange({ ...draft, hr_posture })}
          />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="union_history">
        <AccordionTrigger>
          {renderHeader(
            "union_history",
            "6. Workforce union history",
            "Prior agreements, ballots, OA campaigns at this employer."
          )}
        </AccordionTrigger>
        <AccordionContent>
          <UnionHistoryField
            campaignId={campaignId}
            campaignEmployerIds={campaignEmployerIds}
            history={draft.union_history}
            onChange={(union_history) =>
              onChange({ ...draft, union_history })
            }
          />
        </AccordionContent>
      </AccordionItem>

      {showBargainingContext && (
        <AccordionItem value="bargaining_context">
          <AccordionTrigger>
            {renderHeader(
              "bargaining_context",
              "7. Bargaining context",
              "NERR, prior employer ballots, key disputes, worker support."
            )}
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-6">
              {/* NERR status */}
              <div className="space-y-2">
                <Label>
                  NERR status{nerrRequired && <span className="text-amber-600 ml-1">*</span>}
                </Label>
                <Select
                  value={draft.nerr_status ?? '__none__'}
                  onValueChange={(v) =>
                    onChange({
                      ...draft,
                      nerr_status: v === '__none__'
                        ? undefined
                        : (v as SituationAnalysisDraft['nerr_status']),
                      // Clear the issued date when status is no longer 'issued'
                      nerr_issued_at:
                        v === 'issued' ? draft.nerr_issued_at : undefined,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select NERR status…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not set</SelectItem>
                    <SelectItem value="not_issued">Not issued</SelectItem>
                    <SelectItem value="issued">Issued</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Notice of Employee Representational Rights — required before bargaining can formally commence.
                </p>
              </div>

              {/* NERR issued date — shown only when status is 'issued' */}
              {draft.nerr_status === 'issued' && (
                <div className="space-y-2">
                  <Label>NERR issued date</Label>
                  <Input
                    type="date"
                    value={draft.nerr_issued_at ?? ''}
                    onChange={(e) =>
                      onChange({ ...draft, nerr_issued_at: e.target.value || undefined })
                    }
                  />
                </div>
              )}

              {/* Worker support estimate */}
              <div className="space-y-2">
                <Label>Worker support estimate (%)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.worker_support_estimate ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = raw === '' ? undefined : Math.min(100, Math.max(0, Number(raw)));
                      onChange({ ...draft, worker_support_estimate: n });
                    }}
                    placeholder="e.g. 65"
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Organiser&apos;s estimate of workers likely to vote yes. Used to track movement over time.
                </p>
              </div>

              {/* Employer ballot intent */}
              <div className="space-y-2">
                <Label>Employer ballot intent (PABO)</Label>
                <Select
                  value={draft.employer_ballot_intent ?? '__none__'}
                  onValueChange={(v) =>
                    onChange({
                      ...draft,
                      employer_ballot_intent: v === '__none__'
                        ? undefined
                        : (v as SituationAnalysisDraft['employer_ballot_intent']),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select intent…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not set</SelectItem>
                    <SelectItem value="none">None indicated</SelectItem>
                    <SelectItem value="indicated">Indicated</SelectItem>
                    <SelectItem value="threatened">Threatened</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Whether the employer has indicated or threatened to apply for a Protected Action Ballot Order.
                </p>
              </div>

              {/* Prior employer ballots */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Prior employer ballots</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onChange({
                        ...draft,
                        prior_employer_ballots: [
                          ...(draft.prior_employer_ballots ?? []),
                          { ...BLANK_BALLOT },
                        ],
                      })
                    }
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add ballot
                  </Button>
                </div>
                {(draft.prior_employer_ballots ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground italic">
                    No prior employer ballots recorded. Add one if the employer has previously conducted a ballot.
                  </p>
                )}
                {(draft.prior_employer_ballots ?? []).map((ballot, i) => (
                  <div key={i} className="border rounded-md p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Ballot {i + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeBallot(i)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Date</Label>
                        <Input
                          type="date"
                          value={ballot.ballot_date ?? ''}
                          onChange={(e) =>
                            updateBallot(i, { ballot_date: e.target.value || undefined })
                          }
                          className="text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Outcome</Label>
                        <Select
                          value={ballot.outcome ?? '__none__'}
                          onValueChange={(v) =>
                            updateBallot(i, {
                              outcome: v === '__none__'
                                ? undefined
                                : (v as PriorEmployerBallot['outcome']),
                            })
                          }
                        >
                          <SelectTrigger className="text-xs">
                            <SelectValue placeholder="Outcome…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Unknown</SelectItem>
                            <SelectItem value="passed">Passed</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                            <SelectItem value="withdrawn">Withdrawn</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Yes count</Label>
                        <Input
                          type="number"
                          min={0}
                          value={ballot.yes_count ?? ''}
                          onChange={(e) =>
                            updateBallot(i, {
                              yes_count: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                          placeholder="0"
                          className="text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">No count</Label>
                        <Input
                          type="number"
                          min={0}
                          value={ballot.no_count ?? ''}
                          onChange={(e) =>
                            updateBallot(i, {
                              no_count: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                          placeholder="0"
                          className="text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Total eligible</Label>
                        <Input
                          type="number"
                          min={0}
                          value={ballot.total_eligible ?? ''}
                          onChange={(e) =>
                            updateBallot(i, {
                              total_eligible: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                          placeholder="0"
                          className="text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Notes</Label>
                      <Textarea
                        value={ballot.notes ?? ''}
                        onChange={(e) =>
                          updateBallot(i, { notes: e.target.value || undefined })
                        }
                        rows={2}
                        className="text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Key disputes */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Key disputes</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onChange({
                        ...draft,
                        key_disputes: [
                          ...(draft.key_disputes ?? []),
                          { ...BLANK_DISPUTE },
                        ],
                      })
                    }
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add dispute
                  </Button>
                </div>
                {(draft.key_disputes ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground italic">
                    No key disputes recorded. Add the main contested issues between the union and employer.
                  </p>
                )}
                {(draft.key_disputes ?? []).map((dispute, i) => (
                  <div key={i} className="border rounded-md p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Dispute {i + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDispute(i)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Issue</Label>
                      <Input
                        value={dispute.issue_label}
                        onChange={(e) => updateDispute(i, { issue_label: e.target.value })}
                        placeholder="e.g. Overtime rates, roster cycles"
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Notes</Label>
                      <Textarea
                        value={dispute.notes ?? ''}
                        onChange={(e) =>
                          updateDispute(i, { notes: e.target.value || undefined })
                        }
                        rows={2}
                        className="text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      )}
    </Accordion>
  );
}
