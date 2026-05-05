'use client'

import type { ElementType } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function CampaignDashboardStatCard({
  icon: Icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: ElementType
  label: string
  value: string | number
  sub?: string
  /** Render with emerald OA-member styling. */
  highlight?: boolean
}) {
  return (
    <Card className={`flex-1 min-w-[130px] ${highlight ? "border-emerald-500/60 bg-emerald-50 dark:bg-emerald-950/30" : ""}`}>
      <CardHeader className="pb-1 pt-3 px-3">
        <CardTitle className={`flex items-center gap-1.5 text-xs font-medium ${highlight ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
          <Icon className="h-3.5 w-3.5 flex-shrink-0" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <p className={`text-xl font-semibold leading-none ${highlight ? "text-emerald-900 dark:text-emerald-200" : ""}`}>{value}</p>
        {sub && <p className={`text-[11px] mt-1 ${highlight ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>{sub}</p>}
      </CardContent>
    </Card>
  )
}
