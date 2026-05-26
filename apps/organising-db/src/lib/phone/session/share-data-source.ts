"use client";

import { fetchApi } from "@/lib/api/fetch-api";
import type {
  CallListItemWithWorker,
  RecordCallAttemptRequest,
} from "@/types/planner-types";
import type { CallSessionDataSource, CallSessionBootstrap, CallSessionCaller } from "./types";

interface BuildShareDataSourceOptions {
  token: string;
  bootstrap: CallSessionBootstrap;
  caller: CallSessionCaller;
  onLogout?: () => void;
}

/**
 * Builds a CallSessionDataSource backed by the public share-link API.
 *
 * The transport never sees a Supabase auth session — `/api/call-share/...`
 * verifies the URL token + signed cookie set by `/auth`. Claim/release uses
 * the share-token claim RPC, attempt POST forwards the full payload
 * (assessment_ratings, outcome_classification, action_id, objections,
 * issues, cta_ratings) to `record_call_attempt`.
 */
export function buildShareDataSource({
  token,
  bootstrap,
  caller,
  onLogout,
}: BuildShareDataSourceOptions): CallSessionDataSource {
  return {
    bootstrap,
    caller,
    canEditWorker: false,
    canCreateTaskList: false,
    onLogout,

    fetchNext: async () => {
      const res = await fetchApi(`/api/call-share/${token}/next`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((body as { error?: string }).error ?? "Failed to get next contact");
      }
      if ((body as { done?: boolean }).done) return null;
      return body as CallListItemWithWorker;
    },

    recordAttempt: async (req: RecordCallAttemptRequest) => {
      const res = await fetchApi(`/api/call-share/${token}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((body as { error?: string }).error ?? "Failed to record attempt");
      }
      return body as { attempt_id: number };
    },

    releaseClaim: async (itemId: number) => {
      const body = JSON.stringify({ item_id: itemId });
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const sent = navigator.sendBeacon(`/api/call-share/${token}/release`, body);
        if (sent) return;
      }
      await fetchApi(`/api/call-share/${token}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    },

    renewClaim: async (itemId: number) => {
      const res = await fetchApi(`/api/call-share/${token}/renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { renewed: false, claimed_at: null };
      }
      const renewed =
        typeof (body as { renewed?: boolean }).renewed === "boolean"
          ? (body as { renewed: boolean }).renewed
          : false;
      const claimedAt =
        typeof (body as { claimed_at?: string | null }).claimed_at === "string"
          ? (body as { claimed_at: string }).claimed_at
          : null;
      return { renewed, claimed_at: claimedAt };
    },
  };
}
