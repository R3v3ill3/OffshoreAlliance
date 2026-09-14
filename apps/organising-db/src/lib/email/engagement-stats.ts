/**
 * Unique-open / unique-click rates for platform (SendGrid) sends.
 *
 * Denominators follow the usual email-reporting convention:
 *   delivery / bounce  → of sends
 *   open / click / unsub / reply → of delivered
 * When the denominator is 0 the rate is null so the UI can show an em-dash
 * instead of a misleading 0%.
 */

export interface EmailEngagementCounts {
  total: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  unsubscribed: number
  replied: number
}

export interface EmailEngagementRates {
  delivery_rate_pct: number | null
  open_rate_pct: number | null
  click_rate_pct: number | null
  bounce_rate_pct: number | null
  unsubscribe_rate_pct: number | null
  reply_rate_pct: number | null
}

export type EmailEngagementStats = EmailEngagementCounts & EmailEngagementRates

/** One decimal, matching vw_email_campaign_summary.delivery_rate_pct. */
export function ratePct(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null
  }
  return Math.round((1000 * numerator) / denominator) / 10
}

export function engagementRates(counts: EmailEngagementCounts): EmailEngagementRates {
  return {
    delivery_rate_pct: ratePct(counts.delivered, counts.total),
    open_rate_pct: ratePct(counts.opened, counts.delivered),
    click_rate_pct: ratePct(counts.clicked, counts.delivered),
    bounce_rate_pct: ratePct(counts.bounced, counts.total),
    unsubscribe_rate_pct: ratePct(counts.unsubscribed, counts.delivered),
    reply_rate_pct: ratePct(counts.replied, counts.delivered),
  }
}

export function withEngagementRates(counts: EmailEngagementCounts): EmailEngagementStats {
  return { ...counts, ...engagementRates(counts) }
}

export function formatRatePct(value: number | null): string {
  if (value == null) return '—'
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`
}

/**
 * Actions-hub one-liner. Open/click rates are omitted when the activity
 * payload has no engagement fields (older callers / unsent drafts).
 */
export function formatEmailHubResults(row: {
  source: 'list' | 'draft'
  total_items: number
  delivered_items: number
  failed_items: number
  opened_items?: number
  clicked_items?: number
}): string {
  if (row.source === 'draft') return 'Not sent yet'
  const parts = [`${row.delivered_items}/${row.total_items} delivered`]
  if (row.opened_items != null) {
    parts.push(`${formatRatePct(ratePct(row.opened_items, row.delivered_items))} opened`)
  }
  if (row.clicked_items != null) {
    parts.push(`${formatRatePct(ratePct(row.clicked_items, row.delivered_items))} clicked`)
  }
  if (row.failed_items > 0) parts.push(`${row.failed_items} failed`)
  return parts.join(' · ')
}
