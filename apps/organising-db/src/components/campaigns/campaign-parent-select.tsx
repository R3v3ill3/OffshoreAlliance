"use client";

/**
 * WP3.8 follow-up (wp3.8.md D41) — the one "Part of" control, used by the
 * header's Basics sheet and by the Settings page's Basics section.
 *
 * Extracted from `campaign-basics-edit-sheet.tsx` unchanged in behaviour:
 *  - candidates = campaigns with no parent that are neither an SMS episode,
 *    the standing campaign nor archived, minus this one (the predicates are
 *    applied server-side and repeated client-side so a backend that ignores
 *    filters agrees with PostgREST);
 *  - intersected with `campaigns_i_can_write` (SET-a: writer of both; the
 *    trigger is the authority, this is the friendly pre-check);
 *  - the current parent stays selectable even when the organiser cannot write
 *    to it (an admin set it), so Save does not silently drop it (D22);
 *  - disabled, with the reason, while the campaign has children
 *    (`["campaign-children", id]`, shared through `useCampaignChildren`).
 *
 * The form value is "" for none or the parent id as a string; the parent
 * component owns it and decides what to save (`lib/campaign/campaign-parent-form.ts`).
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { useCampaignWriteAccess } from "@/lib/hooks/useCampaignWriteAccess";
import { NO_PARENT_VALUE } from "@/lib/campaign/campaign-parent-form";

/** A campaign that may be chosen as the parent (wp3.8.md §3.7 "Basics sheet"). */
export type ParentCandidateRow = {
  campaign_id: number;
  name: string;
  parent_campaign_id?: number | null;
  is_sms_episode?: boolean | null;
  is_standing?: boolean | null;
  /** The trigger refuses an archived parent; the list does not offer one (F7). */
  archived_at?: string | null;
};

/** The campaigns that are part of `campaignId` — `["campaign-children", "<id>"]`, the key every family reader invalidates. */
export function useCampaignChildren(campaignId: number, enabled = true) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["campaign-children", String(campaignId)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("campaign_id, name, parent_campaign_id")
        .eq("parent_campaign_id", campaignId)
        .order("name");
      if (error) throw error;
      return ((data ?? []) as ParentCandidateRow[]).filter(
        (c) => Number(c.parent_campaign_id) === campaignId
      );
    },
    enabled,
  });
}

/** The campaigns `campaignId` may become part of, before the write-access intersection. */
export function useCampaignParentCandidates(campaignId: number, enabled = true) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["campaign-parent-candidates", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("campaign_id, name, parent_campaign_id, is_sms_episode, is_standing, archived_at")
        .is("parent_campaign_id", null)
        .eq("is_sms_episode", false)
        .eq("is_standing", false)
        .is("archived_at", null)
        .neq("campaign_id", campaignId)
        .order("name");
      if (error) throw error;
      return ((data ?? []) as ParentCandidateRow[]).filter(
        (c) =>
          Number(c.campaign_id) !== campaignId &&
          c.parent_campaign_id == null &&
          !c.is_sms_episode &&
          !c.is_standing &&
          c.archived_at == null
      );
    },
    enabled,
  });
}

/** The helper sentence under the control. Exported for the tests. */
export function parentSelectHint(childCount: number): string {
  return childCount > 0
    ? `This campaign has ${childCount} child ${childCount === 1 ? "campaign" : "campaigns"}, so it cannot be part of another campaign.`
    : "A campaign that is part of another sees the assessments that campaign shares with its family.";
}

export type CampaignParentSelectProps = {
  campaignId: number;
  /** "" for none, otherwise the parent id as a string. */
  value: string;
  onChange: (value: string) => void;
  /** Forced off by the caller (e.g. while saving); the children lock applies regardless. */
  disabled?: boolean;
  /** Gate the reads (the sheet reads only while open and signed in). Default true. */
  enabled?: boolean;
  /** The trigger's DOM id (a label targets it). Default "basics-parent". */
  id?: string;
};

export function CampaignParentSelect({
  campaignId,
  value,
  onChange,
  disabled,
  enabled = true,
  id = "basics-parent",
}: CampaignParentSelectProps) {
  const { data: parentCandidates = [] } = useCampaignParentCandidates(campaignId, enabled);

  const candidateIds = useMemo(
    () => parentCandidates.map((c) => Number(c.campaign_id)),
    [parentCandidates]
  );
  const { data: writableIds } = useCampaignWriteAccess(candidateIds);
  const parentOptions = useMemo(
    () => parentCandidates.filter((c) => writableIds?.has(Number(c.campaign_id))),
    [parentCandidates, writableIds]
  );

  const { data: childCampaigns = [] } = useCampaignChildren(campaignId, enabled);
  const childCount = childCampaigns.length;
  const parentLocked = childCount > 0;

  // The current parent may be one the organiser cannot write to (set by an
  // admin); keep it selectable as the current value so Save does not drop it.
  const currentParentOption = useMemo(() => {
    if (!value) return null;
    const selected = Number(value);
    return parentOptions.some((c) => Number(c.campaign_id) === selected)
      ? null
      : (parentCandidates.find((c) => Number(c.campaign_id) === selected) ?? {
          campaign_id: selected,
          name: `Campaign ${selected}`,
        });
  }, [value, parentOptions, parentCandidates]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Part of</Label>
      <Select
        value={value || NO_PARENT_VALUE}
        onValueChange={(v) => onChange(v === NO_PARENT_VALUE ? "" : v)}
        disabled={parentLocked || disabled}
      >
        <SelectTrigger id={id} aria-label="Part of">
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_PARENT_VALUE}>None</SelectItem>
          {currentParentOption && (
            <SelectItem value={String(currentParentOption.campaign_id)}>
              {currentParentOption.name}
            </SelectItem>
          )}
          {parentOptions.map((c) => (
            <SelectItem key={c.campaign_id} value={String(c.campaign_id)}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{parentSelectHint(childCount)}</p>
    </div>
  );
}
