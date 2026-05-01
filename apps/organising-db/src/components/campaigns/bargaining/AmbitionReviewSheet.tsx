"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useAmbitionRevisions,
  type DueAmbition,
} from "@/hooks/useAmbitionRevisions";

// ──────────────────────────────────────────────────────────────────
// Per-ambition review form state
// ──────────────────────────────────────────────────────────────────

interface ReviewFormState {
  reason: string;
  noChangeNeeded: boolean;
  submitting: boolean;
  submitted: boolean;
  error: string | null;
}

function emptyReviewForm(): ReviewFormState {
  return {
    reason: "",
    noChangeNeeded: false,
    submitting: false,
    submitted: false,
    error: null,
  };
}

// ──────────────────────────────────────────────────────────────────
// AmbitionReviewItem — review panel for a single flagged ambition
// ──────────────────────────────────────────────────────────────────

interface AmbitionReviewItemProps {
  ambition: DueAmbition;
  campaignId: number;
  onReviewed: () => void;
}

function AmbitionReviewItem({ ambition, campaignId, onReviewed }: AmbitionReviewItemProps) {
  const [form, setForm] = useState<ReviewFormState>(emptyReviewForm);
  const { markReviewed } = useAmbitionRevisions(campaignId);

  const dueSince = ambition.review_due_since
    ? formatDistanceToNow(new Date(ambition.review_due_since), { addSuffix: true })
    : "recently";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.reason.trim() && !form.noChangeNeeded) {
      setForm((f) => ({ ...f, error: "Please enter a reason or check 'No change needed'." }));
      return;
    }
    setForm((f) => ({ ...f, submitting: true, error: null }));
    markReviewed(
      {
        ambitionId: ambition.campaign_ambition_id,
        reason: form.reason.trim() || "Reviewed — no change needed.",
        reviewedWithoutChange: form.noChangeNeeded,
      },
      {
        onSuccess: () => {
          setForm((f) => ({ ...f, submitting: false, submitted: true }));
          onReviewed();
        },
        onError: (err) => {
          setForm((f) => ({
            ...f,
            submitting: false,
            error: err instanceof Error ? err.message : "Failed to save review.",
          }));
        },
      }
    );
  }

  if (form.submitted) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        Review saved for: <span className="font-medium">{ambition.label}</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border p-4 space-y-4">
      {/* Ambition info */}
      <div>
        <p className="font-medium text-slate-900 text-sm">{ambition.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Review flagged {dueSince}
        </p>
      </div>

      {/* No change checkbox */}
      <div className="flex items-center gap-2">
        <Checkbox
          id={`no-change-${ambition.campaign_ambition_id}`}
          checked={form.noChangeNeeded}
          onCheckedChange={(checked) =>
            setForm((f) => ({ ...f, noChangeNeeded: !!checked }))
          }
        />
        <Label
          htmlFor={`no-change-${ambition.campaign_ambition_id}`}
          className="text-sm cursor-pointer"
        >
          No change needed — ambition is still accurate
        </Label>
      </div>

      {/* Reason */}
      <div className="space-y-1.5">
        <Label htmlFor={`reason-${ambition.campaign_ambition_id}`} className="text-sm">
          {form.noChangeNeeded
            ? "Reason (optional — why no change?)"
            : "Reason / what changed *"}
        </Label>
        <Textarea
          id={`reason-${ambition.campaign_ambition_id}`}
          placeholder={
            form.noChangeNeeded
              ? "e.g. Ambition already reflects current bargaining position."
              : "e.g. Log of Claims endorsed — updated target to reflect agreed claims."
          }
          rows={3}
          value={form.reason}
          onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
        />
      </div>

      {form.error && (
        <p className="text-sm text-destructive">{form.error}</p>
      )}

      <Button type="submit" size="sm" disabled={form.submitting}>
        {form.submitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
        Save review
      </Button>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────
// AmbitionReviewSheet — sheet listing all flagged ambitions
// ──────────────────────────────────────────────────────────────────

interface AmbitionReviewSheetProps {
  campaignId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AmbitionReviewSheet({
  campaignId,
  open,
  onOpenChange,
}: AmbitionReviewSheetProps) {
  const { dueAmbitions, isLoading } = useAmbitionRevisions(campaignId);
  const [reviewedIds, setReviewedIds] = useState<Set<number>>(new Set());

  const remaining = dueAmbitions.filter(
    (a) => !reviewedIds.has(a.campaign_ambition_id)
  );

  function handleReviewed(id: number) {
    setReviewedIds((prev) => new Set([...prev, id]));
  }

  const allDone = dueAmbitions.length > 0 && remaining.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Review Industrial Outcomes Ambitions
          </SheetTitle>
          <SheetDescription>
            A triggering event has occurred (Log of Claims vote, employer
            proposal rejected, or WOC counter-offer endorsed). Review each
            flagged ambition and record whether it needs updating.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading ambitions…
            </div>
          ) : allDone ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              All ambitions reviewed. You can close this panel.
            </div>
          ) : remaining.length === 0 && dueAmbitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No ambitions flagged for review.
            </p>
          ) : (
            remaining.map((ambition) => (
              <AmbitionReviewItem
                key={ambition.campaign_ambition_id}
                ambition={ambition}
                campaignId={campaignId}
                onReviewed={() => handleReviewed(ambition.campaign_ambition_id)}
              />
            ))
          )}

          {allDone && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
