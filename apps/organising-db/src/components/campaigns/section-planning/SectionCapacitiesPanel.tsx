'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, ArrowDown } from 'lucide-react'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useAuth } from '@/lib/supabase/auth-context'
import {
  useCapacityOptions,
  useCreateSectionCapacity,
  useDeleteSectionCapacity,
  useSectionCapacities,
  useUpdateSectionCapacity,
  type SectionCapacityRow,
} from '@/lib/hooks/useSectionWtpAndCapacities'
import { useSectionAmbitions } from '@/lib/hooks/useSectionAmbitions'

const STATUS_LABELS: Record<string, string> = {
  needed: 'Needed',
  available: 'Available',
  gap: 'Gap',
  in_progress: 'In progress',
}
const STATUS_VARIANTS: Record<string, 'secondary' | 'success' | 'warning' | 'info'> = {
  needed: 'secondary',
  available: 'success',
  gap: 'warning',
  in_progress: 'info',
}

interface FormState {
  open: boolean
  edit?: SectionCapacityRow
  capacity_option_id: string
  custom_text: string
  status: string
  gap_description: string
  resolution_plan: string
  resolution_date: string
  linked_ambition_id: string
}

const EMPTY_FORM: FormState = {
  open: false,
  capacity_option_id: '',
  custom_text: '',
  status: 'available',
  gap_description: '',
  resolution_plan: '',
  resolution_date: '',
  linked_ambition_id: '',
}

export function SectionCapacitiesPanel({ sectionPlanId }: { sectionPlanId: number }) {
  const { canWrite } = useAuth()
  const { data: rows = [], isLoading } = useSectionCapacities(sectionPlanId)
  const { data: options = [] } = useCapacityOptions()
  const { data: ambitions = [] } = useSectionAmbitions(sectionPlanId)
  const create = useCreateSectionCapacity()
  const update = useUpdateSectionCapacity()
  const remove = useDeleteSectionCapacity()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const ambitionsById = useMemo(() => {
    const m = new Map<number, string>()
    for (const a of ambitions) m.set(a.ambition_id, a.custom_text ?? '(no label)')
    return m
  }, [ambitions])

  const optionsByCategory = useMemo(() => {
    const groups: Record<string, typeof options> = {}
    for (const o of options) (groups[o.category] ??= []).push(o)
    return groups
  }, [options])

  const openAdd = () => setForm({ ...EMPTY_FORM, open: true })
  const openEdit = (r: SectionCapacityRow) =>
    setForm({
      open: true,
      edit: r,
      capacity_option_id: r.capacity_option_id ? String(r.capacity_option_id) : '',
      custom_text: r.custom_text ?? '',
      status: r.status ?? 'available',
      gap_description: r.gap_description ?? '',
      resolution_plan: r.resolution_plan ?? '',
      resolution_date: r.resolution_date ?? '',
      linked_ambition_id: r.linked_ambition_id ? String(r.linked_ambition_id) : '',
    })
  const close = () => setForm(EMPTY_FORM)

  const submit = async () => {
    if (!form.capacity_option_id && !form.custom_text.trim()) return
    const base = {
      section_plan_id: sectionPlanId,
      status: form.status,
      gap_description: form.gap_description || null,
      resolution_plan: form.resolution_plan || null,
      resolution_date: form.resolution_date || null,
      linked_ambition_id: form.linked_ambition_id ? Number(form.linked_ambition_id) : null,
      custom_text: form.capacity_option_id ? null : form.custom_text || null,
    }
    if (form.edit) {
      await update.mutateAsync({ ...base, capacity_id: form.edit.capacity_id })
    } else {
      await create.mutateAsync({
        ...base,
        capacity_option_id: form.capacity_option_id ? Number(form.capacity_option_id) : null,
      })
    }
    close()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">Capacities</CardTitle>
            <CardDescription>
              Tools, skills, and platforms available (or needed) for this
              period. Maps to the Field Plan Template's Capacities checklist.
              Mark gaps with a resolution plan.
            </CardDescription>
          </div>
          {canWrite && (
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add capacity
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">
            No capacities listed yet.
          </p>
        )}
        {rows.length > 0 && (
          <ul className="space-y-2">
            {rows.map((r) => {
              const label = r.option?.option_text ?? r.custom_text ?? '(no label)'
              const linked = r.linked_ambition_id
                ? ambitionsById.get(r.linked_ambition_id) ?? null
                : null
              return (
                <li key={r.capacity_id} className="rounded-md border p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {r.status && (
                          <Badge variant={STATUS_VARIANTS[r.status] ?? 'secondary'}>
                            {STATUS_LABELS[r.status] ?? r.status}
                          </Badge>
                        )}
                        {r.option?.category && (
                          <span className="text-xs text-muted-foreground">
                            {r.option.category}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium">{label}</p>
                      {r.gap_description && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Gap: {r.gap_description}
                        </p>
                      )}
                      {r.resolution_plan && (
                        <p className="text-xs text-muted-foreground">
                          Plan: {r.resolution_plan}
                          {r.resolution_date ? ` (by ${r.resolution_date})` : ''}
                        </p>
                      )}
                      {linked && (
                        <p className="text-xs">
                          <ArrowDown className="h-3 w-3 inline" /> Supports{' '}
                          <span className="font-medium">{linked}</span>
                        </p>
                      )}
                    </div>
                    {canWrite && (
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(r)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove capacity?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Removes the row from this section plan.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  remove.mutate({
                                    capacity_id: r.capacity_id,
                                    section_plan_id: sectionPlanId,
                                  })
                                }
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={form.open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.edit ? 'Edit capacity' : 'New capacity'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Capacity option (optional)</Label>
              <Select
                value={form.capacity_option_id || 'none'}
                onValueChange={(v) =>
                  setForm({ ...form, capacity_option_id: v === 'none' ? '' : v })
                }
                disabled={!!form.edit}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick an option or use custom" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Custom —</SelectItem>
                  {Object.entries(optionsByCategory).map(([cat, opts]) => (
                    <div key={cat}>
                      <div className="px-2 py-1 text-xs uppercase text-muted-foreground">
                        {cat}
                      </div>
                      {opts.map((o) => (
                        <SelectItem key={o.option_id} value={String(o.option_id)}>
                          {o.option_text}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!form.capacity_option_id && (
              <div className="space-y-1">
                <Label htmlFor="cap-custom">Custom capacity</Label>
                <Input
                  id="cap-custom"
                  value={form.custom_text}
                  onChange={(e) => setForm({ ...form, custom_text: e.target.value })}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, l]) => (
                      <SelectItem key={k} value={k}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Supports ambition</Label>
                <Select
                  value={form.linked_ambition_id || 'none'}
                  onValueChange={(v) =>
                    setForm({ ...form, linked_ambition_id: v === 'none' ? '' : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {ambitions.map((a) => (
                      <SelectItem key={a.ambition_id} value={String(a.ambition_id)}>
                        {a.custom_text ?? '(no label)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(form.status === 'gap' || form.status === 'in_progress') && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="cap-gap">Gap description</Label>
                  <Textarea
                    id="cap-gap"
                    rows={2}
                    value={form.gap_description}
                    onChange={(e) => setForm({ ...form, gap_description: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cap-plan">Resolution plan</Label>
                  <Textarea
                    id="cap-plan"
                    rows={2}
                    value={form.resolution_plan}
                    onChange={(e) => setForm({ ...form, resolution_plan: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cap-date">Resolution date</Label>
                  <Input
                    id="cap-date"
                    type="date"
                    value={form.resolution_date}
                    onChange={(e) => setForm({ ...form, resolution_date: e.target.value })}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
