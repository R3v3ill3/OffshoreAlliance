'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  STAGE_NAMES,
  type StageNumber,
} from '@/types'
import {
  STAGE_HEADER_BLURB,
  STAGE_INFO_BODY,
  STEP_NAMES,
  STEP_HEADER_BLURB,
  STEP_INFO_BODY,
  type StepId,
} from '@/lib/planning/stage-narrative'
import { BookOpen } from 'lucide-react'

interface OverviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STAGE_NUMBERS: StageNumber[] = [1, 2, 3, 4, 5, 6]
const STEP_IDS: StepId[] = ['ambitions', 'where-to-play', 'theory', 'capacities', 'management']

export function OverviewDialog({ open, onOpenChange }: OverviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <BookOpen className="h-5 w-5 text-blue-600" />
            Campaign Planning Overview
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-8 mt-4">
          <section>
            <h3 className="text-lg font-semibold border-b pb-2 mb-4 text-slate-800">
              The 6 Campaign Stages
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Our campaigning framework moves through six distinct phases. At each stage, specific goals must be met before advancing. Expand a stage below to see its purpose in detail.
            </p>
            <Accordion type="single" collapsible className="w-full">
              {STAGE_NUMBERS.map((num) => (
                <AccordionItem key={`stage-${num}`} value={`stage-${num}`}>
                  <AccordionTrigger className="text-left py-3 hover:bg-slate-50 px-2 rounded-sm transition-colors">
                    <div className="flex flex-col">
                      <span className="font-semibold text-blue-900">
                        Stage {num}: {STAGE_NAMES[num]}
                      </span>
                      <span className="text-sm text-slate-500 font-normal mt-0.5">
                        {STAGE_HEADER_BLURB[num]}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-2 pt-2 pb-4 text-slate-700 space-y-3 leading-relaxed">
                    {STAGE_INFO_BODY[num].map((paragraph, i) => (
                      <p key={i}>{paragraph}</p>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>

          <section>
            <h3 className="text-lg font-semibold border-b pb-2 mb-4 text-slate-800">
              The Playing to Win Strategy Steps
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Within each stage, we build our strategy using five core steps. Expand each step below to learn how they connect to form a cohesive campaign plan.
            </p>
            <Accordion type="single" collapsible className="w-full">
              {STEP_IDS.map((stepId) => (
                <AccordionItem key={`step-${stepId}`} value={`step-${stepId}`}>
                  <AccordionTrigger className="text-left py-3 hover:bg-slate-50 px-2 rounded-sm transition-colors">
                    <div className="flex flex-col">
                      <span className="font-semibold text-emerald-900">
                        {STEP_NAMES[stepId]}
                      </span>
                      <span className="text-sm text-slate-500 font-normal mt-0.5">
                        {STEP_HEADER_BLURB[stepId]}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-2 pt-2 pb-4 text-slate-700 space-y-3 leading-relaxed">
                    {STEP_INFO_BODY[stepId].map((paragraph, i) => (
                      <p key={i}>{paragraph}</p>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}