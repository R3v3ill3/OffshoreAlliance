"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShareBootstrap } from "@/lib/phone/session/use-share-bootstrap";
import { buildShareDataSource } from "@/lib/phone/session/share-data-source";
import { dialerTelemetry, tokenHint } from "@/lib/phone/telemetry";
import type { CallSessionDataSource } from "@/lib/phone/session/types";
import type { CallListItemWithWorker } from "@/types/planner-types";
import type { OutcomeClassification } from "@/lib/phone/outcome-model";
import { DesktopGate } from "./DesktopGate";
import { DesktopQueue } from "./DesktopQueue";
import { DesktopCallSession } from "./DesktopCallSession";
import {
  DesktopError,
  DesktopLoading,
  DesktopLostClaim,
  DesktopWrapUp,
} from "./DesktopStates";
import type { RecentMobileAttempt } from "@/components/phone/mobile/screens/MobileQueue";

type ScreenState =
  | { kind: "queue" }
  | { kind: "session"; contact: CallListItemWithWorker }
  | { kind: "wrap_up" }
  | { kind: "lost_claim" }
  | { kind: "loading_next" };

interface DesktopDialerProps {
  token: string;
  /** Switch back to the phone-optimised dialer layout. */
  onSwitchToMobile?: () => void;
}

/**
 * Desktop-optimised orchestrator for the shareable call list.
 *
 * Shares the bootstrap, claim, attempt and release transport with the mobile
 * dialer (`useShareBootstrap` + `buildShareDataSource`). The difference is the
 * surface: a wide layout that records the outcome of a call placed on a
 * separate handset rather than dialling in-app.
 *
 * State machine:
 *   bootstrap → gate / locked / ready
 *   ready → queue → session → (save) → queue's next contact
 *   any → lost_claim (claim expired / force-released server-side)
 */
export function DesktopDialer({ token, onSwitchToMobile }: DesktopDialerProps) {
  const { state, refresh, toPasswordGate } = useShareBootstrap(token);
  const [screen, setScreen] = useState<ScreenState>({ kind: "queue" });
  const [error, setError] = useState<string | null>(null);
  const [isFetchingNext, setIsFetchingNext] = useState(false);
  const [recent, setRecent] = useState<RecentMobileAttempt[]>([]);
  const releaseInFlight = useRef<number | null>(null);
  const hint = tokenHint(token);

  useEffect(() => {
    dialerTelemetry.opened({ token_hint: hint });
  }, [hint]);

  useEffect(() => {
    if (state.kind !== "ready") return;
    dialerTelemetry.authenticated({
      token_hint: hint,
      worker_id: state.caller.worker_id ?? null,
    });
  }, [state, hint]);

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

  const activeContact = screen.kind === "session" ? screen.contact : null;

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
      dialerTelemetry.claimAcquired({ item_id: next.item_id, list_id: next.list_id });
      setScreen({ kind: "session", contact: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load next contact");
      setScreen({ kind: "queue" });
    } finally {
      setIsFetchingNext(false);
    }
  }, [dataSource, recent.length]);

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

  // Release the held claim on tab close / navigation.
  useEffect(() => {
    if (!activeContact) return;
    const itemId = activeContact.item_id;
    const handler = () => void releaseClaim(itemId);
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

  const handleSkip = useCallback(async () => {
    const contact = activeContact;
    setScreen({ kind: "loading_next" });
    // The skip attempt has already been recorded by the session screen; here we
    // also deprioritise the contact so it drops to the back of the queue.
    if (contact && dataSource?.skipContact) {
      try {
        await dataSource.skipContact(contact.item_id);
      } catch {
        // Non-critical — fetchNext proceeds regardless.
      }
    }
    void fetchNext();
  }, [activeContact, dataSource, fetchNext]);

  const handleHandBack = useCallback(async () => {
    dialerTelemetry.handBack({ item_id: activeContact?.item_id ?? null });
    if (activeContact) {
      await releaseClaim(activeContact.item_id);
    }
    setScreen({ kind: "queue" });
  }, [activeContact, releaseClaim]);

  if (state.kind === "loading") {
    return <DesktopLoading />;
  }
  if (state.kind === "password_required") {
    return (
      <DesktopGate
        token={token}
        campaignName={state.gate.campaign_name}
        callListName={state.gate.call_list_name}
        onSuccess={() => void refresh()}
      />
    );
  }
  if (state.kind === "locked") {
    return (
      <DesktopError
        message={`This link is temporarily locked. Try again after ${
          state.locked_until ? new Date(state.locked_until).toLocaleString() : "the lockout ends"
        }.`}
      />
    );
  }
  if (state.kind === "error") {
    return <DesktopError message={state.message} onRetry={() => void refresh()} />;
  }
  if (!dataSource) return null;

  if (screen.kind === "lost_claim") {
    return (
      <DesktopLostClaim
        onContinue={() => {
          setScreen({ kind: "loading_next" });
          void fetchNext();
        }}
      />
    );
  }

  if (screen.kind === "wrap_up") {
    return (
      <DesktopWrapUp
        bootstrap={dataSource.bootstrap}
        caller={dataSource.caller}
        recent={recent}
        onCheckForMore={() => {
          setScreen({ kind: "loading_next" });
          void fetchNext();
        }}
        onSwitchToMobile={onSwitchToMobile}
        onLogout={dataSource.onLogout}
      />
    );
  }

  if (screen.kind === "queue" || screen.kind === "loading_next") {
    return (
      <DesktopQueue
        bootstrap={dataSource.bootstrap}
        caller={dataSource.caller}
        recent={recent}
        isFetchingNext={isFetchingNext || screen.kind === "loading_next"}
        error={error}
        onFetchNext={() => void fetchNext()}
        onSwitchToMobile={onSwitchToMobile}
        onLogout={dataSource.onLogout}
      />
    );
  }

  return (
    <DesktopCallSession
      contact={screen.contact}
      dataSource={dataSource}
      recent={recent}
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
      onSwitchToMobile={onSwitchToMobile}
    />
  );
}
