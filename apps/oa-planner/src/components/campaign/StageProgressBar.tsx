'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STAGE_NAMES, type StageNumber } from '@/types'
import { stageInfoBody } from '@/lib/planning/stage-narrative'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface StageProgressStage {
  stage_number: number
  status: string
}

const STAGE_COLORS = {
  active: 'bg-blue-100 border-blue-300 text-blue-900',
  completed: 'bg-green-100 border-green-300 text-green-900',
  blocked: 'bg-red-100 border-red-300 text-red-900',
  draft: 'bg-slate-50 border-slate-200 text-slate-600',
} as const

interface StageProgressBarProps {
  campaignId: number
  currentStageNumber: number
  stages: StageProgressStage[]
}

const STAGE_NUMBERS: StageNumber[] = [1, 2, 3, 4, 5, 6]

export function StageProgressBar({ campaignId, currentStageNumber, stages }: StageProgressBarProps) {
  const [infoStage, setInfoStage] = useState<StageNumber | null>(null)

  const byNum = new Map(stages.map((s) => [s.stage_number, s]))

  return (
    <>
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-6">
        <p className="text-xs font-medium text-slate-600 mb-2">Campaign stages</p>
        <div className="overflow-x-auto pb-1 -mx-1 px-1">
          <div className="flex items-stretch min-w-[640px] gap-0">
            {STAGE_NUMBERS.map((num, i) => {
              const row = byNum.get(num)
              const status = (row?.status as keyof typeof STAGE_COLORS) || 'draft'
              const stageColorClass = STAGE_COLORS[status] ?? STAGE_COLORS.draft
              const isCurrent = num === currentStageNumber
              const paragraphs = stageInfoBody(num)

              return (
                <div key={num} className="flex items-stretch flex-1 min-w-0">
                  {i > 0 && (
                    <div
                      className={cn(
                        'self-center h-px flex-1 min-w-[6px] mx-0.5',
                        byNum.get(STAGE_NUMBERS[i - 1])?.status === 'completed' ? 'bg-green-300' : 'bg-slate-200'
                      )}
                    />
                  )}
                  <div
                    className={cn(
                      'flex flex-col items-center rounded-lg border-2 flex-1 min-w-[88px] transition-shadow',
                      stageColorClass,
                      isCurrent && 'ring-2 ring-blue-500 ring-offset-1 ring-offset-slate-50'
                    )}
                  >
                    <Link
                      href={`/campaigns/${campaignId}/stage/${num}`}
                      className="flex flex-col items-center w-full px-1.5 pt-2 pb-1 text-center hover:opacity-90"
                    >
                      <div
                        className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mb-1',
                          status === 'active' ? 'bg-blue-600 text-white' :
                          status === 'completed' ? 'bg-green-600 text-white' :
                          status === 'blocked' ? 'bg-red-500 text-white' :
                          'bg-slate-300 text-slate-700'
                        )}
                      >
                        {num}
                      </div>
                      <span className="hidden sm:block text-[10px] sm:text-xs font-semibold leading-tight text-center line-clamp-2 px-0.5">
                        {STAGE_NAMES[num]}
                      </span>
                    </Link>
                    <div className="pb-1.5 flex justify-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-500 hover:text-blue-700"
                        aria-label={`About stage ${num}`}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setInfoStage(num)
                        }}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <Dialog open={infoStage !== null} onOpenChange={(open) => !open && setInfoStage(null)}>
        <DialogContent className="sm:max-w-lg">
          {infoStage !== null && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Stage {infoStage}: {STAGE_NAMES[infoStage]}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm text-slate-700 leading-relaxed pt-1">
                {(stageInfoBody(infoStage) ?? []).map((p: string, idx: number) => (
                  <p key={idx}>{p}</p>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
