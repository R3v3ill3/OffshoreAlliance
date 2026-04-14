'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DateInput } from '@/components/ui/date-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Clock } from 'lucide-react'

interface CallbackSchedulerProps {
  open: boolean
  onClose: () => void
  onSchedule: (datetime: string) => void
}

const TIME_OPTIONS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00',
]

const QUICK_OPTIONS = [
  { label: 'Tomorrow morning', offset: () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    return d
  }},
  { label: 'Tomorrow afternoon', offset: () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(14, 0, 0, 0)
    return d
  }},
  { label: 'In 2 days', offset: () => {
    const d = new Date()
    d.setDate(d.getDate() + 2)
    d.setHours(10, 0, 0, 0)
    return d
  }},
  { label: 'Next week', offset: () => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    d.setHours(10, 0, 0, 0)
    return d
  }},
]

export function CallbackScheduler({ open, onClose, onSchedule }: CallbackSchedulerProps) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('10:00')

  const handleQuickSelect = (getDate: () => Date) => {
    const d = getDate()
    onSchedule(d.toISOString())
    setDate('')
    setTime('10:00')
  }

  const handleCustomSchedule = () => {
    if (!date) return
    const [year, month, day] = date.split('-').map(Number)
    const [hours, minutes] = time.split(':').map(Number)
    const d = new Date(year, month - 1, day, hours, minutes)
    onSchedule(d.toISOString())
    setDate('')
    setTime('10:00')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Schedule Callback
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Quick options:</p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_OPTIONS.map((opt) => (
                <Button
                  key={opt.label}
                  variant="outline" size="sm"
                  onClick={() => handleQuickSelect(opt.offset)}
                  className="text-xs"
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground mb-2">Or pick a specific time:</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <DateInput
                  value={date}
                  onChange={(iso) => setDate(iso)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Time</Label>
                <Select value={time} onValueChange={setTime}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCustomSchedule} disabled={!date}>
            Schedule Callback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
