'use client'

import { createContext, useContext } from 'react'
import type { SectionPlanRow } from '@/types/section-planning'

interface SectionPlanContextValue {
  sectionPlan: SectionPlanRow
  campaignId: number
}

const Ctx = createContext<SectionPlanContextValue | null>(null)

export function SectionPlanProvider({
  sectionPlan,
  children,
}: {
  sectionPlan: SectionPlanRow
  children: React.ReactNode
}) {
  return (
    <Ctx.Provider value={{ sectionPlan, campaignId: sectionPlan.campaign_id }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSectionPlanContext(): SectionPlanContextValue {
  const v = useContext(Ctx)
  if (!v) {
    throw new Error('useSectionPlanContext must be used within SectionPlanProvider')
  }
  return v
}
