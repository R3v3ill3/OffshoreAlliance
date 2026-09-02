'use client'

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { SmsCreateActionPage } from '@/components/sms/hub/SmsCreateActionPage'

export default function SmsCreateActionRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      }
    >
      <SmsCreateActionPage />
    </Suspense>
  )
}
