'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar } from 'lucide-react'
import type { Phase2WizardData } from './Phase2WizardLaunchCard'

interface Props {
  wizardData: Phase2WizardData
  onChange: (updates: Partial<Phase2WizardData>) => void
  mode: 'continuation' | 'standalone'
}

export function BargainingTimingStep({ wizardData, onChange }: Props) {
  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold">Bargaining timing</h2>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bargaining_commenced_at">
            Bargaining commenced date <span className="text-red-500">*</span>
          </Label>
          <Input
            id="bargaining_commenced_at"
            type="date"
            value={wizardData.bargaining_commenced_at}
            onChange={(e) =>
              onChange({ bargaining_commenced_at: e.target.value })
            }
          />
          <p className="text-xs text-slate-500">
            The date formal bargaining commenced — used to calculate the
            intractable clock (90 days to NERR eligibility).
          </p>
        </div>

        <div className="space-y-2">
          <Label>NERR status</Label>
          <Select
            value={wizardData.nerr_status}
            onValueChange={(v) =>
              onChange({
                nerr_status: v as Phase2WizardData['nerr_status'],
                nerr_issued_at:
                  v !== 'issued' ? '' : wizardData.nerr_issued_at,
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_issued">Not yet issued</SelectItem>
              <SelectItem value="issued">Issued</SelectItem>
              <SelectItem value="superseded">Superseded</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500">
            Notice of Employee Representational Rights. Employers must issue a
            NERR within 14 days of starting bargaining.
          </p>
        </div>

        {wizardData.nerr_status === 'issued' && (
          <div className="space-y-2">
            <Label htmlFor="nerr_issued_at">NERR issued date</Label>
            <Input
              id="nerr_issued_at"
              type="date"
              value={wizardData.nerr_issued_at}
              onChange={(e) => onChange({ nerr_issued_at: e.target.value })}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
