'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { fetchApi } from '@/lib/api/fetch-api'
import { toast } from 'sonner'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trash2, Phone, Mail, ClipboardList, ListTodo, Loader2 } from 'lucide-react'

interface OutreachCleanupPanelProps {
  campaignId: string | number
}

type CleanupScope = 'phone_actions' | 'email_drafts' | 'assessments' | 'task_lists' | 'all'

interface PhoneActionRow {
  action_id: number
  status: string
  entry_branch: string
  created_at: string
  list_ids: number[]
}

interface EmailDraftRow {
  draft_id: number
  platform: string
  status: string
  title: string | null
  subject: string | null
  created_at: string
}

interface AssessmentRow {
  activity_id: number
  title: string
  activity_kind: string
  created_at: string
}

interface TaskListRow {
  task_list_id: number
  status: string
  activity_id: number | null
  created_at: string
}

export function OutreachCleanupPanel({ campaignId }: OutreachCleanupPanelProps) {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const id = String(campaignId)

  const [pendingScope, setPendingScope] = useState<CleanupScope | null>(null)

  const { data: phoneActions = [], refetch: refetchPhone } = useQuery<PhoneActionRow[]>({
    queryKey: ['cleanup-phone-actions', id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('phone_call_actions')
        .select('action_id, status, entry_branch, created_at, list_ids')
        .eq('campaign_id', Number(id))
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
      if (error) return []
      return (data ?? []) as PhoneActionRow[]
    },
    enabled: !!user,
  })

  const { data: emailDrafts = [], refetch: refetchEmail } = useQuery<EmailDraftRow[]>({
    queryKey: ['cleanup-email-drafts', id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('campaign_comms_drafts')
        .select('draft_id, platform, status, title, subject, created_at')
        .eq('campaign_id', Number(id))
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
      if (error) return []
      return (data ?? []) as EmailDraftRow[]
    },
    enabled: !!user,
  })

  const { data: assessments = [], refetch: refetchAssessments } = useQuery<AssessmentRow[]>({
    queryKey: ['cleanup-assessments', id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('campaign_activities')
        .select('activity_id, title, activity_kind, created_at')
        .eq('campaign_id', Number(id))
        .eq('activity_kind', 'assessment')
        .order('created_at', { ascending: false })
      if (error) return []
      return (data ?? []) as AssessmentRow[]
    },
    enabled: !!user,
  })

  const { data: taskLists = [], refetch: refetchTaskLists } = useQuery<TaskListRow[]>({
    queryKey: ['cleanup-task-lists', id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('campaign_task_lists')
        .select('task_list_id, status, activity_id, created_at')
        .eq('campaign_id', Number(id))
        .order('created_at', { ascending: false })
      if (error) return []
      return (data ?? []) as TaskListRow[]
    },
    enabled: !!user,
  })

  const cleanupMutation = useMutation({
    mutationFn: async (scope: CleanupScope) => {
      const res = await fetchApi(`/api/campaigns/${id}/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Cleanup failed' }))
        throw new Error(err.error || 'Cleanup failed')
      }
      return res.json() as Promise<{ ok: boolean; deleted: Record<string, number> }>
    },
    onSuccess: (result, scope) => {
      const d = result.deleted
      const parts: string[] = []
      if (d.phone_actions_deleted) parts.push(`${d.phone_actions_deleted} phone action${d.phone_actions_deleted !== 1 ? 's' : ''}`)
      if (d.call_lists_deleted) parts.push(`${d.call_lists_deleted} call list${d.call_lists_deleted !== 1 ? 's' : ''}`)
      if (d.email_drafts_deleted) parts.push(`${d.email_drafts_deleted} email draft${d.email_drafts_deleted !== 1 ? 's' : ''}`)
      if (d.email_lists_deleted) parts.push(`${d.email_lists_deleted} email list${d.email_lists_deleted !== 1 ? 's' : ''}`)
      if (d.assessments_deleted) parts.push(`${d.assessments_deleted} assessment${d.assessments_deleted !== 1 ? 's' : ''}`)
      if (d.task_lists_deleted) parts.push(`${d.task_lists_deleted} task list${d.task_lists_deleted !== 1 ? 's' : ''}`)
      toast.success(parts.length > 0 ? `Deleted: ${parts.join(', ')}` : 'Nothing to delete')

      if (scope === 'phone_actions' || scope === 'all') {
        queryClient.invalidateQueries({ queryKey: ['phone-call-actions', 'in-progress', id] })
        queryClient.invalidateQueries({ queryKey: ['call-lists', id] })
        queryClient.invalidateQueries({ queryKey: ['call-campaign-summary', id] })
        queryClient.invalidateQueries({ queryKey: ['call-outcome-summary', id] })
        queryClient.invalidateQueries({ queryKey: ['call-section-funnel', id] })
        void refetchPhone()
      }
      if (scope === 'email_drafts' || scope === 'all') {
        queryClient.invalidateQueries({ queryKey: ['email-draft', 'in-progress', id] })
        queryClient.invalidateQueries({ queryKey: ['campaign-comms-drafts', Number(id)] })
        void refetchEmail()
      }
      if (scope === 'assessments' || scope === 'all') {
        queryClient.invalidateQueries({ queryKey: ['campaign-activities', Number(id)] })
        queryClient.invalidateQueries({ queryKey: ['campaign-activities', id] })
        queryClient.invalidateQueries({ queryKey: ['campaign-activity-ratings'] })
        queryClient.invalidateQueries({ queryKey: ['campaign-rating-summary', Number(id)] })
        // Deleting assessments may cascade-delete linked task lists too.
        queryClient.invalidateQueries({ queryKey: ['campaign-task-lists', Number(id)] })
        queryClient.invalidateQueries({ queryKey: ['task-list-progress-batch', Number(id)] })
        void refetchAssessments()
        void refetchTaskLists()
      }
      if (scope === 'task_lists' || scope === 'all') {
        queryClient.invalidateQueries({ queryKey: ['campaign-task-lists', Number(id)] })
        queryClient.invalidateQueries({ queryKey: ['task-list-progress-batch', Number(id)] })
        void refetchTaskLists()
      }
    },
    onError: (err) => {
      toast.error('Cleanup failed', {
        description: err instanceof Error ? err.message : String(err),
      })
    },
  })

  function handleConfirm() {
    if (!pendingScope) return
    const scope = pendingScope
    setPendingScope(null)
    cleanupMutation.mutate(scope)
  }

  const phoneCount = phoneActions.length
  const emailCount = emailDrafts.length
  const assessmentCount = assessments.length
  const taskListCount = taskLists.length
  const totalCount = phoneCount + emailCount + assessmentCount + taskListCount

  const scopeLabel: Record<CleanupScope, string> = {
    phone_actions: 'all phone call actions and call lists',
    email_drafts: 'all email drafts and email lists',
    assessments: 'all assessments (including their ratings, linked task lists, and call attempt data)',
    task_lists: 'all task lists (including items, leader tokens, and form events)',
    all: 'all phone, email, assessment, and task list test data',
  }

  return (
    <>
      <Accordion type="single" collapsible>
        <AccordionItem value="cleanup" className="border rounded-lg px-3">
          <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline text-muted-foreground">
            <span className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              Test Data Cleanup
              {totalCount > 0 && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {totalCount} items
                </Badge>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              Remove test data created during development. Each section shows what will be deleted.
              Cascading deletes are handled automatically — see inline notes for details.
            </p>

            {/* Phone actions */}
            <CleanupSection
              icon={<Phone className="h-4 w-4 text-muted-foreground" />}
              label="Phone Call Actions"
              count={phoneCount}
              scope="phone_actions"
              isPending={cleanupMutation.isPending}
              pendingScope={cleanupMutation.variables}
              onDelete={() => setPendingScope('phone_actions')}
              note="Also removes all call lists, items, and attempt records for this campaign."
            >
              {phoneActions.map((a) => (
                <ItemRow key={a.action_id}>
                  <Badge variant={a.status === 'in_progress' ? 'warning' : 'secondary'} className="text-xs shrink-0">
                    {a.status}
                  </Badge>
                  <span className="truncate">{a.entry_branch}</span>
                  <span className="shrink-0 text-muted-foreground/70">{a.list_ids?.length ?? 0} list{(a.list_ids?.length ?? 0) !== 1 ? 's' : ''}</span>
                </ItemRow>
              ))}
            </CleanupSection>

            {/* Email drafts */}
            <CleanupSection
              icon={<Mail className="h-4 w-4 text-muted-foreground" />}
              label="Email / Comms Drafts"
              count={emailCount}
              scope="email_drafts"
              isPending={cleanupMutation.isPending}
              pendingScope={cleanupMutation.variables}
              onDelete={() => setPendingScope('email_drafts')}
              note="Also removes associated email lists and recipient items."
            >
              {emailDrafts.map((d) => (
                <ItemRow key={d.draft_id}>
                  <Badge variant="secondary" className="text-xs shrink-0">{d.status}</Badge>
                  <Badge variant="outline" className="text-xs shrink-0">{d.platform}</Badge>
                  <span className="truncate">{d.title ?? d.subject ?? 'Untitled'}</span>
                </ItemRow>
              ))}
            </CleanupSection>

            {/* Assessments */}
            <CleanupSection
              icon={<ClipboardList className="h-4 w-4 text-muted-foreground" />}
              label="Assessments"
              count={assessmentCount}
              scope="assessments"
              isPending={cleanupMutation.isPending}
              pendingScope={cleanupMutation.variables}
              onDelete={() => setPendingScope('assessments')}
              note="Cascades: ratings, ambitions, linked task lists, call attempt assessment records. Phone action references are cleared first."
            >
              {assessments.map((a) => (
                <ItemRow key={a.activity_id}>
                  <span className="truncate font-medium">{a.title || 'Untitled assessment'}</span>
                </ItemRow>
              ))}
            </CleanupSection>

            {/* Task lists */}
            <CleanupSection
              icon={<ListTodo className="h-4 w-4 text-muted-foreground" />}
              label="Task Lists"
              count={taskListCount}
              scope="task_lists"
              isPending={cleanupMutation.isPending}
              pendingScope={cleanupMutation.variables}
              onDelete={() => setPendingScope('task_lists')}
              note="Cascades: list items, leader tokens, form events. Worker list fire references are cleared first. Activity ratings written by leaders are not removed."
            >
              {taskLists.map((t) => (
                <ItemRow key={t.task_list_id}>
                  <Badge variant={t.status === 'active' ? 'success' : 'secondary'} className="text-xs shrink-0">
                    {t.status}
                  </Badge>
                  <span className="truncate text-muted-foreground/70">id {t.task_list_id}</span>
                  {t.activity_id && (
                    <span className="shrink-0 text-muted-foreground/70">linked to activity {t.activity_id}</span>
                  )}
                </ItemRow>
              ))}
            </CleanupSection>

            {/* Delete all */}
            {totalCount > 0 && (
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                disabled={cleanupMutation.isPending}
                onClick={() => setPendingScope('all')}
              >
                {cleanupMutation.isPending && cleanupMutation.variables === 'all' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Delete All Test Data
              </Button>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <AlertDialog open={pendingScope != null} onOpenChange={(open) => { if (!open) setPendingScope(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete test data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              {pendingScope ? scopeLabel[pendingScope] : ''}{' '}
              for this campaign. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cleanupMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cleanupMutation.isPending}
              onClick={handleConfirm}
            >
              {cleanupMutation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function CleanupSection({
  icon,
  label,
  count,
  scope,
  isPending,
  pendingScope,
  onDelete,
  note,
  children,
}: {
  icon: React.ReactNode
  label: string
  count: number
  scope: CleanupScope
  isPending: boolean
  pendingScope: CleanupScope | undefined
  onDelete: () => void
  note: string
  children: React.ReactNode
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-sm font-medium">{label}</span>
            <Badge variant="secondary" className="text-xs">{count}</Badge>
          </div>
          <Button
            size="sm"
            variant="destructive"
            disabled={count === 0 || isPending}
            onClick={onDelete}
          >
            {isPending && pendingScope === scope ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
            Delete All
          </Button>
        </div>
        {count > 0 ? (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {children}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No {label.toLowerCase()} found.</p>
        )}
        <p className="text-xs text-muted-foreground/70 italic">{note}</p>
      </CardContent>
    </Card>
  )
}

function ItemRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-0.5">
      {children}
    </div>
  )
}
