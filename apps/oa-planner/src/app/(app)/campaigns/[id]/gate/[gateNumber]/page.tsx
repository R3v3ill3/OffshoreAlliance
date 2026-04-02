'use client'

import { useGateAssessment, usePlanAmbitionsForGate } from '@/lib/hooks/useGateAssessment'
import { GateAssessmentComponent } from '@/components/gates/GateAssessment'
import { GateAmbitionAssessment } from '@/components/gates/GateAmbitionAssessment'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

interface PageProps {
  params: { id: string; gateNumber: string }
}

export default function GatePage({ params }: PageProps) {
  const { id, gateNumber: gateNumStr } = params
  const campaignId = parseInt(id)
  const gateNumber = parseInt(gateNumStr)

  const { data: gate, isLoading } = useGateAssessment(campaignId, gateNumber)
  const { data: ambitions, isLoading: ambitionsLoading } = usePlanAmbitionsForGate(campaignId, gateNumber)

  if (isLoading || ambitionsLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4 max-w-2xl mx-auto">
          <div className="h-8 bg-slate-200 rounded w-64" />
          <div className="h-32 bg-slate-200 rounded" />
          <div className="h-32 bg-slate-200 rounded" />
          <div className="h-32 bg-slate-200 rounded" />
        </div>
      </div>
    )
  }

  if (!gate) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-500">Gate not found</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href={`/campaigns/${campaignId}`}>Back to Campaign</Link>
        </Button>
      </div>
    )
  }

  const criteria = (gate as { gate_criteria?: unknown[] }).gate_criteria || []
  const useAmbitionMode = (ambitions?.length ?? 0) > 0

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/campaigns" className="hover:text-foreground">Campaigns</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/campaigns/${campaignId}`} className="hover:text-foreground">Campaign</Link>
        <ChevronRight className="h-3 w-3" />
        <span>Gate {gateNumber}</span>
      </div>

      {useAmbitionMode ? (
        <GateAmbitionAssessment
          gate={gate as any}
          ambitions={ambitions as any}
          campaignId={campaignId}
          canAssess={true}
        />
      ) : criteria.length > 0 ? (
        <GateAssessmentComponent gate={gate as any} campaignId={campaignId} canAssess={true} />
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">No ambitions or legacy criteria for this gate</p>
          <p className="mt-1 text-amber-800">
            Add ambitions on{' '}
            <Link href={`/campaigns/${campaignId}/stage/${gateNumber}`} className="underline font-medium">
              Stage {gateNumber}
            </Link>{' '}
            to assess this gate.
          </p>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <Button asChild variant="outline">
          <Link href={`/campaigns/${campaignId}/stage/${gateNumber}`}>
            Back to Stage {gateNumber}
          </Link>
        </Button>
        {gateNumber < 5 && (
          <Button asChild variant="outline">
            <Link href={`/campaigns/${campaignId}/stage/${gateNumber + 1}`}>
              Stage {gateNumber + 1} Plan
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}
