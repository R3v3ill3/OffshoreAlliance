'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, PhoneCall } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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
  useCreateSectionActivity,
  useDeleteSectionActivity,
  useSectionActivities,
} from '@/lib/hooks/useSectionActivities'
import { SequenceBuilder } from './SequenceBuilder'

const ACTIVITY_KINDS = [
  { key: 'phone_call_list', label: 'Phone call list' },
  { key: 'sms_blast', label: 'SMS blast' },
  { key: 'email_survey', label: 'Email survey' },
  { key: 'task', label: 'Task / activist tasking' },
  { key: 'site_visit', label: 'Site visit' },
  { key: 'woc_meeting', label: 'WOC meeting' },
  { key: 'assessment', label: 'Assessment' },
  { key: 'industrial_action', label: 'Industrial action' },
] as const

interface SectionActivitiesPanelProps {
  sectionPlanId: number
  campaignId: number
}

interface FormState {
  open: boolean
  title: string
  description: string
  activity_kind: string
  template_key: string
}

const EMPTY_FORM: FormState = {
  open: false,
  title: '',
  description: '',
  activity_kind: 'phone_call_list',
  template_key: '',
}

export function SectionActivitiesPanel({
  sectionPlanId,
  campaignId,
}: SectionActivitiesPanelProps) {
  const { canWrite } = useAuth()
  const router = useRouter()
  const { data: activities = [], isLoading } = useSectionActivities(sectionPlanId)
  const create = useCreateSectionActivity()
  const remove = useDeleteSectionActivity()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [creatingListFor, setCreatingListFor] = useState<number | null>(null)

  const handleCreateCallList = async (activityId: number) => {
    setCreatingListFor(activityId)
    try {
      const supabase = createClient()
      const { data: listId, error } = await supabase.rpc('create_call_list_from_activity', {
        p_activity_id: activityId,
      })
      if (error) throw error
      router.push(`/campaigns/${campaignId}/phone/lists/${listId}`)
    } catch (err) {
      console.error('Failed to create call list from activity:', err)
    } finally {
      setCreatingListFor(null)
    }
  }

  const submit = async () => {
    if (!form.title.trim()) return
    await create.mutateAsync({
      campaign_id: campaignId,
      section_plan_id: sectionPlanId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      activity_kind: form.activity_kind,
      template_key: form.template_key.trim() || form.activity_kind,
    })
    setForm(EMPTY_FORM)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Activities</CardTitle>
              <CardDescription>
                Outreach, tasking, meetings, and assessments scoped to this
                section. Each activity can be the source of an activity
                sequence (e.g. phone wave → SMS follow-up).
              </CardDescription>
            </div>
            {canWrite && (
              <Button size="sm" onClick={() => setForm({ ...EMPTY_FORM, open: true })}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add activity
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && activities.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">
              No activities scoped to this section plan yet.
            </p>
          )}
          {activities.length > 0 && (
            <ul className="space-y-2">
              {activities.map((a) => (
                <li
                  key={a.activity_id}
                  className="rounded-md border p-3 flex items-start justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="info">{a.activity_kind ?? '—'}</Badge>
                      {a.template_key && (
                        <span className="text-xs text-muted-foreground">
                          {a.template_key}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium">{a.title}</p>
                    {a.description && (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                        {a.description}
                      </p>
                    )}
                  </div>
                  {canWrite && (
                    <div className="flex items-center gap-1 shrink-0">
                      {a.activity_kind === 'phone_call_list' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          disabled={creatingListFor === a.activity_id}
                          onClick={() => handleCreateCallList(a.activity_id)}
                        >
                          <PhoneCall className="h-3 w-3" />
                          {creatingListFor === a.activity_id ? 'Creating…' : 'Create call list'}
                        </Button>
                      )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete activity?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Deletes the activity and any associated activity
                            events. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              remove.mutate({
                                activity_id: a.activity_id,
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
        </CardContent>
      </Card>

      <SequenceBuilder sectionPlanId={sectionPlanId} activities={activities} />

      <Dialog open={form.open} onOpenChange={(o) => !o && setForm(EMPTY_FORM)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New activity</DialogTitle>
            <DialogDescription>
              A lightweight scaffold — once created you can attach activity
              events (call attempts, meeting outcomes, etc.) elsewhere in the
              app to drive recordings and sequence triggers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="act-title">Title</Label>
              <Input
                id="act-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Pre-ballot phone wave — Rankin North"
              />
            </div>
            <div className="space-y-1">
              <Label>Kind</Label>
              <Select
                value={form.activity_kind}
                onValueChange={(v) => setForm({ ...form, activity_kind: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_KINDS.map((k) => (
                    <SelectItem key={k.key} value={k.key}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="act-template">Template key (optional)</Label>
              <Input
                id="act-template"
                value={form.template_key}
                onChange={(e) => setForm({ ...form, template_key: e.target.value })}
                placeholder="Defaults to activity kind"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="act-desc">Description</Label>
              <Textarea
                id="act-desc"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(EMPTY_FORM)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={create.isPending || !form.title.trim()}>
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
