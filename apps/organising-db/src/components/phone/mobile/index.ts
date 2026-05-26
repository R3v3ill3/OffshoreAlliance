/**
 * Mobile-first shareable dialer component tree.
 *
 * The orchestrator (`MobileDialer`) drives a screen-based state machine
 * around the shared `useShareBootstrap` / `buildShareDataSource` foundation
 * from `lib/phone/session`. Screens are mounted one at a time so the
 * mobile viewport stays focused on a single decision.
 *
 * Screens:
 *   - Welcome (loading splash)
 *   - PasswordGate (auth + identity)
 *   - Queue (between-calls)
 *   - Contact (call-to-action surface)
 *   - CallSession (in-call capture)
 *   - WrapUp (end-of-list)
 *   - LostClaim (claim expired)
 *   - Error (fallback)
 */
export { MobileDialer } from "./MobileDialer";
