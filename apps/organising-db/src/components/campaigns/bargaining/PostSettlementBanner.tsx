'use client'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface PostSettlementBannerProps {
  campaignId: number
  campaignName: string
}

export function PostSettlementBanner({ campaignId, campaignName }: PostSettlementBannerProps) {
  return (
    <div className="rounded-lg border border-green-300 bg-green-50 p-4 flex items-start gap-3">
      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-green-900">Agreement reached — post-settlement</p>
        <p className="text-sm text-green-700 mt-0.5">
          {campaignName} has successfully concluded bargaining. The EBA has been endorsed by members.
        </p>
        <Button asChild variant="link" size="sm" className="p-0 h-auto text-green-700 text-xs mt-2">
          <Link href={`/campaigns/${campaignId}`}>
            Return to campaign overview
          </Link>
        </Button>
      </div>
    </div>
  )
}
