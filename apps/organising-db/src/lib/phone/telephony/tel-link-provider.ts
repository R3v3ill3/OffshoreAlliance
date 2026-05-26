"use client";

import type {
  CallEvent,
  PlaceCallOptions,
  PlaceCallResult,
  TelephonyProvider,
} from "./types";

/**
 * Device-dial telephony provider — opens the OS dialer via `tel:` URL.
 *
 * The caller places the call from their own phone. The dialer becomes a
 * tracking surface around the call event; outcome capture is manual.
 * Suitable for both the desktop tracker (organiser clicks the phone number
 * and types it into their own phone) and the mobile share-link surface
 * (mobile browser hands the dial event off to the OS dialer).
 */
export class TelLinkProvider implements TelephonyProvider {
  readonly id = "tel-link";
  readonly supportsLifecycleEvents = false;

  private listeners = new Set<(event: CallEvent) => void>();

  async placeCall(options: PlaceCallOptions): Promise<PlaceCallResult> {
    const placedAt = new Date();
    const normalized = normalizeForTelLink(options.phoneNumber);

    if (typeof window === "undefined") {
      // SSR safety: report placing event for telemetry, don't actually navigate.
      this.emit({ kind: "placing", callId: null, at: placedAt });
      return { callId: null, placedAt };
    }

    // Use an off-DOM anchor click so the browser treats this as a user
    // gesture-driven navigation (matches the existing <a href="tel:..."> UX).
    const anchor = document.createElement("a");
    anchor.href = `tel:${normalized}`;
    anchor.rel = "noreferrer";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      document.body.removeChild(anchor);
    }

    this.emit({
      kind: "placing",
      callId: null,
      at: placedAt,
      detail: options.contactLabel ?? undefined,
    });
    return { callId: null, placedAt };
  }

  onCallEvent(handler: (event: CallEvent) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  /**
   * Tel-link can't observe call end. UI emits this manually when the user
   * confirms the call is over (e.g. selects a dial outcome).
   */
  signalManualEnd(detail?: string): void {
    this.emit({ kind: "ended", callId: null, at: new Date(), detail });
  }

  private emit(event: CallEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("TelLinkProvider listener error", err);
      }
    }
  }
}

/**
 * Strip everything except digits, leading `+`, `;`, and `,` (DTMF pause
 * separators allowed by RFC 3966). Preserves Australian display formatting
 * input like "0412 345 678" → "0412345678".
 */
export function normalizeForTelLink(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/[^0-9+,;]/g, "");
}
