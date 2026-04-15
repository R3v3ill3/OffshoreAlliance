'use client'

import type { ElementType } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function CampaignDashboardStatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: ElementType
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <Card className="flex-1 min-w-[130px]">
      <CardHeader className="pb-1 pt-3 px-3">
        <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="h-3.5 w-3.5 flex-shrink-0" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <p className="text-xl font-semibold leading-none">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}
