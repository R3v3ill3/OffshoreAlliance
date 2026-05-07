'use client'

import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Check } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/lib/supabase/auth-context'
import {
  SECTION_AMBITION_CATEGORIES,
  useCreateSectionAmbition,
  useDeleteSectionAmbition,
  useSectionAmbitions,
  useUpdateSectionAmbition,
  type SectionAmbitionCategoryKey,
  type SectionAmbitionRow,
} from '@/lib/hooks/useSectionAmbitions'

const CATEGORY_KEYS: SectionAmbitionCategoryKey[] = SECTION_AMBITION_CATEGORIES.map(
  (c) => c.key,
)
const CATEGORY_BY_KEY = Object.fromEntries(
  SECTION_AMBITION_CATEGORIES.map((c) => [c.key, c]),
) as Record<SectionAmbitionCategoryKey, (typeof SECTION_AMBITION_CATEGORIES)[number]>

function indexToCategory(sortOrder: number | null | undefined): SectionAmbitionCategoryKey {
  if (sortOrder == null) return 'primary'
  const i = Math.max(0, Math.min(CATEGORY_KEYS.length - 1, sortOrder))
  return CATEGORY_KEYS[i]
}

function categoryToIndex(key: SectionAmbitionCategoryKey): number {
  return CATEGORY_KEYS.indexOf(key)
}

interface FormState {
  open: boolean
  ambition?: SectionAmbitionRow
  category: SectionAmbitionCategoryKey
  text: string
  target_value: string
  target_unit: string
  target_date: string
  ambition_scope: 'campaign_setup' | 'worker_assessable'
}

const EMPTY_FORM: FormState = {
  open: false,
  category: 'primary',
  text: '',
  target_value: '',
  target_unit: '',
  target_date: '',
  ambition_scope: 'worker_assessable',
}

export function SectionAmbitionPanel({
  sectionPlanId,
}: {
  sectionPlanId: number
}) {
  const { canWrite } = useAuth()
  const { data: ambitions = [], isLoading } = useSectionAmbitions(sectionPlanId)
  const create = useCreateSectionAmbition()
  const update = useUpdateSectionAmbition()
  const remove = useDeleteSectionAmbition()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const groupedByCategory = useMemo(() => {
    const map: Record<SectionAmbitionCategoryKey, SectionAmbitionRow[]> = {
      primary: [],
      secondary: [],
      organising: [],
      industrial: [],
    }
    for (const a of ambitions) {
      map[indexToCategory(a.sort_order)].push(a)
    }
    return map
  }, [ambitions])

  const openAdd = (category: SectionAmbitionCategoryKey) => {
    setForm({ ...EMPTY_FORM, open: true, category })
  }

  const openEdit = (a: SectionAmbitionRow) => {
    setForm({
      open: true,
      ambition: a,
      category: indexToCategory(a.sort_order),
      text: a.custom_text ?? '',
      target_value: a.target_value ?? '',
      target_unit: a.target_unit ?? '',
      target_date: a.target_date ?? '',
      ambition_scope:
        (a.ambition_scope as 'campaign_setup' | 'worker_assessable') ??
        'worker_assessable',
    })
  }

  const close = () => setForm(EMPTY_FORM)

  const submit = async () => {
    if (!form.text.trim()) return
    if (form.ambition) {
      await update.mutateAsync({
        ambition_id: form.ambition.ambition_id,
        section_plan_id: sectionPlanId,
        custom_text: form.text.trim(),
        target_value: form.target_value || null,
        target_unit: form.target_unit || null,
        target_date: form.target_date || null,
        ambition_scope: form.ambition_scope,
        sort_order: categoryToIndex(form.category),
      })
    } else {
      await create.mutateAsync({
        section_plan_id: sectionPlanId,
        custom_text: form.text.trim(),
        target_value: form.target_value || null,
        target_unit: form.target_unit || null,
        target_date: form.target_date || null,
        ambition_scope: form.ambition_scope,
        sort_order: categoryToIndex(form.category),
      })
    }
    close()
  }

  const toggleAchieved = (a: SectionAmbitionRow) => {
    update.mutate({
      ambition_id: a.ambition_id,
      section_plan_id: sectionPlanId,
      is_achieved: !a.is_achieved,
      achieved_date: !a.is_achieved
        ? new Date().toISOString().slice(0, 10)
        : null,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ambitions for this period</CardTitle>
        <CardDescription>
          Four categories aligned to the Field Plan Template: Primary,
          Secondary, Organising, Industrial. Keep ambitions tight, measurable,
          and tied to assessments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading ambitions…</p>
        )}

        {SECTION_AMBITION_CATEGORIES.map((cat) => {
          const items = groupedByCategory[cat.key]
          return (
            <div key={cat.key} className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold">{cat.label}</h3>
                  <p className="text-xs text-muted-foreground">{cat.description}</p>
                </div>
                {canWrite && (
                  <Button variant="ghost" size="sm" onClick={() => openAdd(cat.key)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add
                  </Button>
                )}
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground italic pl-2">
                  No {cat.label.toLowerCase()} ambition yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {items.map((a) => (
                    <li
                      key={a.ambition_id}
                      className="flex items-start gap-2 rounded-md border p-2.5"
                    >
                      <Button
                        variant={a.is_achieved ? 'success' as never : 'ghost'}
                        size="icon"
                        className="h-5 w-5 mt-0.5 shrink-0"
                        onClick={() => canWrite && toggleAchieved(a)}
                        disabled={!canWrite}
                        title={a.is_achieved ? 'Mark not achieved' : 'Mark achieved'}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <div className="flex-1 min-w-0">
                        <p
                          className={
                            'text-sm ' +
                            (a.is_achieved
                              ? 'line-through text-muted-foreground'
                              : '')
                          }
                        >
                          {a.custom_text}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {a.target_value && (
                            <Badge variant="info" className="text-[10px]">
                              Target: {a.target_value}
                              {a.target_unit ? ` ${a.target_unit}` : ''}
                            </Badge>
                          )}
                          {a.target_date && (
                            <Badge variant="secondary" className="text-[10px]">
                              By {a.target_date}
                            </Badge>
                          )}
                          {a.ambition_scope === 'campaign_setup' && (
                            <Badge variant="outline" className="text-[10px]">
                              Campaign setup
                            </Badge>
                          )}
                        </div>
                      </div>
                      {canWrite && (
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEdit(a)}
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
                                <AlertDialogTitle>Delete ambition?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This removes the ambition from this section
                                  plan. Activity links and assessment ratings
                                  recorded against it remain.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    remove.mutate({
                                      ambition_id: a.ambition_id,
                                      section_plan_id: sectionPlanId,
                                    })
                                  }
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </CardContent>

      <Dialog open={form.open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {form.ambition ? 'Edit ambition' : 'New ambition'}
            </DialogTitle>
            <DialogDescription>
              {CATEGORY_BY_KEY[form.category].description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm({ ...form, category: v as SectionAmbitionCategoryKey })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTION_AMBITION_CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="amb-text">Ambition</Label>
              <Textarea
                id="amb-text"
                rows={3}
                placeholder="e.g. Concrete worker-by-worker assessment of No vote intent across full workforce"
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="amb-tv">Target value</Label>
                <Input
                  id="amb-tv"
                  placeholder="e.g. 60"
                  value={form.target_value}
                  onChange={(e) => setForm({ ...form, target_value: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="amb-tu">Unit</Label>
                <Input
                  id="amb-tu"
                  placeholder="e.g. % · workers · contacts"
                  value={form.target_unit}
                  onChange={(e) => setForm({ ...form, target_unit: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="amb-td">Target date</Label>
              <Input
                id="amb-td"
                type="date"
                value={form.target_date}
                onChange={(e) => setForm({ ...form, target_date: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Scope</Label>
              <Select
                value={form.ambition_scope}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    ambition_scope: v as 'campaign_setup' | 'worker_assessable',
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="worker_assessable">
                    Worker-assessable (rolls up from ratings)
                  </SelectItem>
                  <SelectItem value="campaign_setup">
                    Campaign setup (lists / mapping / scaffolding)
                  </SelectItem>
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
              disabled={!form.text.trim() || create.isPending || update.isPending}
            >
              {create.isPending || update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
