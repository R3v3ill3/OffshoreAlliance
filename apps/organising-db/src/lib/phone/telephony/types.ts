/**
 * Telephony provider interface.
 *
 * Currently the only implementation places a call by handing the dial event
 * to the device OS via a `tel:` URL — the caller dials with their own phone
 * and the dialer is purely a tracking surface. The interface intentionally
 * mirrors what a future server-mediated provider (Twilio Voice via WebRTC,
 * Vonage, Plivo) would need: `placeCall`, optional `endCall`, and an
 * `onCallEvent` stream so the UI can react to lifecycle changes (ringing,
 * answered, ended, errored) without the components knowing which provider
 * is in use.
 *
 * Components should NEVER reference `tel:` directly — they request a call
 * through `useTelephony().placeCall(number)` and the provider decides how
 * to satisfy it.
 */

export type CallEventKind =
  /** Placement requested. Provider has handed off to OS or telephony stack. */
  | "placing"
  /** Provider has established a media session (browser-call provider). */
  | "ringing"
  /** Far end has answered (browser-call provider). */
  | "answered"
  /** Call has ended cleanly. */
  | "ended"
  /** Provider failed to start the call (permissions, bad number, etc.). */
  | "error";

export interface CallEvent {
  kind: CallEventKind;
  /** Free-form provider-specific identifier (e.g. Twilio CallSid). */
  callId?: string | null;
  /** Wall-clock timestamp the event was observed. */
  at: Date;
  /** Optional human-readable detail (especially for `error`). */
  detail?: string;
}

export interface PlaceCallOptions {
  /** E.164 (preferred) or display-formatted phone number. */
  phoneNumber: string;
  /** Display name shown to the caller's own device when supported. */
  contactLabel?: string;
  /** Hint for the provider — `share_link` vs `staff_tracker`. */
  surface?: "share_link" | "staff_tracker";
}

export interface PlaceCallResult {
  /** Provider-specific identifier (e.g. Twilio CallSid). null for tel: */
  callId: string | null;
  /** Wall-clock time the dial was initiated. */
  placedAt: Date;
}

export interface TelephonyProvider {
  /** Unique provider identifier used in logs / telemetry. */
  readonly id: string;

  /** True when the provider can report lifecycle events beyond `placing`. */
  readonly supportsLifecycleEvents: boolean;

  /**
   * Initiate a call. The tel: implementation triggers an `<a href="tel:...">`
   * navigation via the DOM and resolves immediately; future providers return
   * once the call has actually been queued by their backend.
   */
  placeCall(options: PlaceCallOptions): Promise<PlaceCallResult>;

  /**
   * Request that an in-flight call be ended. tel: providers can't terminate
   * a call placed via the OS dialler, so this is a no-op; browser-call
   * providers tear down the media session.
   */
  endCall?(callId: string): Promise<void>;

  /**
   * Subscribe to lifecycle events. tel: providers only ever emit `placing`
   * and `ended` (when the consumer manually signals end-of-call). Browser
   * providers stream the full lifecycle.
   *
   * Returns an unsubscribe function.
   */
  onCallEvent?(handler: (event: CallEvent) => void): () => void;
}
