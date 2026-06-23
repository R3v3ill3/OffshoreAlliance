/**
 * Desktop-optimised shareable call dialer.
 *
 * A wide-layout sibling of the mobile dialer (`components/phone/mobile`).
 * Both consume the same share-token transport (`lib/phone/session`); the
 * desktop surface records the outcome of a call placed on a separate handset
 * rather than dialling in-app.
 */
export { DesktopDialer } from "./DesktopDialer";
