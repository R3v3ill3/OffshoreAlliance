'use client'

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { SmsHubPage } from '@/components/sms/hub/SmsHubPage'

export default function SmsHubRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      }
    >
      <SmsHubPage />
    </Suspense>
  )
}
