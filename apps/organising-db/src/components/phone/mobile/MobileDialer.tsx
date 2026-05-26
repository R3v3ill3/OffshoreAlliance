"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShareBootstrap } from "@/lib/phone/session/use-share-bootstrap";
import { buildShareDataSource } from "@/lib/phone/session/share-data-source";
import type { CallSessionDataSource } from "@/lib/phone/session/types";
import type { CallListItemWithWorker } from "@/types/planner-types";
import type { OutcomeClassification } from "@/lib/phone/outcome-model";
import { MobileWelcome } from "./screens/MobileWelcome";
import { MobilePasswordGate } from "./screens/MobilePasswordGate";
import { MobileQueue, type RecentMobileAttempt } from "./screens/MobileQueue";
import { MobileContact } from "./screens/MobileContact";
import { MobileCallSession } from "./screens/MobileCallSession";
import { MobileWrapUp } from "./screens/MobileWrapUp";
import { MobileLostClaim } from "./screens/MobileLostClaim";
import { MobileError } from "./screens/MobileError";
import { useClaimCountdown } from "@/lib/phone/session/use-claim-countdown";
import { dialerTelemetry, tokenHint } from "@/lib/phone/telemetry";

type ScreenState =
  | { kind: "queue" }
  | { kind: "contact"; contact: CallListItemWithWorker }
  | { kind: "in_call"; contact: CallListItemWithWorker }
  | { kind: "wrap_up" }
  | { kind: "lost_claim" }
  | { kind: "loading_next" };

interface MobileDialerProps {
  token: string;
}

/**
 * Top-level orchestrator for the mobile shareable dialer.
 *
 * State machine:
 *   bootstrap → password gate / locked / ready
 *   ready → queue → contact → in_call → wrap_up
 *   any → lost_claim (claim expired client-side)
 */
export function MobileDialer({ token }: MobileDialerProps) {
  const { state, refresh, toPasswordGate } = useShareBootstrap(token);
  const [screen, setScreen] = useState<ScreenState>({ kind: "queue" });
  const hint = tokenHint(token);

  useEffect(() => {
    dialerTelemetry.opened({ token_hint: hint });
  }, [hint]);

  useEffect(() => {
    if (state.kind !== "ready") return;
    dialerTelemetry.authenticated({
      token_hint: hint,
      worker_id: state.caller.workerId ?? null,
    });
  }, [state, hint]);
  const [error, setError] = useState<string | null>(null);
  const [isFetchingNext, setIsFetchingNext] = useState(false);
  const [recent, setRecent] = useState<RecentMobileAttempt[]>([]);
  const releaseInFlight = useRef<number | null>(null);

  const dataSource = useMemo<CallSessionDataSource | null>(() => {
    if (state.kind !== "ready") return null;
    return buildShareDataSource({
      token,
      bootstrap: state.bootstrap,
      caller: state.caller,
      onLogout: () =>
        toPasswordGate({
          campaign_name: null,
          call_list_name: state.bootstrap.list.name,
        }),
    });
  }, [state, token, toPasswordGate]);

  // Loose claim countdown — when expired we move to the lost-claim screen so
  // the caller is told what happened rather than silently losing the contact.
  // The in-call session also signals `onClaimLost` directly when the server
  // refuses a renewal (e.g. coordinator force-released).
  const activeContact = "contact" in screen ? screen.contact : null;
  const countdown = useClaimCountdown(activeContact?.claimed_at ?? null);
  useEffect(() => {
    if (!activeContact) return;
    if (countdown.isExpired && screen.kind === "contact") {
      dialerTelemetry.claimLost({
        item_id: activeContact.item_id,
        reason: "ttl_expired",
      });
      setScreen({ kind: "lost_claim" });
    }
  }, [countdown.isExpired, activeContact, screen.kind]);

  const fetchNext = useCallback(async () => {
    if (!dataSource) return;
    setIsFetchingNext(true);
    setError(null);
    try {
      const next = await dataSource.fetchNext();
      if (!next) {
        dialerTelemetry.wrapUpShown({ calls_completed: recent.length });
        setScreen({ kind: "wrap_up" });
        return;
      }
      dialerTelemetry.claimAcquired({
        item_id: next.item_id,
        list_id: next.list_id,
      });
      setScreen({ kind: "contact", contact: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load next contact");
      setScreen({ kind: "queue" });
    } finally {
      setIsFetchingNext(false);
    }
  }, [dataSource]);

  const releaseClaim = useCallback(
    async (itemId: number) => {
      if (!dataSource) return;
      if (releaseInFlight.current === itemId) return;
      releaseInFlight.current = itemId;
      try {
        await dataSource.releaseClaim(itemId);
        dialerTelemetry.claimReleased({ item_id: itemId });
      } catch {
        // best-effort — claim TTL will release server-side anyway
      } finally {
        releaseInFlight.current = null;
      }
    },
    [dataSource],
  );

  // Release the claim on tab close / navigation when an active contact is held.
  useEffect(() => {
    if (!activeContact) return;
    const itemId = activeContact.item_id;
    const handler = () => {
      void releaseClaim(itemId);
    };
    window.addEventListener("pagehide", handler);
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      window.removeEventListener("beforeunload", handler);
    };
  }, [activeContact, releaseClaim]);

  const handleAttemptRecorded = useCallback(
    (result: {
      attempt_id: number;
      outcome_classification: OutcomeClassification | null;
      contact: CallListItemWithWorker;
    }) => {
      const fullName =
        `${result.contact.worker?.first_name ?? ""} ${result.contact.worker?.last_name ?? ""}`.trim() ||
        `Worker #${result.contact.worker?.worker_id ?? "?"}`;
      setRecent((prev) =>
        [
          {
            attempt_id: result.attempt_id,
            contact_label: fullName,
            outcome_classification: result.outcome_classification,
            placed_at: new Date(),
          },
          ...prev,
        ].slice(0, 30),
      );
      dialerTelemetry.attemptRecorded({
        item_id: result.contact.item_id,
        attempt_id: result.attempt_id,
        outcome_classification: result.outcome_classification,
        duration_seconds: null,
      });
      setScreen({ kind: "loading_next" });
      void fetchNext();
    },
    [fetchNext],
  );

  const handleSkip = useCallback(() => {
    setScreen({ kind: "loading_next" });
    void fetchNext();
  }, [fetchNext]);

  const handleHandBack = useCallback(async () => {
    dialerTelemetry.handBack({ item_id: activeContact?.item_id ?? null });
    if (activeContact) {
      await releaseClaim(activeContact.item_id);
    }
    setScreen({ kind: "queue" });
  }, [activeContact, releaseClaim]);

  if (state.kind === "loading") {
    return <MobileWelcome />;
  }
  if (state.kind === "password_required") {
    return (
      <MobilePasswordGate
        token={token}
        campaignName={state.gate.campaign_name}
        callListName={state.gate.call_list_name}
        onSuccess={() => void refresh()}
      />
    );
  }
  if (state.kind === "locked") {
    return (
      <MobileError
        message={`This link is temporarily locked. Try again after ${
          state.locked_until ? new Date(state.locked_until).toLocaleString() : "the lockout ends"
        }.`}
      />
    );
  }
  if (state.kind === "error") {
    return <MobileError message={state.message} onRetry={() => void refresh()} />;
  }
  if (!dataSource) return null;

  if (screen.kind === "lost_claim") {
    return (
      <MobileLostClaim
        onContinue={() => {
          setScreen({ kind: "loading_next" });
          void fetchNext();
        }}
      />
    );
  }

  if (screen.kind === "wrap_up") {
    return (
      <MobileWrapUp
        bootstrap={dataSource.bootstrap}
        caller={dataSource.caller}
        recent={recent}
        onCheckForMore={() => {
          setScreen({ kind: "loading_next" });
          void fetchNext();
        }}
        onLogout={dataSource.onLogout}
      />
    );
  }

  if (screen.kind === "queue" || screen.kind === "loading_next") {
    return (
      <MobileQueue
        bootstrap={dataSource.bootstrap}
        caller={dataSource.caller}
        callerCompleted={recent.length}
        recent={recent}
        isFetchingNext={isFetchingNext || screen.kind === "loading_next"}
        onFetchNext={() => void fetchNext()}
        onLogout={dataSource.onLogout}
      />
    );
  }

  if (screen.kind === "contact") {
    const crossList = screen.contact.cross_list_status ?? null;
    const recentCrossList = crossList
      ? {
          list_name: crossList.list_name,
          caller_label: crossList.last_caller_session_label ?? "Another caller",
          outcome_label:
            crossList.last_outcome_classification?.replace(/_/g, " ") ??
            crossList.last_call_disposition?.replace(/_/g, " ") ??
            crossList.last_dial_disposition?.replace(/_/g, " ") ??
            "contacted",
          contacted_at: crossList.last_attempt_at,
        }
      : null;
    return (
      <MobileContact
        contact={screen.contact}
        listName={dataSource.bootstrap.list.name}
        callerLabel={dataSource.caller.label}
        recentCrossListContact={recentCrossList}
        onCallPlaced={() => setScreen({ kind: "in_call", contact: screen.contact })}
        onSkip={handleSkip}
        onHandBack={handleHandBack}
        onLogout={dataSource.onLogout}
      />
    );
  }

  return (
    <>
      {error ? (
        <div className="px-4 pt-3">
          <p className="rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-800">{error}</p>
        </div>
      ) : null}
      <MobileCallSession
        contact={screen.contact}
        dataSource={dataSource}
        onAttemptRecorded={handleAttemptRecorded}
        onSkipContact={handleSkip}
        onHandBack={handleHandBack}
        onClaimLost={() => {
          dialerTelemetry.claimLost({
            item_id: screen.contact.item_id,
            reason: "server_force_released",
          });
          setScreen({ kind: "lost_claim" });
        }}
      />
    </>
  );
}
