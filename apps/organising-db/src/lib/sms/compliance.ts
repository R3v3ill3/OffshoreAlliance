/**
 * Broadcast compliance validation (brief §3.1 item 9 / §2.1).
 *
 * Mobile Message does NOT auto-append opt-out text. Bulk bodies must
 * identify the organisation ("Offshore Alliance"). An opt-out
 * instruction (e.g. "Reply STOP to opt out") is recommended and still
 * detected for the composer checklist, but is optional — existing
 * members already have a functional STOP path via the provider and
 * inbound webhook, and repeating the line on every member touch is
 * unnecessary. Checked client-side in the composer (blocks the queue
 * button on hard failures only) and re-checked server-side in the
 * queue action.
 *
 * Pure module — unit tested in __tests__/compliance.test.ts.
 */

export interface SmsComplianceResult {
  ok: boolean;
  hasOrgName: boolean;
  hasOptOut: boolean;
  errors: string[];
}

const ORG_NAME_RE = /offshore\s+alliance/i;

// "reply STOP" / "txt STOP" / "text STOP to opt out" / bare "STOP" /
// "opt out" | "opt-out" phrasing.
const OPT_OUT_RE = /(?:\b(?:reply|txt|text)\b[^.\n]{0,20}\bstop\b)|(?:\bstop\b\s*(?:to|2)\s*(?:opt|end|unsub))|\bopt[\s-]?out\b/i;

export function validateSmsBody(body: string): SmsComplianceResult {
  const hasOrgName = ORG_NAME_RE.test(body);
  const hasOptOut = OPT_OUT_RE.test(body);
  const errors: string[] = [];
  if (!hasOrgName) {
    errors.push(
      'Message must identify the organisation — include "Offshore Alliance".'
    );
  }
  return { ok: errors.length === 0, hasOrgName, hasOptOut, errors };
}
