'use client'

import { useMemo, useState } from 'react'
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfDay,
} from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/lib/supabase/auth-context'
import { useSectionPlan } from '@/lib/hooks/useSectionPlans'
import { useSectionActivities } from '@/lib/hooks/useSectionActivities'
import {
  useDeleteWorkplanTarget,
  useSectionWorkplan,
  useUpsertWorkplanTarget,
  type WorkplanRow,
} from '@/lib/hooks/useSectionWorkplan'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface FormState {
  open: boolean
  target?: WorkplanRow
  date: string
  activity_id: string
  activity_label: string
  calls_target: string
  notes: string
}

const EMPTY_FORM: FormState = {
  open: false,
  date: '',
  activity_id: '',
  activity_label: '',
  calls_target: '',
  notes: '',
}

export function SectionWorkplanGrid({ sectionPlanId }: { sectionPlanId: number }) {
  const { canWrite } = useAuth()
  const { data: plan } = useSectionPlan(sectionPlanId)
  const { data: rows = [], isLoading } = useSectionWorkplan(sectionPlanId)
  const { data: activities = [] } = useSectionActivities(sectionPlanId)
  const upsert = useUpsertWorkplanTarget()
  const remove = useDeleteWorkplanTarget()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const days = useMemo(() => {
    if (!plan) return [] as Array<{ date: string; dow: number; label: string }>
    const start = startOfDay(parseISO(plan.start_date))
    const end = startOfDay(parseISO(plan.end_date))
    const totalDays = Math.min(differenceInCalendarDays(end, start) + 1, 14)
    const out: Array<{ date: string; dow: number; label: string }> = []
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(start, i)
      out.push({
        date: format(d, 'yyyy-MM-dd'),
        dow: d.getDay(),
        label: format(d, 'EEE dd MMM'),
      })
    }
    return out
  }, [plan])

  const rowsByDate = useMemo(() => {
    const m: Record<string, WorkplanRow[]> = {}
    for (const r of rows) (m[r.target_date] ??= []).push(r)
    return m
  }, [rows])

  const openAdd = (date: string) => {
    setForm({ ...EMPTY_FORM, open: true, date })
  }

  const openEdit = (r: WorkplanRow) => {
    setForm({
      open: true,
      target: r,
      date: r.target_date,
      activity_id: r.activity_id ? String(r.activity_id) : '',
      activity_label: r.activity_label ?? '',
      calls_target: r.calls_target != null ? String(r.calls_target) : '',
      notes: r.notes ?? '',
    })
  }

  const close = () => setForm(EMPTY_FORM)

  const submit = async () => {
    const date = form.date
    if (!date) return
    const dow = parseISO(date).getDay()
    await upsert.mutateAsync({
      target_id: form.target?.target_id,
      section_plan_id: sectionPlanId,
      day_of_week: dow,
      target_date: date,
      activity_id: form.activity_id ? Number(form.activity_id) : null,
      activity_label: form.activity_label.trim() || null,
      calls_target: form.calls_target ? Number(form.calls_target) : null,
      notes: form.notes.trim() || null,
    })
    close()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Workplan</CardTitle>
        <CardDescription>
          Day-by-day Activity / Calls Target / Completed / Outcomes grid for
          this section's date range. Mirrors the Field Plan Template's Workplan
          table; "Completed" is read directly from concluded activity events.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {!isLoading && days.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Section plan dates are not loaded yet.
          </p>
        )}
        {days.length > 0 && (
          <div className="space-y-3">
            {days.map((d) => {
              const dayRows = rowsByDate[d.date] ?? []
              return (
                <div key={d.date} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="info">{DAY_LABELS[d.dow]}</Badge>
                      <span className="text-sm font-medium">{d.label}</span>
                    </div>
                    {canWrite && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openAdd(d.date)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add
                      </Button>
                    )}
                  </div>
                  {dayRows.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">
                      No targets.
                    </p>
                  ) : (
                    <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground border-b pb-1">
                      <div className="col-span-5">Activity</div>
                      <div className="col-span-2 text-right">Target</div>
                      <div className="col-span-2 text-right">Completed</div>
                      <div className="col-span-3">Outcomes / Notes</div>
                    </div>
                  )}
                  {dayRows.map((r) => (
                    <div
                      key={r.target_id}
                      className="grid grid-cols-12 gap-2 text-sm items-start py-1.5 hover:bg-muted/40 rounded"
                    >
                      <div className="col-span-5 min-w-0">
                        <div className="font-medium truncate">
                          {r.activity_title ?? r.activity_label}
                        </div>
                        {r.activity_kind && (
                          <Badge variant="secondary" className="text-[10px] mt-0.5">
                            {r.activity_kind}
                          </Badge>
                        )}
                      </div>
                      <div className="col-span-2 text-right tabular-nums">
                        {r.calls_target ?? '—'}
                      </div>
                      <div className="col-span-2 text-right tabular-nums">
                        {r.completed_count ?? '—'}
                        {r.calls_target && r.completed_count != null && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({Math.round((r.completed_count / r.calls_target) * 100)}%)
                          </span>
                        )}
                      </div>
                      <div className="col-span-3 text-xs">
                        {r.outcomes_summary && (
                          <div className="text-muted-foreground">
                            {r.outcomes_summary}
                          </div>
                        )}
                        {r.notes && <div>{r.notes}</div>}
                        {canWrite && (
                          <div className="flex gap-1 mt-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => openEdit(r)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              onClick={() =>
                                remove.mutate({
                                  target_id: r.target_id,
                                  section_plan_id: sectionPlanId,
                                })
                              }
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={form.open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {form.target ? 'Edit target' : 'New target'} —{' '}
              {form.date && format(parseISO(form.date), 'EEE dd MMM')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Linked activity (optional)</Label>
              <Select
                value={form.activity_id || 'none'}
                onValueChange={(v) =>
                  setForm({ ...form, activity_id: v === 'none' ? '' : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick an activity or use a label" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Custom label —</SelectItem>
                  {activities.map((a) => (
                    <SelectItem key={a.activity_id} value={String(a.activity_id)}>
                      {a.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!form.activity_id && (
              <div className="space-y-1">
                <Label htmlFor="wp-label">Activity label</Label>
                <Input
                  id="wp-label"
                  value={form.activity_label}
                  onChange={(e) => setForm({ ...form, activity_label: e.target.value })}
                  placeholder="e.g. Wheatstone phone wave"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="wp-target">Calls target</Label>
              <Input
                id="wp-target"
                type="number"
                value={form.calls_target}
                onChange={(e) => setForm({ ...form, calls_target: e.target.value })}
                placeholder="e.g. 30"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wp-notes">Notes</Label>
              <Textarea
                id="wp-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={
                upsert.isPending ||
                (!form.activity_id && !form.activity_label.trim())
              }
            >
              {upsert.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
