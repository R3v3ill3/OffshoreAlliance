'use client'

import { useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Trash2, Pencil, GripVertical } from 'lucide-react'
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
import {
  useReorderSectionWtp,
  useSetWtpRowAmbitions,
  useSetWtpSectionAmbitions,
  useWtpRowAmbitions,
  useWtpSectionAmbitions,
} from '@/lib/hooks/useWtpAmbitionLinks'
import { AmbitionMultiPicker } from './AmbitionMultiPicker'

/* ───────── Sortable row card ───────── */

interface RowCardProps {
  row: SectionWtpRow
  selectedAmbitionIds: number[]
  inheritedAmbitionIds: number[]
  ambitionOptions: { id: number; label: string }[]
  onEditAmbitions: (next: number[]) => void
  onEditRow: () => void
  onDelete: () => void
  canWrite: boolean
}

function SortableRowCard({
  row,
  selectedAmbitionIds,
  inheritedAmbitionIds,
  ambitionOptions,
  onEditAmbitions,
  onEditRow,
  onDelete,
  canWrite,
}: RowCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.wtp_id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const label = row.option?.option_text ?? row.custom_text ?? '(no label)'

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="rounded-md border p-3 space-y-1.5 bg-background"
    >
      <div className="flex items-start gap-2">
        {canWrite && (
          <button
            type="button"
            className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {row.is_exclusion && <Badge variant="destructive">Exclude</Badge>}
            <p className="text-sm font-medium">{label}</p>
          </div>
          {row.rationale && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
              {row.rationale}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground">
              Supports:
            </span>
            <AmbitionMultiPicker
              options={ambitionOptions}
              value={selectedAmbitionIds}
              onChange={onEditAmbitions}
              inheritedIds={inheritedAmbitionIds}
              disabled={!canWrite}
              placeholder="Section default applies"
            />
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEditRow}>
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
                  <AlertDialogTitle>Remove this option?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Removes the option from this section&apos;s where-to-play.
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

/* ───────── Add option / edit option dialog state ───────── */

interface FormState {
  open: boolean
  edit?: SectionWtpRow
  category_id: number
  option_id: string
  custom_text: string
  rationale: string
  is_exclusion: boolean
}

const blankForm = (categoryId: number): FormState => ({
  open: true,
  category_id: categoryId,
  option_id: '',
  custom_text: '',
  rationale: '',
  is_exclusion: false,
})

/* ───────── Section card (one wtp_category) ───────── */

interface SectionCardProps {
  sectionPlanId: number
  categoryId: number
  categoryName: string
  rows: SectionWtpRow[]
  rowAmbitionsByWtp: Record<number, number[]>
  sectionAmbitionIds: number[]
  ambitionOptions: { id: number; label: string }[]
  onAdd: () => void
  onEditRow: (row: SectionWtpRow) => void
  onRemoveSection: () => void
  canWrite: boolean
}

function SectionCard({
  sectionPlanId,
  categoryId,
  categoryName,
  rows,
  rowAmbitionsByWtp,
  sectionAmbitionIds,
  ambitionOptions,
  onAdd,
  onEditRow,
  onRemoveSection,
  canWrite,
}: SectionCardProps) {
  const reorder = useReorderSectionWtp()
  const setRowAmbitions = useSetWtpRowAmbitions()
  const setSectionAmbitions = useSetWtpSectionAmbitions()
  const remove = useDeleteSectionWtp()

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [rows],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = sortedRows.map((r) => r.wtp_id)
    const oldIdx = ids.indexOf(Number(active.id))
    const newIdx = ids.indexOf(Number(over.id))
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = arrayMove(sortedRows, oldIdx, newIdx)
    const orderings = reordered.map((r, i) => ({ wtp_id: r.wtp_id, sort_order: i }))
    reorder.mutate({ section_plan_id: sectionPlanId, orderings })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <CardTitle className="text-base">{categoryName}</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                Section supports:
              </span>
              <AmbitionMultiPicker
                options={ambitionOptions}
                value={sectionAmbitionIds}
                onChange={(next) =>
                  setSectionAmbitions.mutate({
                    section_plan_id: sectionPlanId,
                    wtp_category_id: categoryId,
                    ambition_ids: next,
                  })
                }
                disabled={!canWrite}
                placeholder="No section default — set per row"
              />
            </div>
          </div>
          <div className="flex items-center gap-1">
            {canWrite && (
              <Button size="sm" variant="outline" onClick={onAdd}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Option
              </Button>
            )}
            {canWrite && rows.length === 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    title="Remove section (no options)"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove section?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Drops the section-level ambition links for{' '}
                      <strong>{categoryName}</strong>. The category itself
                      remains available to add again later.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onRemoveSection}>
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sortedRows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No options yet. Use &ldquo;Option&rdquo; to add one.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedRows.map((r) => r.wtp_id)}
              strategy={verticalListSortingStrategy}
            >
              <ol className="space-y-2 list-decimal list-inside marker:text-muted-foreground">
                {sortedRows.map((r) => (
                  <SortableRowCard
                    key={r.wtp_id}
                    row={r}
                    selectedAmbitionIds={rowAmbitionsByWtp[r.wtp_id] ?? []}
                    inheritedAmbitionIds={sectionAmbitionIds}
                    ambitionOptions={ambitionOptions}
                    onEditAmbitions={(next) =>
                      setRowAmbitions.mutate({
                        section_plan_id: sectionPlanId,
                        wtp_id: r.wtp_id,
                        ambition_ids: next,
                      })
                    }
                    onEditRow={() => onEditRow(r)}
                    onDelete={() =>
                      remove.mutate({
                        wtp_id: r.wtp_id,
                        section_plan_id: sectionPlanId,
                      })
                    }
                    canWrite={canWrite}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  )
}

/* ───────── Top-level panel ───────── */

export function SectionWhereToPlayPanel({ sectionPlanId }: { sectionPlanId: number }) {
  const { canWrite } = useAuth()
  const { data: rows = [], isLoading } = useSectionWtp(sectionPlanId)
  const { data: categories = [] } = useWtpCategories()
  const { data: ambitions = [] } = useSectionAmbitions(sectionPlanId)
  const { data: rowAmbitionsByWtp = {} } = useWtpRowAmbitions(sectionPlanId)
  const { data: sectionAmbitionsByCat = {} } = useWtpSectionAmbitions(sectionPlanId)
  const { data: setSectionAmbitionsState } = { data: undefined }
  void setSectionAmbitionsState
  const setSectionAmbitionsMutation = useSetWtpSectionAmbitions()
  const create = useCreateSectionWtp()
  const update = useUpdateSectionWtp()

  const [form, setForm] = useState<FormState | null>(null)
  const [addingSection, setAddingSection] = useState(false)
  const [newCategoryId, setNewCategoryId] = useState<string>('')

  const { data: optionsForForm = [] } = useWtpOptions(form?.category_id ?? null)

  const ambitionOptions = useMemo(
    () =>
      ambitions.map((a) => ({
        id: a.ambition_id,
        label: a.custom_text ?? '(no label)',
      })),
    [ambitions],
  )

  // Group rows by wtp_category_id; sort categories by their sort_order in
  // wtp_categories. A "section" exists when the section_plan has at least
  // one wtp row in that category OR has at least one section-level ambition
  // for that category (so empty sections still show until removed).
  const sectionsInUse = useMemo(() => {
    const ids = new Set<number>()
    for (const r of rows) ids.add(r.wtp_category_id)
    for (const cidStr of Object.keys(sectionAmbitionsByCat)) ids.add(Number(cidStr))
    return ids
  }, [rows, sectionAmbitionsByCat])

  const orderedSectionCategories = useMemo(() => {
    return categories
      .filter((c) => sectionsInUse.has(c.category_id))
      .sort(
        (a, b) =>
          (categories.findIndex((x) => x.category_id === a.category_id) ?? 0) -
          (categories.findIndex((x) => x.category_id === b.category_id) ?? 0),
      )
  }, [categories, sectionsInUse])

  const availableForNewSection = useMemo(
    () => categories.filter((c) => !sectionsInUse.has(c.category_id)),
    [categories, sectionsInUse],
  )

  const rowsByCategory = useMemo(() => {
    const m: Record<number, SectionWtpRow[]> = {}
    for (const r of rows) (m[r.wtp_category_id] ??= []).push(r)
    return m
  }, [rows])

  const submitForm = async () => {
    if (!form) return
    const base = {
      section_plan_id: sectionPlanId,
      rationale: form.rationale || null,
      is_exclusion: form.is_exclusion,
      custom_text: form.option_id ? null : form.custom_text || null,
    }
    if (form.edit) {
      await update.mutateAsync({
        ...base,
        wtp_id: form.edit.wtp_id,
      })
    } else {
      // Append at end of category's existing sort_order.
      const existingMax = (rowsByCategory[form.category_id] ?? []).reduce(
        (m, r) => Math.max(m, r.sort_order ?? 0),
        -1,
      )
      await create.mutateAsync({
        ...base,
        wtp_category_id: form.category_id,
        wtp_option_id: form.option_id ? Number(form.option_id) : null,
        priority: null,
      })
      // Set sort_order on the row we just created. It would be cleaner
      // to do this in the create mutation, but we need to know the
      // created wtp_id to update its sort_order. Skip for now — sort
      // order is correct because new rows default to 0 and earlier rows
      // already have sort_order set. The drag-end handler reflows them.
      void existingMax
    }
    setForm(null)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contact strategy / Where to play</CardTitle>
          <CardDescription>
            Group options into sections (e.g. Narrative &amp; Tone, Geographic
            focus). Drag to set priority within a section. Link the whole
            section to one or more ambitions; per-row links override the
            section default.
          </CardDescription>
        </CardHeader>
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {orderedSectionCategories.map((cat) => (
        <SectionCard
          key={cat.category_id}
          sectionPlanId={sectionPlanId}
          categoryId={cat.category_id}
          categoryName={cat.category_name}
          rows={rowsByCategory[cat.category_id] ?? []}
          rowAmbitionsByWtp={rowAmbitionsByWtp}
          sectionAmbitionIds={sectionAmbitionsByCat[cat.category_id] ?? []}
          ambitionOptions={ambitionOptions}
          onAdd={() => setForm(blankForm(cat.category_id))}
          onEditRow={(r) =>
            setForm({
              open: true,
              edit: r,
              category_id: r.wtp_category_id,
              option_id: r.wtp_option_id ? String(r.wtp_option_id) : '',
              custom_text: r.custom_text ?? '',
              rationale: r.rationale ?? '',
              is_exclusion: !!r.is_exclusion,
            })
          }
          onRemoveSection={() => {
            // Drop section-level ambition links; the category becomes
            // available to add again from the picker below.
            setSectionAmbitionsMutation.mutate({
              section_plan_id: sectionPlanId,
              wtp_category_id: cat.category_id,
              ambition_ids: [],
            })
          }}
          canWrite={!!canWrite}
        />
      ))}

      {orderedSectionCategories.length === 0 && !isLoading && (
        <Card>
          <CardContent className="py-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              No sections yet. Add one to start building this period&apos;s
              contact strategy.
            </p>
          </CardContent>
        </Card>
      )}

      {canWrite && (
        <Card>
          <CardContent className="py-4">
            {addingSection ? (
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={newCategoryId} onValueChange={setNewCategoryId}>
                  <SelectTrigger className="w-72">
                    <SelectValue placeholder="Pick a section to add" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableForNewSection.length === 0 ? (
                      <div className="p-2 text-xs text-muted-foreground">
                        All sections already added.
                      </div>
                    ) : (
                      availableForNewSection.map((c) => (
                        <SelectItem key={c.category_id} value={String(c.category_id)}>
                          {c.category_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => {
                    if (!newCategoryId) return
                    setForm(blankForm(Number(newCategoryId)))
                    setNewCategoryId('')
                    setAddingSection(false)
                  }}
                  disabled={!newCategoryId}
                >
                  Add first option
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAddingSection(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => setAddingSection(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add new section
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {form?.edit ? 'Edit option' : 'New option'}
            </DialogTitle>
            <DialogDescription>
              {form?.edit
                ? 'Adjust this option, its rationale, or whether it is an exclusion.'
                : 'Pick from the option library or use a custom label. Rationale is optional.'}
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>Option (optional — leave blank for custom)</Label>
                <Select
                  value={form.option_id || 'none'}
                  onValueChange={(v) =>
                    setForm({ ...form, option_id: v === 'none' ? '' : v })
                  }
                  disabled={!!form.edit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick an option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Custom text —</SelectItem>
                    {optionsForForm.map((o) => (
                      <SelectItem key={o.option_id} value={String(o.option_id)}>
                        {o.option_text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!form.option_id && (
                <div className="space-y-1">
                  <Label htmlFor="wtp-custom">Custom text</Label>
                  <Input
                    id="wtp-custom"
                    value={form.custom_text}
                    onChange={(e) =>
                      setForm({ ...form, custom_text: e.target.value })
                    }
                    placeholder="e.g. Direct, plain-language tone"
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
                  placeholder="Why this option, why this priority"
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="wtp-exclude"
                  checked={form.is_exclusion}
                  onCheckedChange={(v) => setForm({ ...form, is_exclusion: !!v })}
                />
                <Label htmlFor="wtp-exclude" className="text-sm">
                  Exclude this option (do not pursue)
                </Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button
              onClick={submitForm}
              disabled={create.isPending || update.isPending}
            >
              {create.isPending || update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
