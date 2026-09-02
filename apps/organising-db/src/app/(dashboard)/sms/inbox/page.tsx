'use client'

/**
 * Global SMS inbox — same three-pane queue as the campaign SMS tab,
 * defaulting to all conversations. Pick a campaign in the dropdown
 * (bookmarkable via ?campaign=) or deep-link a thread (?conversation=).
 */
import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { SmsInboxPanel } from '@/components/sms/inbox/SmsInboxPanel'
import { SmsHubHeader } from '@/components/sms/hub/SmsHubNav'

function parsePositiveInt(raw: string | null): number | undefined {
  if (!raw) return undefined
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function SmsInboxPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const campaignId = parsePositiveInt(searchParams.get('campaign'))
  const conversationId = parsePositiveInt(searchParams.get('conversation'))

  const onCampaignIdChange = (next: number | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next == null) params.delete('campaign')
    else params.set('campaign', String(next))
    params.delete('conversation')
    const qs = params.toString()
    router.replace(qs ? `/sms/inbox?${qs}` : '/sms/inbox', { scroll: false })
  }

  return (
    <div className="space-y-4">
      <SmsHubHeader
        current="inbox"
        title="SMS inbox"
        description="Replies to platform SMS. Opens on all conversations; use the campaign menu to narrow or switch campaigns."
      />
      <SmsInboxPanel
        campaignId={campaignId}
        initialConversationId={conversationId ?? null}
        className="h-[calc(100dvh-15rem)]"
        onCampaignIdChange={onCampaignIdChange}
      />
    </div>
  )
}

export default function SmsInboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      }
    >
      <SmsInboxPageInner />
    </Suspense>
  )
}
