'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import {
  PhoneCall, PhoneOff, Voicemail, PhoneMissed,
  AlertCircle, Ban, Clock,
} from 'lucide-react'
import { DIAL_DISPOSITIONS } from '@/lib/phone/disposition-types'
import type { DialDisposition } from '@/types/planner-types'

const ICONS: Record<string, React.ReactNode> = {
  PhoneCall: <PhoneCall className="h-5 w-5" />,
  PhoneOff: <PhoneOff className="h-5 w-5" />,
  Voicemail: <Voicemail className="h-5 w-5" />,
  PhoneMissed: <PhoneMissed className="h-5 w-5" />,
  AlertCircle: <AlertCircle className="h-5 w-5" />,
  Ban: <Ban className="h-5 w-5" />,
  Clock: <Clock className="h-5 w-5" />,
}

interface DialOutcomeBarProps {
  onSelect: (disposition: DialDisposition) => void
}

export function DialOutcomeBar({ onSelect }: DialOutcomeBarProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">What happened when you dialed?</p>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
        {DIAL_DISPOSITIONS.map((d) => (
          <Button
            key={d.value}
            variant="outline"
            className={cn(
              'h-auto py-3 px-2 flex flex-col items-center gap-1.5',
              d.value === 'connected' && 'border-green-300 hover:bg-green-50',
              d.value === 'do_not_call' && 'border-red-300 hover:bg-red-50',
            )}
            onClick={() => onSelect(d.value)}
          >
            <span className={cn('p-1.5 rounded-md', d.color)}>
              {ICONS[d.icon] || ICONS.PhoneOff}
            </span>
            <span className="text-xs text-center leading-tight">{d.label}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}
