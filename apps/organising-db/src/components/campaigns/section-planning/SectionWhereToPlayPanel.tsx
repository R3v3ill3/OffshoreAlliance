'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2, ArrowDown, Pencil } from 'lucide-react'
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
  DialogDescription,
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
import { Switch } from '@/components/ui/switch'
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
  useCreateSectionWtp,
  useDeleteSectionWtp,
  useSectionWtp,
  useUpdateSectionWtp,
  useWtpCategories,
  useWtpOptions,
  type SectionWtpRow,
} from '@/lib/hooks/useSectionWtpAndCapacities'
import { useSectionAmbitions } from '@/lib/hooks/useSectionAmbitions'

interface PriorityCardProps {
  row: SectionWtpRow
  ambitionLabel: string | null
  onEdit: () => void
  onDelete: () => void
  canWrite: boolean
}

function PriorityCard({ row, ambitionLabel, onEdit, onDelete, canWrite }: PriorityCardProps) {
  const label = row.option?.option_text ?? row.custom_text ?? '(no label)'
  return (
    <li className="rounded-md border p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {row.priority != null && (
              <Badge variant="info">Priority {row.priority}</Badge>
            )}
            {row.is_exclusion && <Badge variant="destructive">Exclude</Badge>}
            <span className="text-xs text-muted-foreground">
              {row.category?.category_name}
            </span>
          </div>
          <p className="text-sm font-medium">{label}</p>
          {row.rationale && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{row.rationale}</p>
          )}
          {ambitionLabel && (
            <p className="text-xs">
              <ArrowDown className="h-3 w-3 inline" /> Supports{' '}
              <span className="font-medium">{ambitionLabel}</span>
            </p>
          )}
        </div>
        {canWrite && (
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
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
                  <AlertDialogTitle>Remove this where-to-play row?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the priority cohort from the section plan.
                    No worker data is affected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>Remove</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </li>
  )
}

interface FormState {
  open: boolean
  edit?: SectionWtpRow
  category_id: string
  option_id: string
  custom_text: string
  rationale: string
  is_exclusion: boolean
  priority: string
  linked_ambition_id: string
}

const EMPTY_FORM: FormState = {
  open: false,
  category_id: '',
  option_id: '',
  custom_text: '',
  rationale: '',
  is_exclusion: false,
  priority: '',
  linked_ambition_id: '',
}

export function SectionWhereToPlayPanel({ sectionPlanId }: { sectionPlanId: number }) {
  const { canWrite } = useAuth()
  const { data: rows = [], isLoading } = useSectionWtp(sectionPlanId)
  const { data: categories = [] } = useWtpCategories()
  const { data: ambitions = [] } = useSectionAmbitions(sectionPlanId)
  const create = useCreateSectionWtp()
  const update = useUpdateSectionWtp()
  const remove = useDeleteSectionWtp()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const { data: options = [] } = useWtpOptions(
    form.category_id ? Number(form.category_id) : null,
  )

  const ambitionsById = useMemo(() => {
    const m = new Map<number, string>()
    for (const a of ambitions) m.set(a.ambition_id, a.custom_text ?? '(no label)')
    return m
  }, [ambitions])

  const openAdd = () => setForm({ ...EMPTY_FORM, open: true })
  const openEdit = (row: SectionWtpRow) =>
    setForm({
      open: true,
      edit: row,
      category_id: String(row.wtp_category_id),
      option_id: row.wtp_option_id ? String(row.wtp_option_id) : '',
      custom_text: row.custom_text ?? '',
      rationale: row.rationale ?? '',
      is_exclusion: !!row.is_exclusion,
      priority: row.priority != null ? String(row.priority) : '',
      linked_ambition_id: row.linked_ambition_id ? String(row.linked_ambition_id) : '',
    })
  const close = () => setForm(EMPTY_FORM)

  const submit = async () => {
    if (!form.category_id) return
    const base = {
      section_plan_id: sectionPlanId,
      rationale: form.rationale || null,
      is_exclusion: form.is_exclusion,
      priority: form.priority ? Number(form.priority) : null,
      linked_ambition_id: form.linked_ambition_id ? Number(form.linked_ambition_id) : null,
      custom_text: form.option_id ? null : (form.custom_text || null),
    }
    if (form.edit) {
      await update.mutateAsync({
        ...base,
        wtp_id: form.edit.wtp_id,
      })
    } else {
      await create.mutateAsync({
        ...base,
        wtp_category_id: Number(form.category_id),
        wtp_option_id: form.option_id ? Number(form.option_id) : null,
      })
    }
    close()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">Where to Play</CardTitle>
            <CardDescription>
              Priority cohorts and tactics for this period. Templated as the
              Field Plan Template&apos;s Contact Strategy: rank by priority, link
              each row to the ambition it supports.
            </CardDescription>
          </div>
          {canWrite && (
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add row
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">
            No where-to-play rows yet. Add a priority cohort (e.g. &ldquo;All
            members at Wheatstone&rdquo;) and link it to an ambition.
          </p>
        )}
        {rows.length > 0 && (
          <ul className="space-y-2">
            {rows.map((r) => (
              <PriorityCard
                key={r.wtp_id}
                row={r}
                ambitionLabel={
                  r.linked_ambition_id ? ambitionsById.get(r.linked_ambition_id) ?? null : null
                }
                onEdit={() => openEdit(r)}
                onDelete={() =>
                  remove.mutate({ wtp_id: r.wtp_id, section_plan_id: sectionPlanId })
                }
                canWrite={!!canWrite}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={form.open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.edit ? 'Edit row' : 'New where-to-play row'}</DialogTitle>
            <DialogDescription>
              Pick a category and either an option or custom text.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select
                value={form.category_id}
                onValueChange={(v) =>
                  setForm({ ...form, category_id: v, option_id: '' })
                }
                disabled={!!form.edit}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.category_id} value={String(c.category_id)}>
                      {c.category_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.category_id && (
              <div className="space-y-1">
                <Label>Option (optional — leave blank for custom)</Label>
                <Select
                  value={form.option_id}
                  onValueChange={(v) => setForm({ ...form, option_id: v })}
                  disabled={!!form.edit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick an option or use custom text" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.option_id} value={String(o.option_id)}>
                        {o.option_text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!form.option_id && (
              <div className="space-y-1">
                <Label htmlFor="wtp-custom">Custom text</Label>
                <Input
                  id="wtp-custom"
                  value={form.custom_text}
                  onChange={(e) => setForm({ ...form, custom_text: e.target.value })}
                  placeholder="e.g. All members at Wheatstone"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="wtp-rationale">Rationale</Label>
              <Textarea
                id="wtp-rationale"
                rows={2}
                value={form.rationale}
                onChange={(e) => setForm({ ...form, rationale: e.target.value })}
                placeholder="Why this cohort, why first/second/third"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="wtp-priority">Priority (1–3)</Label>
                <Input
                  id="wtp-priority"
                  type="number"
                  min={1}
                  max={3}
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                />
              </div>
              <div className="space-y-1 flex items-end gap-2">
                <Switch
                  id="wtp-exclude"
                  checked={form.is_exclusion}
                  onCheckedChange={(v) => setForm({ ...form, is_exclusion: !!v })}
                />
                <Label htmlFor="wtp-exclude" className="text-sm">Exclude this group</Label>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Supports ambition (optional)</Label>
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
                    <SelectItem
                      key={a.ambition_id}
                      value={String(a.ambition_id)}
                    >
                      {a.custom_text ?? '(no label)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={
                !form.category_id || create.isPending || update.isPending
              }
            >
              {create.isPending || update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
