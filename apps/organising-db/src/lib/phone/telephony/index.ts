/**
 * Telephony layer for the phone dialer.
 *
 * Components never construct `tel:` URLs directly. They request a call via
 * `useTelephony().placeCall(...)` and the provider chooses how to satisfy
 * the dial — today via the device OS dialer (`TelLinkProvider`); in a
 * future iteration via Twilio Voice WebRTC or another server-mediated
 * provider without touching the dialer UI.
 */
export * from "./types";
export * from "./tel-link-provider";
export * from "./use-telephony";
