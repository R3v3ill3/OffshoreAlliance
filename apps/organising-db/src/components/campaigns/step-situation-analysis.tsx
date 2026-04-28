"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { SurveyPanel } from "./situation-analysis/SurveyPanel";
import { AiAssistPanel } from "./situation-analysis/AiAssistPanel";
import { AiChatPanel } from "./situation-analysis/AiChatPanel";
import {
  type SituationAnalysisDraft,
  isSituationAnalysisComplete,
} from "@/lib/situation-analysis/types";

interface StepSituationAnalysisProps {
  campaignId: number;
  campaignEmployerIds: number[];
  draft: SituationAnalysisDraft;
  setDraft: (next: SituationAnalysisDraft) => void;
  isPending: boolean;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * Wizard step 7. Captures structured campaign context (employer state,
 * top issues with heat, workforce changes, inter-employer relationships,
 * HR posture, prior union history). The optional AI-assist panel ships in
 * Phase 2/3 — for now it's a placeholder that signals where richer
 * narrative + chat will land.
 */
export function StepSituationAnalysis({
  campaignId,
  campaignEmployerIds,
  draft,
  setDraft,
  isPending,
  onBack,
  onContinue,
}: StepSituationAnalysisProps) {
  const canContinue = isSituationAnalysisComplete(draft);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Situation analysis</CardTitle>
          <CardDescription>
            A short structured read on where this campaign actually sits.
            Predicted employer plays become inoculation copy in downstream
            comms drafts; top issues become agitation hooks in phone scripts;
            workforce populations drive audience pacing. The first two
            sections are required to continue — the rest can be filled in now
            or later from the campaign plan page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SurveyPanel
            campaignId={campaignId}
            campaignEmployerIds={campaignEmployerIds}
            draft={draft}
            onChange={setDraft}
          />
        </CardContent>
      </Card>

      <AiAssistPanel
        campaignId={campaignId}
        draft={draft}
        onApply={setDraft}
      />

      <AiChatPanel
        campaignId={campaignId}
        draft={draft}
        onApply={setDraft}
      />

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={isPending}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button
          onClick={onContinue}
          disabled={!canContinue || isPending}
          title={
            !canContinue
              ? "Set the employer interaction state and at least one top issue to continue."
              : undefined
          }
        >
          {isPending ? "Saving…" : "Continue"}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
