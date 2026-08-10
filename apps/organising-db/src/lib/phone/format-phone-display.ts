/**
 * Compatibility shim — the implementation lives in the canonical
 * normalisation module. Prefer importing `toDisplay` from
 * `@/lib/phone/normalise-phone` in new code.
 */
export { toDisplay as formatAustralianPhoneDisplay } from "./normalise-phone";
