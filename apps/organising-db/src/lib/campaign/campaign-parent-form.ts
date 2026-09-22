/**
 * WP3.8 follow-up (wp3.8.md D41) — the "Part of" save rules shared by the
 * header's Basics sheet and the Settings page's Basics section, so the two
 * places behave identically:
 *
 *  - `resolveParentChange`: the form's string value → the id to save, and
 *    whether it differs from the row's current parent. The column goes into
 *    an update payload ONLY when it changed (F1/D32): the one-level trigger is
 *    `BEFORE UPDATE OF parent_campaign_id` and fires whenever the column is in
 *    the SET list, so an unchanged parent must stay out of the SET list.
 *  - `campaignSaveError`: a PostgREST error → an `Error` whose message reads
 *    a `campaign_family_*` refusal as a sentence (`familyErrorMessage`).
 *  - `afterCampaignParentSaved`: the invalidations and the `campaign_parent_set`
 *    event, emitted only when the parent actually changed.
 *
 * The first two are pure (unit-tested in `__tests__/campaign-parent-form.test.ts`).
 */

import type { QueryClient } from "@tanstack/react-query";

import { trackCampaignParentSet } from "@/lib/analytics/events";
import { CAMPAIGN_PARENT_QUERY_KEY } from "@/lib/campaign/campaign-parent";
import { familyErrorMessage } from "@/lib/campaign/families";

/** The select's "none" option value; the form keeps "" for none. */
export const NO_PARENT_VALUE = "__none__";

export type ParentChange = {
  /** The id the form asks for; null = none (SET-a: clearing is always allowed). */
  nextParentId: number | null;
  /** True when `nextParentId` differs from the row's current parent. */
  changed: boolean;
};

/** Normalises the row's current parent for comparison. */
export function currentParentIdOf(row: { parent_campaign_id?: number | string | null } | null | undefined): number | null {
  const raw = row?.parent_campaign_id;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * `formValue` is the select's value as the form stores it ("" or the id as a
 * string; `NO_PARENT_VALUE` is accepted too). Anything unusable reads as none.
 */
export function resolveParentChange(
  formValue: string | null | undefined,
  currentParentId: number | null
): ParentChange {
  const trimmed = (formValue ?? "").trim();
  const n = trimmed === "" || trimmed === NO_PARENT_VALUE ? Number.NaN : Number(trimmed);
  const nextParentId = Number.isInteger(n) && n > 0 ? n : null;
  return { nextParentId, changed: nextParentId !== currentParentId };
}

/**
 * Adds `parent_campaign_id` to `payload` only when it changed (F1/D32) and
 * returns the change, so the caller can act on it after the save.
 */
export function applyParentChange(
  payload: Record<string, unknown>,
  formValue: string | null | undefined,
  currentParentId: number | null
): ParentChange {
  const change = resolveParentChange(formValue, currentParentId);
  if (change.changed) payload.parent_campaign_id = change.nextParentId;
  return change;
}

/** A PostgREST error as the client hands it back. */
export type PostgrestErrorLike = { code?: string | null; message: string };

/** The one-level trigger's refusals (`campaign_family_*`) read as sentences; anything else passes through. */
export function campaignSaveError(error: PostgrestErrorLike): Error {
  return new Error(familyErrorMessage(error.code, error.message));
}

/**
 * After a successful campaign save: when the parent changed, invalidate the
 * family readers of this campaign (its parent, its children, the candidate
 * list, the family-keyed assessment lists) and emit `campaign_parent_set`.
 * Both callers' own invalidations (`["campaign", …]` etc.) stay theirs.
 */
export function afterCampaignParentSaved(
  queryClient: QueryClient,
  campaignId: number,
  previousParentId: number | null,
  nextParentId: number | null
): void {
  if (nextParentId === previousParentId) return;
  queryClient.invalidateQueries({ queryKey: [CAMPAIGN_PARENT_QUERY_KEY, campaignId] });
  queryClient.invalidateQueries({ queryKey: ["campaign-children"] });
  queryClient.invalidateQueries({ queryKey: ["campaign-parent-candidates"] });
  queryClient.invalidateQueries({ queryKey: ["campaign-activities-family", String(campaignId)] });
  queryClient.invalidateQueries({ queryKey: ["campaign-assessments-rated", String(campaignId)] });
  trackCampaignParentSet({
    campaign_id: campaignId,
    parent_id: nextParentId,
    previous_parent_id: previousParentId,
  });
}
