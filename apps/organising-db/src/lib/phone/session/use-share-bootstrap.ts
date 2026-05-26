"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchApi } from "@/lib/api/fetch-api";
import type { CallSessionBootstrap, CallSessionCaller } from "./types";

export type ShareBootstrapState =
  | { kind: "loading" }
  | {
      kind: "password_required";
      gate: { campaign_name: string | null; call_list_name: string | null };
    }
  | { kind: "locked"; locked_until: string }
  | { kind: "ready"; bootstrap: CallSessionBootstrap; caller: CallSessionCaller }
  | { kind: "error"; message: string };

/**
 * Loads `/api/call-share/{token}` and parses into our domain shape.
 * Handles the three gate states (no session → password_required,
 * locked token → locked, success → ready) so the page component
 * stays declarative.
 */
export function useShareBootstrap(token: string): {
  state: ShareBootstrapState;
  refresh: () => Promise<void>;
  toPasswordGate: (gate: { campaign_name: string | null; call_list_name: string | null }) => void;
} {
  const [state, setState] = useState<ShareBootstrapState>({ kind: "loading" });

  const refresh = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetchApi(`/api/call-share/${token}`);
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setState({
          kind: "password_required",
          gate: body as { campaign_name: string | null; call_list_name: string | null },
        });
        return;
      }
      if (res.status === 423) {
        setState({
          kind: "locked",
          locked_until: (body as { locked_until?: string }).locked_until ?? "",
        });
        return;
      }
      if (!res.ok) {
        setState({
          kind: "error",
          message: (body as { error?: string }).error ?? "Failed to load call list",
        });
        return;
      }
      const payload = body as {
        campaign: { campaign_id: number; name: string };
        call_list: CallSessionBootstrap["list"];
        linkedScripts: CallSessionBootstrap["linkedScripts"];
        outcome_definitions: CallSessionBootstrap["outcomeDefinitions"];
        cta_ambitions: CallSessionBootstrap["ctaAmbitions"];
        objection_bank?: CallSessionBootstrap["objectionBank"];
        expected_issues?: CallSessionBootstrap["expectedIssues"];
        session_assessments?: CallSessionBootstrap["sessionAssessments"];
        action_id?: number | null;
        script_variable_context: Record<string, string | undefined>;
        caller: CallSessionCaller;
      };
      setState({
        kind: "ready",
        bootstrap: {
          campaignId: payload.campaign.campaign_id,
          list: payload.call_list,
          linkedScripts: payload.linkedScripts ?? [],
          outcomeDefinitions: payload.outcome_definitions ?? [],
          ctaAmbitions: payload.cta_ambitions ?? [],
          objectionBank: payload.objection_bank ?? [],
          expectedIssues: payload.expected_issues ?? [],
          sessionAssessments: payload.session_assessments ?? [],
          actionId: payload.action_id ?? null,
          scriptContext: payload.script_variable_context ?? {},
        },
        caller: payload.caller,
      });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to load",
      });
    }
  }, [token]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void refresh();
    });
  }, [refresh]);

  const toPasswordGate = useCallback(
    (gate: { campaign_name: string | null; call_list_name: string | null }) => {
      setState({ kind: "password_required", gate });
    },
    [],
  );

  return { state, refresh, toPasswordGate };
}
