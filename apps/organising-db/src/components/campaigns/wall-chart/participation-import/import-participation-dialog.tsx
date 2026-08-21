"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useParticipationImport } from "./use-participation-import";
import { StepSource } from "./step-source";
import { StepAssessment } from "./step-assessment";
import { StepMapping } from "./step-mapping";
import { StepMatch } from "./step-match";
import { StepReview } from "./step-review";
import type { WizardStep } from "./types";

const STEP_TITLES: Record<WizardStep, string> = {
  source: "Import participation — source",
  assessment: "Import participation — assessment",
  mapping: "Import participation — map responses",
  match: "Import participation — match workers",
  review: "Import participation — review & apply",
  done: "Import participation — complete",
};

/**
 * Wall chart / list "Import participation" wizard: bring participation
 * and ratings in from an Action Network report (CSV) or, via re-sync,
 * the AN API, and record them against a campaign assessment.
 */
export function ImportParticipationDialog({
  campaignId,
  open,
  onOpenChange,
}: {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const controller = useParticipationImport(campaignId);
  const { step, setStep, busy, error, reset } = controller;

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  const assessmentValid = useMemo(() => {
    const a = controller.assessment;
    if (!a) return false;
    if (a.mode === "existing") return true;
    return a.title.trim().length > 0;
  }, [controller.assessment]);

  const mappingValid = controller.canMatch;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{STEP_TITLES[step]}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto py-1 pr-1">
          {step === "source" && <StepSource campaignId={campaignId} controller={controller} />}
          {step === "assessment" && (
            <StepAssessment campaignId={campaignId} controller={controller} />
          )}
          {step === "mapping" && (
            <StepMapping campaignId={campaignId} controller={controller} />
          )}
          {step === "match" && <StepMatch controller={controller} />}
          {(step === "review" || step === "done") && <StepReview controller={controller} />}
        </div>

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2">
          {step !== "source" && step !== "done" && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                const order: WizardStep[] = ["source", "assessment", "mapping", "match", "review"];
                const idx = order.indexOf(step);
                if (idx > 0) setStep(order[idx - 1]);
              }}
            >
              Back
            </Button>
          )}
          {step === "assessment" && (
            <Button type="button" disabled={!assessmentValid || busy} onClick={() => setStep("mapping")}>
              Next
            </Button>
          )}
          {step === "mapping" && (
            <Button
              type="button"
              disabled={!mappingValid || busy}
              onClick={() => void controller.runMatch()}
            >
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
              Match workers
            </Button>
          )}
          {step === "match" && (
            <Button type="button" disabled={busy} onClick={() => void controller.runPreview()}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
              Review
            </Button>
          )}
          {step === "review" && (
            <Button type="button" disabled={busy} onClick={() => void controller.runApply()}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
              Apply import
            </Button>
          )}
          {step === "done" && (
            <Button type="button" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
