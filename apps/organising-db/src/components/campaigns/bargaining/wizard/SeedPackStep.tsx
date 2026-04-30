'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Anchor, Briefcase } from 'lucide-react'
import type { Phase2WizardData } from './Phase2WizardLaunchCard'

interface Props {
  wizardData: Phase2WizardData
  onChange: (updates: Partial<Phase2WizardData>) => void
  mode: 'continuation' | 'standalone'
}

const OFFSHORE_ACTIONS = [
  'Work-to-rule (strict rule observance)',
  'Overtime ban',
  'Refusal of discretionary duties',
  'Selective stop-work (critical systems excluded)',
  'Full stop-work up to 4 hours',
  'Full stop-work over 4 hours',
  'Rotation ban (crew changeover refusal)',
]

const SHORE_BASED_ACTIONS = [
  'Work-to-rule (strict rule observance)',
  'Overtime ban',
  'Rostered day off ban',
  'Selective stop-work (1–2 hours)',
  'Partial work ban (specified tasks)',
  'Rolling half-day stoppages',
  'Full 24-hour stoppages',
]

interface PackOption {
  value: 'offshore_standard' | 'shore_based_standard'
  label: string
  description: string
  icon: React.ReactNode
  actions: string[]
}

const PACK_OPTIONS: PackOption[] = [
  {
    value: 'offshore_standard',
    label: 'Offshore Standard',
    description:
      'Pre-loaded escalation ladder for offshore/marine workplaces. Complies with s414 FW Act (3-day notice for offshore industrial action).',
    icon: <Anchor className="h-5 w-5" />,
    actions: OFFSHORE_ACTIONS,
  },
  {
    value: 'shore_based_standard',
    label: 'Shore-Based Standard',
    description:
      'Pre-loaded escalation ladder for onshore facilities, depots, and construction sites.',
    icon: <Briefcase className="h-5 w-5" />,
    actions: SHORE_BASED_ACTIONS,
  },
]

export function SeedPackStep({ wizardData, onChange }: Props) {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold mb-1">
            Protected Industrial Action seed pack
          </h2>
          <p className="text-xs text-slate-600">
            Select the pre-loaded action ladder that best fits this workplace.
            The seed pack creates a set of PIA action types ready to use in
            Stage 10. All actions are editable after seeding — this is just a
            starting point.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {PACK_OPTIONS.map((option) => {
            const selected = wizardData.pia_seed_pack === option.value
            return (
              <button
                key={option.value}
                onClick={() => onChange({ pia_seed_pack: option.value })}
                className={
                  'rounded-lg border-2 p-4 text-left transition-colors space-y-3 ' +
                  (selected
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50')
                }
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-700">{option.icon}</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {option.label}
                  </span>
                  {selected && (
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      Selected
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-600">{option.description}</p>
                <div>
                  <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 mb-1.5">
                    Action ladder preview
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {option.actions.map((action, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="text-[10px] font-normal"
                      >
                        {i + 1}. {action}
                      </Badge>
                    ))}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
