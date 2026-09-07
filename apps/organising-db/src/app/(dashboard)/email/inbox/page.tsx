'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Inbox, Loader2 } from 'lucide-react'
import { EmailInboxPanel } from '@/components/email/inbox/EmailInboxPanel'

function parsePositiveInt(raw: string | null): number | undefined {
  if (!raw) return undefined
  const number = parseInt(raw, 10)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function EmailInboxPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const campaignId = parsePositiveInt(searchParams.get('campaign'))
  const conversationId = parsePositiveInt(searchParams.get('conversation'))

  const replaceParams = (
    campaign: number | null | undefined,
    conversation: number | null | undefined,
  ) => {
    const params = new URLSearchParams(searchParams.toString())
    if (campaign === null) params.delete('campaign')
    else if (campaign !== undefined) params.set('campaign', String(campaign))
    if (conversation === null) params.delete('conversation')
    else if (conversation !== undefined) {
      params.set('conversation', String(conversation))
    }
    const query = params.toString()
    router.replace(query ? `/email/inbox?${query}` : '/email/inbox', {
      scroll: false,
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Inbox className="h-6 w-6" />
          Email inbox
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Campaign replies, organisation-wide email, triage and team assignments
          in one work queue.
        </p>
      </div>
      <EmailInboxPanel
              campaignId={campaignId ?? null}
        initialConversationId={conversationId ?? null}
        className="h-[calc(100dvh-12rem)]"
        onCampaignIdChange={(next) => replaceParams(next, null)}
        onConversationIdChange={(next) => replaceParams(undefined, next)}
      />
    </div>
  )
}

export default function EmailInboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      }
    >
      <EmailInboxPageInner />
    </Suspense>
  )
}
