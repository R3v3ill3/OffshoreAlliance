"use client";

/**
 * Edit dialog for a single Activist Register profile. Editing an
 * auto-provisioned row flips it to curated (source = manual).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  ACTIVIST_DOMAIN_OPTIONS,
  FOUR_A_STAGES,
  IDENTIFIED_VIA_OPTIONS,
  LADDER_RUNGS,
} from "@/lib/campaign/activist-constants";
import { useUpdateActivistProfile } from "./use-activist-data";
import type { ActivistRegisterRow } from "./types";

const NONE = "__none__";

type FormState = {
  identified_via: string;
  recruited_by_text: string;
  recruited_at: string;
  domain: string;
  followers_evidence: string;
  skab_notes: string;
  current_rung: string;
  four_a_stage: string;
  last_contact_date: string;
  next_contact_date: string;
  notes: string;
};

function formFromRow(row: ActivistRegisterRow): FormState {
  return {
    identified_via: row.identified_via ?? NONE,
    recruited_by_text: row.recruited_by_text ?? "",
    recruited_at: row.recruited_at ?? "",
    domain: row.domain ?? NONE,
    followers_evidence: row.followers_evidence ?? "",
    skab_notes: row.skab_notes ?? "",
    current_rung: row.current_rung != null ? String(row.current_rung) : NONE,
    four_a_stage: row.four_a_stage ?? "assess",
    last_contact_date: row.last_contact_date ?? "",
    next_contact_date: row.next_contact_date ?? "",
    notes: row.notes ?? "",
  };
}

export function ActivistProfileDialog({
  campaignId,
  row,
  open,
  onOpenChange,
}: {
  campaignId: string;
  row: ActivistRegisterRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!open || !row) return null;
  return (
    <ActivistProfileDialogInner
      key={row.profile_id}
      campaignId={campaignId}
      row={row}
      onOpenChange={onOpenChange}
    />
  );
}

function ActivistProfileDialogInner({
  campaignId,
  row,
  onOpenChange,
}: {
  campaignId: string;
  row: ActivistRegisterRow;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState<FormState>(() => formFromRow(row));
  const updateMutation = useUpdateActivistProfile(campaignId);

  const set = (patch: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...patch }));

  const save = () => {
    updateMutation.mutate(
      {
        profileId: row.profile_id!,
        update: {
          identified_via: form.identified_via === NONE ? null : form.identified_via,
          recruited_by_text: form.recruited_by_text || null,
          recruited_at: form.recruited_at || null,
          domain: form.domain === NONE ? null : form.domain,
          followers_evidence: form.followers_evidence || null,
          skab_notes: form.skab_notes || null,
          current_rung:
            form.current_rung === NONE ? null : Number(form.current_rung),
          four_a_stage: form.four_a_stage,
          last_contact_date: form.last_contact_date || null,
          next_contact_date: form.next_contact_date || null,
          notes: form.notes || null,
        },
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{row.worker_name}</DialogTitle>
          <DialogDescription>
            Activist development profile. Support is assessed on the shared 0–5
            rating scale; this profile carries the activation side — ladder rung,
            4A stage, identification and development notes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>4A stage</Label>
            <Select
              value={form.four_a_stage}
              onValueChange={(v) => set({ four_a_stage: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FOUR_A_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Current ladder rung</Label>
            <Select
              value={form.current_rung}
              onValueChange={(v) => set({ current_rung: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {LADDER_RUNGS.map((r) => (
                  <SelectItem key={r.value} value={String(r.value)}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Identified via</Label>
            <Select
              value={form.identified_via}
              onValueChange={(v) => set({ identified_via: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Not recorded" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not recorded</SelectItem>
                {IDENTIFIED_VIA_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Development domain</Label>
            <Select value={form.domain} onValueChange={(v) => set({ domain: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {ACTIVIST_DOMAIN_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ap-recruited-by">Recruited by</Label>
            <Input
              id="ap-recruited-by"
              placeholder="Organiser / activist name"
              value={form.recruited_by_text}
              onChange={(e) => set({ recruited_by_text: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ap-recruited-at">Recruited on</Label>
            <Input
              id="ap-recruited-at"
              type="date"
              value={form.recruited_at}
              onChange={(e) => set({ recruited_at: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ap-last-contact">Last contact</Label>
            <Input
              id="ap-last-contact"
              type="date"
              value={form.last_contact_date}
              onChange={(e) => set({ last_contact_date: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ap-next-contact">Next contact</Label>
            <Input
              id="ap-next-contact"
              type="date"
              value={form.next_contact_date}
              onChange={(e) => set({ next_contact_date: e.target.value })}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ap-followers">
              Followers test — who moves when they move?
            </Label>
            <Textarea
              id="ap-followers"
              rows={2}
              placeholder="Evidence, not vibes — which crew(s) do they reach?"
              value={form.followers_evidence}
              onChange={(e) => set({ followers_evidence: e.target.value })}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ap-skab">SKAB / training needs</Label>
            <Textarea
              id="ap-skab"
              rows={2}
              placeholder="Skills, knowledge, attributes, behaviours to develop"
              value={form.skab_notes}
              onChange={(e) => set({ skab_notes: e.target.value })}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ap-notes">Notes</Label>
            <Textarea
              id="ap-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving…" : "Save profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
