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
import { StepMapping } from "./step-mapping";
import { StepMatch } from "./step-match";
import { StepReview } from "./step-review";
import type { WizardStep } from "./types";

const STEP_TITLES: Record<WizardStep, string> = {
  source: "Import participation — source",
  mapping: "Import participation — map questions",
  match: "Import participation — match workers",
  review: "Import participation — review & apply",
  done: "Import participation — complete",
};

/**
 * Wall chart / list "Import participation" wizard: bring participation
 * and ratings in from an Action Network report (CSV) or the AN API,
 * mapping one or more survey questions onto campaign assessments.
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

  const mappingValid = useMemo(() => {
    const active = controller.questions.filter((q) => q.assessment != null);
    if (active.length === 0) return false;
    const titlesOk = active.every(
      (q) =>
        q.assessment!.mode === "existing" || q.assessment!.title.trim().length > 0
    );
    return titlesOk && controller.canMatch;
  }, [controller.questions, controller.canMatch]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{STEP_TITLES[step]}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto py-1 pr-1">
          {step === "source" && <StepSource campaignId={campaignId} controller={controller} />}
          {step === "mapping" && <StepMapping campaignId={campaignId} controller={controller} />}
          {step === "match" && <StepMatch campaignId={campaignId} controller={controller} />}
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
                const order: WizardStep[] = ["source", "mapping", "match", "review"];
                const idx = order.indexOf(step);
                if (idx > 0) setStep(order[idx - 1]);
              }}
            >
              Back
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
