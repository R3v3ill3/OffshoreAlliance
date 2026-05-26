/**
 * Shared dialer-session foundation. Consumed by both the desktop call
 * tracker (`components/phone/CallSessionPage`) and the mobile-first
 * shareable dialer (`components/phone/mobile/*`).
 *
 * - Types codify the data-source contract that staff and share callers
 *   fulfil with different transports.
 * - `useClaimCountdown` exposes the soft-claim TTL countdown to the UI.
 * - `useShareBootstrap` orchestrates the share-token bootstrap state
 *   machine (loading → password gate / locked / ready / error).
 * - `buildShareDataSource` wires the share-link API into the shared
 *   `CallSessionDataSource` interface.
 * - `useScriptVariables` memoises template-variable merging.
 */
export * from "./types";
export * from "./use-claim-countdown";
export * from "./use-claim-auto-renew";
export * from "./use-share-bootstrap";
export * from "./share-data-source";
export * from "./use-script-variables";
