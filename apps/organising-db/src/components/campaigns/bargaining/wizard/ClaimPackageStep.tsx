'use client'

import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { FileText } from 'lucide-react'
import type { Phase2WizardData } from './Phase2WizardLaunchCard'

interface Props {
  wizardData: Phase2WizardData
  onChange: (updates: Partial<Phase2WizardData>) => void
  mode: 'continuation' | 'standalone'
}

export function ClaimPackageStep({ wizardData, onChange }: Props) {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold">Claim package summary</h2>
        </div>
        <p className="text-xs text-slate-600">
          Briefly describe the union&apos;s claim package — what the members
          are bargaining for. This is used as context in Theory of Winning and
          coaching prompts throughout Phase 2. A detailed log-of-claims can be
          managed separately.
        </p>
        <div className="space-y-2">
          <Label htmlFor="claim_summary">Claim summary</Label>
          <Textarea
            id="claim_summary"
            value={wizardData.claim_summary}
            onChange={(e) => onChange({ claim_summary: e.target.value })}
            rows={6}
            placeholder="e.g. 5% pay rise, roster flexibility, meal allowance increase, enhanced leave entitlements, health and safety consultation rights…"
          />
        </div>
      </CardContent>
    </Card>
  )
}
