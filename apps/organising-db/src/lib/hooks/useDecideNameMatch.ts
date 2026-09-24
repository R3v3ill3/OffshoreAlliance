"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { NAME_MATCH_REVIEWS_KEY } from "@/lib/hooks/useNameMatchReviews";

/**
 * DA0.3 — one decision on a `name_match_reviews` row through
 * `POST /api/name-match-reviews/[id]/decide` (plan §2.4.5). Never
 * `supabase.rpc` from the browser: the route runs `decide_name_match()` on
 * the user's client (so `is_admin()` applies) and then the campaign-universe
 * sync for the back-filled workers with the service role.
 */

export type NameDecisionAction = "confirm" | "override" | "create" | "reject" | "reopen";

export type NameCreatePayload =
  | { employer_name: string; trading_name?: string | null; employer_category?: string | null }
  | { worksite_name: string; worksite_type: string; is_offshore?: boolean };

export interface DecideNameMatchInput {
  id: number;
  action: NameDecisionAction;
  employer_id?: number | null;
  worksite_id?: number | null;
  create?: NameCreatePayload | null;
  notes?: string | null;
}

export interface DecideNameMatchResult {
  review: Record<string, unknown> | null;
  aliasWritten: boolean;
  backfilledWorkerIds: number[];
  siblingsResolved: number;
  universeSyncError?: string;
}

/** Thrown with the route's message verbatim (409s carry the RPC's text). */
export class DecideNameMatchError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "DecideNameMatchError";
    this.status = status;
  }
}

/** The query keys a decision can change: the queue, and the wizards' reference lists. */
export const DECIDE_INVALIDATES: readonly (readonly string[])[] = [
  NAME_MATCH_REVIEWS_KEY,
  ["employers-active"],
  ["worksites-all"],
];

/** "alias written · 37 worker rows updated · 2 duplicate queue rows resolved". */
export function describeDecision(action: NameDecisionAction, result: DecideNameMatchResult): string {
  if (action === "reopen") return "Reopened — the alias and worker updates stay in place";
  const parts: string[] = [];
  if (action === "reject") {
    parts.push("rejected");
  } else {
    parts.push(result.aliasWritten ? "alias written" : "no new alias needed");
    const n = result.backfilledWorkerIds.length;
    parts.push(`${n} worker row${n === 1 ? "" : "s"} updated`);
  }
  const s = result.siblingsResolved;
  if (s > 0) parts.push(`${s} duplicate queue row${s === 1 ? "" : "s"} resolved`);
  return parts.join(" · ");
}

export async function postNameDecision(input: DecideNameMatchInput): Promise<DecideNameMatchResult> {
  const { id, ...body } = input;
  const response = await fetch(`/api/name-match-reviews/${id}/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as Partial<DecideNameMatchResult> & {
    error?: string;
  };
  if (!response.ok) {
    throw new DecideNameMatchError(json.error ?? `HTTP ${response.status}`, response.status);
  }
  return {
    review: json.review ?? null,
    aliasWritten: json.aliasWritten === true,
    backfilledWorkerIds: Array.isArray(json.backfilledWorkerIds) ? json.backfilledWorkerIds : [],
    siblingsResolved: Number(json.siblingsResolved ?? 0),
    ...(json.universeSyncError ? { universeSyncError: json.universeSyncError } : {}),
  };
}

export function useDecideNameMatch() {
  const queryClient = useQueryClient();
  return useAuthAwareMutation<DecideNameMatchResult, Error, DecideNameMatchInput>({
    mutationFn: postNameDecision,
    onSuccess: () => {
      for (const queryKey of DECIDE_INVALIDATES) {
        void queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
    },
  });
}
