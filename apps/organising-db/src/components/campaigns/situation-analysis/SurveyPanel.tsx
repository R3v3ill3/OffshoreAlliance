"use client";

import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { EmployerInteractionField } from "./EmployerInteractionField";
import { TopIssuesField } from "./TopIssuesField";
import { WorkforceChangesField } from "./WorkforceChangesField";
import { EmployerRelationshipsField } from "./EmployerRelationshipsField";
import { HrPostureField } from "./HrPostureField";
import { UnionHistoryField } from "./UnionHistoryField";
import type { SituationAnalysisDraft } from "@/lib/situation-analysis/types";

interface SurveyPanelProps {
  campaignId: number;
  campaignEmployerIds: number[];
  draft: SituationAnalysisDraft;
  onChange: (next: SituationAnalysisDraft) => void;
}

interface SectionStatus {
  required: boolean;
  satisfied: boolean;
}

export function SurveyPanel({
  campaignId,
  campaignEmployerIds,
  draft,
  onChange,
}: SurveyPanelProps) {
  const [openSections, setOpenSections] = useState<string[]>([
    "employer_interaction",
    "top_issues",
  ]);

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
    </Accordion>
  );
}
