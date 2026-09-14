'use client'

/**
 * Per-draft SendGrid engagement readout — the email counterpart of the
 * SMS reporting stat cards. Counts come from /platform-stats (email_send_log
 * unique opens/clicks). Rates stay em-dashes until something has delivered.
 */

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Rocket } from 'lucide-react'
import {
  formatRatePct,
  type EmailEngagementStats,
} from '@/lib/email/engagement-stats'
import type { EmailPlatformListProgress } from '@/lib/hooks/useEmailPlatformStats'

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

export interface EmailEngagementReportProps {
  engagement: EmailEngagementStats
  list?: EmailPlatformListProgress | null
  isLoading?: boolean
  compact?: boolean
}

export function EmailEngagementReport({
  engagement,
  list,
  isLoading,
  compact,
}: EmailEngagementReportProps) {
  const inFlight = list?.list_status === 'queued' || list?.list_status === 'sending'
  const doneCount = list
    ? list.sent_count + list.delivered_count + list.failed_count + list.bounced_count
    : 0

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Platform email report
        </p>
        {list && (
          <Badge variant="secondary" className="text-xs">
            {inFlight ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Rocket className="mr-1 h-3 w-3" />
            )}
            {doneCount}/{list.item_count} {list.list_status}
          </Badge>
        )}
      </div>

      {isLoading && !list && engagement.total === 0 ? (
        <p className="text-xs text-muted-foreground">Loading send stats…</p>
      ) : (
        <div
          className={
            compact
              ? 'grid grid-cols-2 gap-2 sm:grid-cols-3'
              : 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6'
          }
        >
          <StatCard
            label="Delivery rate"
            value={formatRatePct(engagement.delivery_rate_pct)}
            hint={`${engagement.delivered}/${engagement.total} delivered`}
          />
          <StatCard
            label="Open rate"
            value={formatRatePct(engagement.open_rate_pct)}
            hint={`${engagement.opened} unique opens`}
          />
          <StatCard
            label="Click rate"
            value={formatRatePct(engagement.click_rate_pct)}
            hint={`${engagement.clicked} unique clicks`}
          />
          <StatCard
            label="Bounced"
            value={String(engagement.bounced)}
            hint={formatRatePct(engagement.bounce_rate_pct)}
          />
          <StatCard
            label="Unsubscribed"
            value={String(engagement.unsubscribed)}
            hint={formatRatePct(engagement.unsubscribe_rate_pct)}
          />
          <StatCard
            label="Replied"
            value={String(engagement.replied)}
            hint={formatRatePct(engagement.reply_rate_pct)}
          />
        </div>
      )}

      {engagement.total > 0 &&
        engagement.opened === 0 &&
        engagement.clicked === 0 &&
        !inFlight && (
          <p className="text-[11px] text-muted-foreground">
            Opens and clicks appear here once SendGrid events land. Delivery
            and bounce numbers update from the same event stream.
          </p>
        )}
    </div>
  )
}
