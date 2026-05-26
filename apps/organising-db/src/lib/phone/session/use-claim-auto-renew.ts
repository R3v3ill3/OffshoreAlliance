"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CallSessionDataSource } from "./types";

interface UseClaimAutoRenewOptions {
  dataSource: CallSessionDataSource | null;
  itemId: number | null;
  /**
   * Initial `claimed_at` from the contact payload. The hook returns its own
   * `claimedAt` after the first successful renewal so the consumer can hand
   * it straight to `useClaimCountdown`.
   */
  initialClaimedAt: string | null;
  /**
   * Auto-renew when the live TTL drops below this many seconds. Defaults to
   * 5 minutes — leaves comfortable headroom on the server-side 15-minute TTL.
   */
  autoRenewThresholdSec?: number;
  /**
   * Minimum gap between consecutive renew attempts (ms). Stops rapid
   * interaction from spamming the server.
   */
  renewCooldownMs?: number;
  /** Fired when the server says the claim has been lost. */
  onClaimLost?: () => void;
}

interface UseClaimAutoRenewResult {
  claimedAt: string | null;
  isRenewing: boolean;
  /** Manually trigger a renewal — e.g. on user interaction. */
  touch: () => void;
}

/**
 * Drives claim TTL renewal for a held contact. Sets up two triggers:
 *
 *   1. A 60-second poll that compares current TTL against
 *      `autoRenewThresholdSec` and renews when low. Survives quiet phases
 *      of a call (caller silent, listening, etc.).
 *   2. Interaction-based renewal via `touch()` which UI consumers wire up
 *      to `pointerdown`, `keydown`, and `scroll` listeners — keeps the
 *      claim alive while the caller is actively working the surface.
 *
 * When the underlying data source can't renew (older transport), the hook
 * is a no-op so callers can rely on it unconditionally.
 */
export function useClaimAutoRenew({
  dataSource,
  itemId,
  initialClaimedAt,
  autoRenewThresholdSec = 5 * 60,
  renewCooldownMs = 30 * 1000,
  onClaimLost,
}: UseClaimAutoRenewOptions): UseClaimAutoRenewResult {
  const [claimedAt, setClaimedAt] = useState<string | null>(initialClaimedAt);
  const [isRenewing, setIsRenewing] = useState(false);
  const lastRenewAttempt = useRef<number>(0);
  const lostFiredRef = useRef(false);

  useEffect(() => {
    setClaimedAt(initialClaimedAt);
    lostFiredRef.current = false;
  }, [initialClaimedAt, itemId]);

  const performRenew = useCallback(async () => {
    if (!dataSource?.renewClaim || !itemId) return;
    const now = Date.now();
    if (now - lastRenewAttempt.current < renewCooldownMs) return;
    lastRenewAttempt.current = now;
    setIsRenewing(true);
    try {
      const result = await dataSource.renewClaim(itemId);
      if (result.renewed && result.claimed_at) {
        setClaimedAt(result.claimed_at);
      } else if (!result.renewed && !lostFiredRef.current) {
        lostFiredRef.current = true;
        onClaimLost?.();
      }
    } catch {
      // Soft-fail — the visible countdown will continue ticking down and
      // the lost-claim screen will catch the expiry.
    } finally {
      setIsRenewing(false);
    }
  }, [dataSource, itemId, renewCooldownMs, onClaimLost]);

  useEffect(() => {
    if (!dataSource?.renewClaim || !itemId || !claimedAt) return;
    const id = setInterval(() => {
      const claimedMs = Date.parse(claimedAt);
      if (!Number.isFinite(claimedMs)) return;
      const ageSec = Math.max(0, (Date.now() - claimedMs) / 1000);
      const remainingSec = 15 * 60 - ageSec;
      if (remainingSec <= autoRenewThresholdSec) {
        void performRenew();
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [dataSource, itemId, claimedAt, autoRenewThresholdSec, performRenew]);

  const touch = useCallback(() => {
    void performRenew();
  }, [performRenew]);

  return { claimedAt, isRenewing, touch };
}
