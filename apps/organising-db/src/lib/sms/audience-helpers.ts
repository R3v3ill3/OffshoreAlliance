/**
 * Convert an AudiencePicker value to the API audience shape expected by
 * the blast-create and survey-open routes. When the value is a composed
 * audience (manual/import), commits it via POST .../sms-audience/commit
 * first, then returns a worker_list reference.
 */

import { fetchApi } from "@/lib/api/fetch-api";

export type AudienceValue =
  | { mode: "campaign" }
  | { mode: "worker_list"; worker_list_id: number }
  | { mode: "composed"; worker_ids: number[]; label?: string };

export type ApiAudience =
  | { type: "campaign" }
  | { type: "worker_list"; worker_list_id: number };

export const EMPTY_COMPOSED_AUDIENCE: AudienceValue = {
  mode: 'composed',
  worker_ids: [],
}

/** Audience picker flags for hidden SMS episode campaigns. */
export const STANDALONE_AUDIENCE_PICKER = {
  hideWholeCampaign: true,
  orgWideUniverse: true,
} as const

export async function toApiAudience(
  campaignId: string | number,
  value: AudienceValue
): Promise<ApiAudience> {
  if (value.mode === "campaign") {
    return { type: "campaign" };
  }
  if (value.mode === "worker_list") {
    return { type: "worker_list", worker_list_id: value.worker_list_id };
  }

  // composed → commit to get a worker_list_id
  const res = await fetchApi(
    `/api/campaigns/${campaignId}/sms-audience/commit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: value.label || undefined,
        worker_ids: value.worker_ids,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Commit failed" }));
    throw new Error(
      (err as { error?: string }).error ?? "Failed to commit audience"
    );
  }
  const data = (await res.json()) as { worker_list_id: number };
  return { type: "worker_list", worker_list_id: data.worker_list_id };
}
