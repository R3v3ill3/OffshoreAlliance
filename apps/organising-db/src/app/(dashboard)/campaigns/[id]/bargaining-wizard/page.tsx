'use client'

/**
 * /campaigns/[id]/bargaining-wizard
 *
 * Phase 2 entry wizard. Supports two modes via ?mode=continuation|standalone.
 *
 * Continuation (from Stage 6):
 *   BargainingTimingStep → CarryForwardStep → ClaimPackageStep → SeedPackStep → ConfirmStep
 *
 * Standalone (any time):
 *   BargainingTimingStep → EmployerBehaviourStep → WorkerSupportStep →
 *   CarryForwardStep → ClaimPackageStep → SeedPackStep → ConfirmStep
 */

import { useCallback, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, ChevronLeft, ChevronRight, Scale } from 'lucide-react'
import { BargainingTimingStep } from '@/components/campaigns/bargaining/wizard/BargainingTimingStep'
import { EmployerBehaviourStep } from '@/components/campaigns/bargaining/wizard/EmployerBehaviourStep'
import { WorkerSupportStep } from '@/components/campaigns/bargaining/wizard/WorkerSupportStep'
import { CarryForwardStep } from '@/components/campaigns/bargaining/wizard/CarryForwardStep'
import { ClaimPackageStep } from '@/components/campaigns/bargaining/wizard/ClaimPackageStep'
import { SeedPackStep } from '@/components/campaigns/bargaining/wizard/SeedPackStep'
import { ConfirmStep } from '@/components/campaigns/bargaining/wizard/ConfirmStep'
import {
  DEFAULT_WIZARD_DATA,
  type Phase2WizardData,
} from '@/components/campaigns/bargaining/wizard/Phase2WizardLaunchCard'

// ── Step definitions ────────────────────────────────────────────────────────

interface StepDef {
  key: string
  label: string
  modes: Array<'continuation' | 'standalone'>
}

const ALL_STEPS: StepDef[] = [
  { key: 'timing',           label: 'Bargaining timing',       modes: ['continuation', 'standalone'] },
  { key: 'employer',         label: 'Employer behaviour',      modes: ['continuation', 'standalone'] },
  { key: 'worker_support',   label: 'Worker support',          modes: ['continuation', 'standalone'] },
  { key: 'carry_forward',    label: 'Carry forward',           modes: ['continuation', 'standalone'] },
  { key: 'claim_package',    label: 'Claim package',           modes: ['continuation', 'standalone'] },
  { key: 'seed_pack',        label: 'PIA seed pack',           modes: ['continuation', 'standalone'] },
  { key: 'confirm',          label: 'Confirm',                 modes: ['continuation', 'standalone'] },
]

export default function BargainingWizardPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()

  const campaignId = Number(params.id as string)
  const mode = (searchParams.get('mode') === 'continuation'
    ? 'continuation'
    : 'standalone') as 'continuation' | 'standalone'

  const steps = ALL_STEPS.filter((s) => s.modes.includes(mode))

  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [wizardData, setWizardData] = useState<Phase2WizardData>(DEFAULT_WIZARD_DATA)

  const handleChange = useCallback((updates: Partial<Phase2WizardData>) => {
    setWizardData((prev) => ({ ...prev, ...updates }))
  }, [])

  const currentStep = steps[currentStepIndex]
  const totalSteps = steps.length
  const progressPct = Math.round(((currentStepIndex + 1) / totalSteps) * 100)

  function handleNext() {
    setCurrentStepIndex((i) => Math.min(totalSteps - 1, i + 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function handleBack() {
    if (currentStepIndex === 0) {
      router.push(`/campaigns/${campaignId}?tab=campaign-plan`)
    } else {
      setCurrentStepIndex((i) => Math.max(0, i - 1))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const isLastStep = currentStepIndex === totalSteps - 1

  const stepProps = { wizardData, onChange: handleChange, mode }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-semibold text-slate-900 inline-flex items-center gap-2">
            <Scale className="h-5 w-5 text-slate-700" />
            Begin Phase 2: Bargaining to Win
          </h1>
          <div className="text-sm text-slate-500">
            Step {currentStepIndex + 1} of {totalSteps} — {currentStep.label}
          </div>
        </div>
        <Progress value={progressPct} className="h-1" />

        {/* Breadcrumb pills */}
        <div className="flex flex-wrap gap-1 mt-3">
          {steps.map((s, i) => (
            <button
              key={s.key}
              onClick={() => i < currentStepIndex && setCurrentStepIndex(i)}
              disabled={i > currentStepIndex}
              className={
                'text-[10px] px-2 py-0.5 rounded ' +
                (i === currentStepIndex
                  ? 'bg-slate-900 text-white'
                  : i < currentStepIndex
                  ? 'bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed')
              }
            >
              {i + 1}. {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Step content */}
      {currentStep.key === 'timing' && (
        <BargainingTimingStep {...stepProps} />
      )}
      {currentStep.key === 'employer' && (
        <EmployerBehaviourStep {...stepProps} campaignId={campaignId} />
      )}
      {currentStep.key === 'worker_support' && (
        <WorkerSupportStep {...stepProps} campaignId={campaignId} />
      )}
      {currentStep.key === 'carry_forward' && (
        <CarryForwardStep {...stepProps} campaignId={campaignId} />
      )}
      {currentStep.key === 'claim_package' && (
        <ClaimPackageStep {...stepProps} />
      )}
      {currentStep.key === 'seed_pack' && (
        <SeedPackStep {...stepProps} />
      )}
      {currentStep.key === 'confirm' && (
        <ConfirmStep {...stepProps} campaignId={campaignId} />
      )}

      {/* Navigation (hidden on confirm step — ConfirmStep has its own button) */}
      {!isLastStep && (
        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="ghost" onClick={handleBack}>
            {currentStepIndex === 0 ? (
              <>
                <ArrowLeft className="h-4 w-4" />
                Back to campaign
              </>
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                Back
              </>
            )}
          </Button>
          <Button onClick={handleNext}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      {isLastStep && (
        <div className="flex items-center pt-4 border-t">
          <Button variant="ghost" onClick={handleBack}>
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
      )}
    </div>
  )
}
