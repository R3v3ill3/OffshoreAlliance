'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { STAGE_NAMES } from '@/types'
import {
  useSyncAmbitionTargetDatesForCampaign,
  useUpdateCampaignStagePlans,
} from '@/lib/hooks/useCampaigns'
import { toast } from 'sonner'

type StageRow = {
  plan_id: number
  stage_number: number
  planned_start_date: string | null
  planned_end_date: string | null
}

export function CampaignStageDatesEditor({
  campaignId,
  stages,
}: {
  campaignId: number
  stages: StageRow[]
}) {
  const [draft, setDraft] = useState<
    Array<{ plan_id: number; start: string; end: string }>
  >([])
  const updateMutation = useUpdateCampaignStagePlans()
  const syncMutation = useSyncAmbitionTargetDatesForCampaign()

  useEffect(() => {
    setDraft(
      stages.map((s) => ({
        plan_id: s.plan_id,
        start: s.planned_start_date ?? '',
        end: s.planned_end_date ?? '',
      }))
    )
  }, [stages])

  function setRow(planId: number, field: 'start' | 'end', value: string) {
    setDraft((d) =>
      d.map((r) => (r.plan_id === planId ? { ...r, [field]: value } : r))
    )
  }

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        campaign_id: campaignId,
        updates: draft.map((r) => ({
          plan_id: r.plan_id,
          planned_start_date: r.start.trim() || null,
          planned_end_date: r.end.trim() || null,
        })),
      })
      toast.success(
        'Stage dates saved. Ambition target dates were synced where not manually overridden.'
      )
    } catch {
      toast.error('Could not save stage dates')
    }
  }

  async function handleSyncOnly() {
    try {
      await syncMutation.mutateAsync(campaignId)
      toast.success(
        'Ambition target dates updated from each stage planned end date.'
      )
    } catch {
      toast.error('Could not sync ambition dates')
    }
  }

  if (!stages.length) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSyncOnly}
          disabled={syncMutation.isPending}
        >
          Sync ambition deadlines from stages
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={updateMutation.isPending}
        >
          Save dates
        </Button>
      </div>
      <div className="space-y-3">
        {draft.map((r) => {
          const stage = stages.find((s) => s.plan_id === r.plan_id)
          const sn = stage?.stage_number ?? 0
          return (
            <div
              key={r.plan_id}
              className="grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_1fr_1fr] items-end border-b pb-3 last:border-0"
            >
              <div>
                <p className="text-sm font-medium">Stage {sn}</p>
                <p className="text-xs text-muted-foreground">
                  {STAGE_NAMES[sn as keyof typeof STAGE_NAMES]}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Planned start</Label>
                <Input
                  type="date"
                  value={r.start}
                  onChange={(e) => setRow(r.plan_id, 'start', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Planned end</Label>
                <Input
                  type="date"
                  value={r.end}
                  onChange={(e) => setRow(r.plan_id, 'end', e.target.value)}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
