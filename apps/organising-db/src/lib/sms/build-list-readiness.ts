/**
 * SMS contact-readiness counting (brief §B, Phase 8 work item 9) —
 * pure, shared by fire/sms's prepare mode and build-list-panel.tsx so
 * the warning the organiser reads and the row statuses the route
 * writes can never disagree.
 *
 * Precedence matches fire/sms's item screening: opt-out is decided
 * FIRST, so an opted-out worker with no mobile counts as optedOut,
 * not missingMobile. The three buckets always sum to total.
 */

export interface SmsReadinessInput {
  phone_e164: string | null;
  sms_opt_out: boolean | null;
}

export interface SmsReadinessCounts {
  total: number;
  sendable: number;
  missingMobile: number;
  optedOut: number;
}

/**
 * Trims a phone value and collapses whitespace-only input to null.
 * Shared by this module, fire/sms's blast item screening, and
 * build-list-item-row.tsx's SMS contact indicator so "sendable"
 * never disagrees across the three call sites — a `" "` value must
 * count as missing everywhere, not just here.
 */
export function normalisePhoneE164OrNull(
  phone: string | null | undefined,
): string | null {
  const trimmed = phone?.trim();
  return trimmed ? trimmed : null;
}

export function smsReadiness(items: SmsReadinessInput[]): SmsReadinessCounts {
  let sendable = 0;
  let missingMobile = 0;
  let optedOut = 0;

  for (const item of items) {
    const hasMobile = normalisePhoneE164OrNull(item.phone_e164) != null;
    if (item.sms_opt_out === true) {
      optedOut++;
    } else if (!hasMobile) {
      missingMobile++;
    } else {
      sendable++;
    }
  }

  return { total: items.length, sendable, missingMobile, optedOut };
}

/**
 * "N without a mobile, M opted out" — null when every recipient is
 * sendable (nothing to warn about).
 */
export function formatSmsReadinessWarning(
  counts: Pick<SmsReadinessCounts, "sendable" | "missingMobile" | "optedOut" | "total">,
): string | null {
  const { sendable, missingMobile, optedOut, total } = counts;
  if (sendable >= total) return null;

  const clauses: string[] = [];
  if (missingMobile > 0) {
    clauses.push(`${missingMobile} without a mobile`);
  }
  if (optedOut > 0) {
    clauses.push(`${optedOut} opted out`);
  }
  return clauses.length > 0 ? clauses.join(", ") : null;
}
