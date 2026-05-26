"use client";

import { useEffect, useState } from "react";
import { CALL_CLAIM_TTL_SECONDS } from "./types";

export interface ClaimCountdown {
  /** Seconds remaining before the claim is reclaimable by the queue. */
  secondsRemaining: number;
  /** True when the claim is within 60 seconds of expiry. */
  isExpiringSoon: boolean;
  /** True when the claim has already expired client-side. */
  isExpired: boolean;
  /** Formatted "M:SS" string. */
  formatted: string;
}

/**
 * Tracks the soft-claim TTL on a `call_list_items` row. The TTL is anchored
 * to `claimed_at` (server clock); we count from `claimedAt` plus
 * `CALL_CLAIM_TTL_SECONDS` and tick once a second client-side.
 *
 * Returns a stable object every tick. When `claimedAt` is null the countdown
 * is dormant (returns infinity / "--:--") so the consumer can render a
 * neutral state for the queue-between-calls screen.
 */
export function useClaimCountdown(
  claimedAt: string | Date | null | undefined,
  ttlSeconds: number = CALL_CLAIM_TTL_SECONDS,
): ClaimCountdown {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!claimedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [claimedAt]);

  if (!claimedAt) {
    return {
      secondsRemaining: Number.POSITIVE_INFINITY,
      isExpiringSoon: false,
      isExpired: false,
      formatted: "--:--",
    };
  }

  const claimedMs = typeof claimedAt === "string" ? Date.parse(claimedAt) : claimedAt.getTime();
  const expiresMs = claimedMs + ttlSeconds * 1000;
  const remaining = Math.max(0, Math.round((expiresMs - now) / 1000));
  const isExpired = remaining <= 0;
  const isExpiringSoon = remaining > 0 && remaining <= 60;

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const formatted = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return {
    secondsRemaining: remaining,
    isExpiringSoon,
    isExpired,
    formatted,
  };
}
