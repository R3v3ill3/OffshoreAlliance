'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, MessageSquare, Users, Save, ListChecks } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
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
  useDeleteSectionSoc,
  useSectionSocs,
  useUpsertSectionSoc,
  type SectionSocRow,
  type SocKind,
} from '@/lib/hooks/useSectionTheoryAndSoc'
import { RepWalkthroughRecordingGrid } from './RepWalkthroughRecordingGrid'

interface StepConfig {
  field: keyof SectionSocRow
  title: string
  prompt: string
  scopeFlag?: 'industrial_in_scope' | 'pabo_in_scope'
}

const SOC1_STEPS: StepConfig[] = [
  { field: 'step_1_introduction', title: 'Introduction / Rapport', prompt: 'Identify yourself, name the issue, check in.' },
  { field: 'step_2_agitation_or_briefing', title: 'Agitation', prompt: 'What is wrong with the current situation? Make it concrete.' },
  { field: 'step_3_hope_or_walkthrough', title: 'Hope', prompt: 'Why is a better outcome possible? What gives workers reason to act?' },
  { field: 'step_4_call_to_action_or_hope', title: 'Call to Action', prompt: 'Primary ask — vote No, talk to a colleague, sign up. Record commitment + reservations.' },
  { field: 'step_5_mapping_or_clear_ask', title: 'Mapping', prompt: 'Gather missing contact details. Focus on the target group.' },
  { field: 'step_6_industrial_or_pabo', title: 'Industrial Action', prompt: 'Explain what protected action looks like. Ask for 1–5 readiness rating.', scopeFlag: 'industrial_in_scope' },
  { field: 'step_7_inoculation_or_close', title: 'Inoculation', prompt: 'What will the employer say? Prepare workers for those arguments and a response.' },
]

const SOC2_STEPS: StepConfig[] = [
  { field: 'step_1_introduction', title: 'Introduction', prompt: 'Brief opening, set the agenda for the call.' },
  { field: 'step_2_agitation_or_briefing', title: 'Briefing', prompt: 'Summary of current situation, what is at stake, why the rep’s intelligence matters now.' },
  { field: 'step_3_hope_or_walkthrough', title: 'Walk-through', prompt: 'Go through the worker list together. Capture No-vote 1–5 and PABO 1–5 per worker; flag concerns.' },
  { field: 'step_4_call_to_action_or_hope', title: 'Hope & Strategic Framing', prompt: 'What does the assessment tell you? What’s the opportunity if workers hold together?' },
  { field: 'step_5_mapping_or_clear_ask', title: 'Clear Ask', prompt: 'Specific commitment — names + deadline. Confirm check-in time.' },
  { field: 'step_6_industrial_or_pabo', title: 'PABO Discussion', prompt: 'If supportive base, explore rep’s own readiness. If cautious, explain what PABO does/doesn’t authorise.', scopeFlag: 'pabo_in_scope' },
  { field: 'step_7_inoculation_or_close', title: 'Recording & Close', prompt: 'Summarise, confirm commitments, agree on check-in, ask rep to flag any change immediately.' },
]

interface SocEditorProps {
  soc: SectionSocRow
  steps: StepConfig[]
}

function SocEditor({ soc, steps }: SocEditorProps) {
  const { canWrite } = useAuth()
  const upsert = useUpsertSectionSoc()
  const [draft, setDraft] = useState<SectionSocRow>(soc)

  useEffect(() => setDraft(soc), [soc])

  const dirty = useMemo(() => {
    const fieldsToCompare: Array<keyof SectionSocRow> = [
      'name',
      'industrial_in_scope',
      'pabo_in_scope',
      'step_1_introduction',
      'step_2_agitation_or_briefing',
      'step_3_hope_or_walkthrough',
      'step_4_call_to_action_or_hope',
      'step_5_mapping_or_clear_ask',
      'step_6_industrial_or_pabo',
      'step_7_inoculation_or_close',
    ]
    return fieldsToCompare.some((k) => draft[k] !== soc[k])
  }, [draft, soc])

  const save = () => {
    upsert.mutate({
      soc_id: soc.soc_id,
      section_plan_id: soc.section_plan_id,
      soc_kind: soc.soc_kind,
      name: draft.name,
      industrial_in_scope: draft.industrial_in_scope,
      pabo_in_scope: draft.pabo_in_scope,
      step_1_introduction: draft.step_1_introduction,
      step_2_agitation_or_briefing: draft.step_2_agitation_or_briefing,
      step_3_hope_or_walkthrough: draft.step_3_hope_or_walkthrough,
      step_4_call_to_action_or_hope: draft.step_4_call_to_action_or_hope,
      step_5_mapping_or_clear_ask: draft.step_5_mapping_or_clear_ask,
      step_6_industrial_or_pabo: draft.step_6_industrial_or_pabo,
      step_7_inoculation_or_close: draft.step_7_inoculation_or_close,
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-1 space-y-1">
          <Label htmlFor={`name-${soc.soc_id}`}>Name</Label>
          <Input
            id={`name-${soc.soc_id}`}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            disabled={!canWrite}
          />
        </div>
        <div className="md:col-span-2 flex items-center gap-6 mt-2">
          <div className="flex items-center gap-2">
            <Switch
              id={`ind-${soc.soc_id}`}
              checked={draft.industrial_in_scope}
              onCheckedChange={(v) => setDraft({ ...draft, industrial_in_scope: !!v })}
              disabled={!canWrite}
            />
            <Label htmlFor={`ind-${soc.soc_id}`} className="text-sm">
              Industrial action in scope
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id={`pabo-${soc.soc_id}`}
              checked={draft.pabo_in_scope}
              onCheckedChange={(v) => setDraft({ ...draft, pabo_in_scope: !!v })}
              disabled={!canWrite}
            />
            <Label htmlFor={`pabo-${soc.soc_id}`} className="text-sm">
              PABO in scope
            </Label>
          </div>
        </div>
      </div>

      {steps.map((s, i) => {
        const hidden =
          (s.scopeFlag === 'industrial_in_scope' && !draft.industrial_in_scope) ||
          (s.scopeFlag === 'pabo_in_scope' && !draft.pabo_in_scope)
        if (hidden) {
          return (
            <div
              key={s.field}
              className="rounded-md border-dashed border p-3 text-xs text-muted-foreground italic"
            >
              {i + 1}. {s.title} — hidden (out of scope)
            </div>
          )
        }
        return (
          <div key={s.field} className="rounded-md border p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{i + 1}</Badge>
              <h4 className="text-sm font-semibold">{s.title}</h4>
            </div>
            <p className="text-xs text-muted-foreground">{s.prompt}</p>
            <Textarea
              rows={3}
              value={(draft[s.field] as string) ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, [s.field]: e.target.value } as SectionSocRow)
              }
              disabled={!canWrite}
              placeholder={s.prompt}
            />
          </div>
        )
      })}

      {canWrite && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={!dirty || upsert.isPending}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {upsert.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
    </div>
  )
}

export function SectionSOCPanel({ sectionPlanId }: { sectionPlanId: number }) {
  const { canWrite } = useAuth()
  const { data: socs = [], isLoading } = useSectionSocs(sectionPlanId)
  const create = useUpsertSectionSoc()
  const remove = useDeleteSectionSoc()
  const [createOpen, setCreateOpen] = useState(false)
  const [newKind, setNewKind] = useState<SocKind>('members_general')
  const [newName, setNewName] = useState('')

  const submitCreate = async () => {
    if (!newName.trim()) return
    await create.mutateAsync({
      section_plan_id: sectionPlanId,
      soc_kind: newKind,
      name: newName.trim(),
      industrial_in_scope: true,
      pabo_in_scope: true,
    })
    setNewName('')
    setCreateOpen(false)
  }

  const grouped = useMemo(() => {
    const m: Record<SocKind, SectionSocRow[]> = {
      members_general: [],
      bargaining_reps: [],
    }
    for (const s of socs) m[s.soc_kind].push(s)
    return m
  }, [socs])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Structured Organising Conversations (SOCs)
            </CardTitle>
            <CardDescription>
              Two flavours: SOC 1 for general members / workforce calls, SOC 2
              for bargaining-rep walkthroughs (with the per-worker recording
              grid). PABO and industrial-action steps are scope-toggleable.
            </CardDescription>
          </div>
          {canWrite && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              New SOC
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && socs.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">
            No SOCs yet. Create one for general worker outreach (SOC 1) and / or
            one for bargaining-rep walkthroughs (SOC 2).
          </p>
        )}
        {socs.length > 0 && (
          <Tabs defaultValue={socs[0].soc_kind} className="space-y-4">
            <TabsList>
              <TabsTrigger value="members_general">
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                SOC 1 — Members / Workforce ({grouped.members_general.length})
              </TabsTrigger>
              <TabsTrigger value="bargaining_reps">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                SOC 2 — Bargaining Reps ({grouped.bargaining_reps.length})
              </TabsTrigger>
            </TabsList>

            {(['members_general', 'bargaining_reps'] as const).map((kind) => (
              <TabsContent key={kind} value={kind} className="space-y-6">
                {grouped[kind].length === 0 && (
                  <p className="text-sm text-muted-foreground italic">
                    No {kind === 'members_general' ? 'SOC 1' : 'SOC 2'} yet.
                  </p>
                )}
                {grouped[kind].map((soc) => (
                  <Card key={soc.soc_id}>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm">{soc.name}</CardTitle>
                        {canWrite && (
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
                                <AlertDialogTitle>Delete this SOC?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Deletes the script and all per-worker recordings
                                  attached to it. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    remove.mutate({
                                      soc_id: soc.soc_id,
                                      section_plan_id: sectionPlanId,
                                    })
                                  }
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <SocEditor
                        soc={soc}
                        steps={kind === 'members_general' ? SOC1_STEPS : SOC2_STEPS}
                      />
                      {kind === 'bargaining_reps' && (
                        <div className="mt-4 pt-4 border-t">
                          <h5 className="text-sm font-semibold flex items-center gap-2 mb-2">
                            <ListChecks className="h-4 w-4" />
                            Per-worker recording grid
                          </h5>
                          <RepWalkthroughRecordingGrid
                            socId={soc.soc_id}
                            paboInScope={soc.pabo_in_scope}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New SOC</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Kind</Label>
              <Select value={newKind} onValueChange={(v) => setNewKind(v as SocKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="members_general">SOC 1 — Members / Workforce</SelectItem>
                  <SelectItem value="bargaining_reps">SOC 2 — Bargaining Reps</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="soc-name">Name</Label>
              <Input
                id="soc-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Pre-ballot SOC for Rankin North"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitCreate}
              disabled={!newName.trim() || create.isPending}
            >
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
