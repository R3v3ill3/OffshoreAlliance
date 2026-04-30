"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useCreateEndorsementVote,
  useUpdateEndorsementVote,
} from "@/hooks/useEndorsementVotes";
import type { MemberEndorsementVote, MemberEndorsementVoteInsert } from "@oa/db-types";

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

type VoteKind = MemberEndorsementVote["vote_kind"];
type VoteMethod = NonNullable<MemberEndorsementVote["vote_method"]>;
type VoteOutcome = NonNullable<MemberEndorsementVote["outcome"]>;

interface FormState {
  vote_kind: VoteKind;
  proposal_label: string;
  proposal_version: string;
  vote_method: VoteMethod | "";
  eligible_count: string;
  vote_opens_at: string;
  vote_closes_at: string;
  votes_yes: string;
  votes_no: string;
  votes_abstain: string;
  informal_count: string;
  outcome: VoteOutcome | "";
  fwc_notification_sent_at: string;
  fwc_application_number: string;
  notes: string;
}

function emptyForm(): FormState {
  return {
    vote_kind: "employer_proposal",
    proposal_label: "",
    proposal_version: "1",
    vote_method: "",
    eligible_count: "",
    vote_opens_at: "",
    vote_closes_at: "",
    votes_yes: "",
    votes_no: "",
    votes_abstain: "",
    informal_count: "",
    outcome: "",
    fwc_notification_sent_at: "",
    fwc_application_number: "",
    notes: "",
  };
}

function voteToForm(vote: MemberEndorsementVote): FormState {
  return {
    vote_kind: vote.vote_kind,
    proposal_label: vote.proposal_label ?? "",
    proposal_version: String(vote.proposal_version ?? 1),
    vote_method: vote.vote_method ?? "",
    eligible_count: vote.eligible_count != null ? String(vote.eligible_count) : "",
    vote_opens_at: vote.vote_opens_at
      ? vote.vote_opens_at.slice(0, 10)
      : "",
    vote_closes_at: vote.vote_closes_at
      ? vote.vote_closes_at.slice(0, 10)
      : "",
    votes_yes: vote.votes_yes != null ? String(vote.votes_yes) : "",
    votes_no: vote.votes_no != null ? String(vote.votes_no) : "",
    votes_abstain: vote.votes_abstain != null ? String(vote.votes_abstain) : "",
    informal_count: vote.informal_count != null ? String(vote.informal_count) : "",
    outcome: vote.outcome ?? "",
    fwc_notification_sent_at: vote.fwc_notification_sent_at
      ? vote.fwc_notification_sent_at.slice(0, 10)
      : "",
    fwc_application_number: vote.fwc_application_number ?? "",
    notes: vote.notes ?? "",
  };
}

function intOrNull(v: string): number | null {
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function dateOrNull(v: string): string | null {
  return v ? `${v}T00:00:00+00:00` : null;
}

// ──────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────

interface EndorsementVoteEditorProps {
  campaignId: number;
  /** When provided, the editor is in edit mode. */
  existingVote?: MemberEndorsementVote | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (vote: MemberEndorsementVote) => void;
}

export function EndorsementVoteEditor({
  campaignId,
  existingVote,
  open,
  onOpenChange,
  onSaved,
}: EndorsementVoteEditorProps) {
  const [form, setForm] = useState<FormState>(emptyForm);

  const createMutation = useCreateEndorsementVote(campaignId);
  const updateMutation = useUpdateEndorsementVote(campaignId);

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const isEditing = !!existingVote;

  // Populate form when editing
  useEffect(() => {
    if (open) {
      setForm(existingVote ? voteToForm(existingVote) : emptyForm());
    }
  }, [open, existingVote]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload: Omit<MemberEndorsementVoteInsert, "campaign_id"> = {
      vote_kind: form.vote_kind,
      proposal_label: form.proposal_label || null,
      proposal_version: intOrNull(form.proposal_version) ?? 1,
      vote_method: (form.vote_method as VoteMethod) || null,
      eligible_count: intOrNull(form.eligible_count),
      vote_opens_at: dateOrNull(form.vote_opens_at),
      vote_closes_at: dateOrNull(form.vote_closes_at),
      votes_yes: intOrNull(form.votes_yes),
      votes_no: intOrNull(form.votes_no),
      votes_abstain: intOrNull(form.votes_abstain),
      informal_count: intOrNull(form.informal_count),
      outcome: (form.outcome as VoteOutcome) || null,
      fwc_notification_sent_at: dateOrNull(form.fwc_notification_sent_at),
      fwc_application_number: form.fwc_application_number || null,
      notes: form.notes || null,
    };

    try {
      let saved: MemberEndorsementVote;
      if (isEditing && existingVote) {
        saved = await updateMutation.mutateAsync({
          vote_id: existingVote.vote_id,
          ...payload,
        });
      } else {
        saved = await createMutation.mutateAsync(payload);
      }
      onSaved?.(saved);
      onOpenChange(false);
    } catch {
      // errors handled by mutation
    }
  }

  const errorMsg =
    (createMutation.error as Error | null)?.message ||
    (updateMutation.error as Error | null)?.message;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Edit Endorsement Vote" : "Record Endorsement Vote"}
          </SheetTitle>
          <SheetDescription>
            Capture ballot details for an employer proposal, union in-principle
            approval, or final EBA ratification vote.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {/* Vote kind */}
          <div className="space-y-1.5">
            <Label htmlFor="vote_kind">Vote Type *</Label>
            <Select
              value={form.vote_kind}
              onValueChange={(v) => set("vote_kind", v as VoteKind)}
            >
              <SelectTrigger id="vote_kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employer_proposal">Employer Proposal</SelectItem>
                <SelectItem value="union_in_principle">Union In-Principle</SelectItem>
                <SelectItem value="final_eba">Final EBA Vote</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Proposal label + version */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="proposal_label">Proposal Label</Label>
              <Input
                id="proposal_label"
                placeholder="e.g. May 2026 Employer Offer"
                value={form.proposal_label}
                onChange={(e) => set("proposal_label", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proposal_version">Version</Label>
              <Input
                id="proposal_version"
                type="number"
                min={1}
                value={form.proposal_version}
                onChange={(e) => set("proposal_version", e.target.value)}
              />
            </div>
          </div>

          {/* Vote method */}
          <div className="space-y-1.5">
            <Label htmlFor="vote_method">Vote Method</Label>
            <Select
              value={form.vote_method}
              onValueChange={(v) => set("vote_method", v as VoteMethod | "")}
            >
              <SelectTrigger id="vote_method">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="postal">Postal</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="workplace">Workplace</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
                <SelectItem value="employer_run">Employer-run</SelectItem>
                <SelectItem value="union_run">Union-run</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Eligible count */}
          <div className="space-y-1.5">
            <Label htmlFor="eligible_count">Eligible Voters</Label>
            <Input
              id="eligible_count"
              type="number"
              min={0}
              placeholder="Number of eligible voters"
              value={form.eligible_count}
              onChange={(e) => set("eligible_count", e.target.value)}
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vote_opens_at">Vote Opens</Label>
              <Input
                id="vote_opens_at"
                type="date"
                value={form.vote_opens_at}
                onChange={(e) => set("vote_opens_at", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vote_closes_at">Vote Closes</Label>
              <Input
                id="vote_closes_at"
                type="date"
                value={form.vote_closes_at}
                onChange={(e) => set("vote_closes_at", e.target.value)}
              />
            </div>
          </div>

          {/* Vote counts */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Vote Counts</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["votes_yes", "Yes"],
                  ["votes_no", "No"],
                  ["votes_abstain", "Abstain"],
                  ["informal_count", "Informal"],
                ] as const
              ).map(([field, label]) => (
                <div key={field} className="space-y-1.5">
                  <Label htmlFor={field}>{label}</Label>
                  <Input
                    id={field}
                    type="number"
                    min={0}
                    value={form[field]}
                    onChange={(e) => set(field, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </fieldset>

          {/* Outcome */}
          <div className="space-y-1.5">
            <Label htmlFor="outcome">Outcome</Label>
            <Select
              value={form.outcome}
              onValueChange={(v) => set("outcome", v as VoteOutcome | "")}
            >
              <SelectTrigger id="outcome">
                <SelectValue placeholder="Select outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="yes">Yes (Approved)</SelectItem>
                <SelectItem value="no">No (Rejected)</SelectItem>
                <SelectItem value="withdrawn">Withdrawn</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* FWC section */}
          <fieldset className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-xs font-semibold text-muted-foreground">
              FWC Notification
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fwc_notification_sent_at">Notification Date</Label>
                <Input
                  id="fwc_notification_sent_at"
                  type="date"
                  value={form.fwc_notification_sent_at}
                  onChange={(e) => set("fwc_notification_sent_at", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fwc_application_number">Application Number</Label>
                <Input
                  id="fwc_application_number"
                  placeholder="e.g. AG2026/1234"
                  value={form.fwc_application_number}
                  onChange={(e) => set("fwc_application_number", e.target.value)}
                />
              </div>
            </div>
          </fieldset>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Any additional context about this vote"
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          {errorMsg && (
            <p className="text-sm text-destructive">{errorMsg}</p>
          )}

          <SheetFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Save Changes" : "Record Vote"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
