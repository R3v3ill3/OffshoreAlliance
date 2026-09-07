'use client'

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  Ban,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MailCheck,
  MessageSquarePlus,
  StickyNote,
  Trash2,
  UserRoundSearch,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { fetchApi } from '@/lib/api/fetch-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
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
import {
  useAddEmailNote,
  useArchiveEmailCannedReply,
  useCreateEmailCannedReply,
  useEmailCannedReplies,
  useEmailConversationAction,
  useEmailInboxCampaigns,
} from '@/lib/hooks/useEmailInbox'
import type { EmailConversationDetail } from '@/types/email-inbox'
import type { EmailDraftState } from './EmailThreadView'

const UNASSIGNED = '__unassigned__'
const NO_CAMPAIGN = '__none__'

interface WorkerSearchHit {
  worker_id: number
  first_name: string
  last_name: string
  preferred_name: string | null
  email: string | null
  employer_name: string | null
  worksite_name: string | null
}

export function EmailContextSidebar({
  detail,
  draft,
  onInsertSavedReply,
}: {
  detail: EmailConversationDetail
  draft: EmailDraftState
  onInsertSavedReply: (body: string) => void
}) {
  const { conversation, user_names, events } = detail
  const worker = conversation.worker
  const action = useEmailConversationAction(conversation.conversation_id)
  const addNote = useAddEmailNote(conversation.conversation_id)
  const createReply = useCreateEmailCannedReply()
  const archiveReply = useArchiveEmailCannedReply()
  const { data: cannedReplies = [] } = useEmailCannedReplies(conversation.campaign_id)
  const { data: campaigns = [] } = useEmailInboxCampaigns()
  const [note, setNote] = useState('')
  const [savedTitle, setSavedTitle] = useState('')
  const [workerSearch, setWorkerSearch] = useState('')
  const [debouncedWorkerSearch, setDebouncedWorkerSearch] = useState('')
  const idPrefix = useId()
  const assigneeId = `${idPrefix}-assignee`
  const campaignSelectId = `${idPrefix}-campaign`
  const noteId = `${idPrefix}-note`

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedWorkerSearch(workerSearch.trim()),
      250,
    )
    return () => clearTimeout(timer)
  }, [workerSearch])

  const { data: staff = [] } = useQuery({
    queryKey: ['email-inbox-staff'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('user_profiles')
        .select('user_id, display_name')
        .order('display_name', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })

  const { data: workerMatches = [], isFetching: searchingWorkers } = useQuery({
    queryKey: ['email-inbox-worker-search', debouncedWorkerSearch],
    queryFn: async () => {
      const res = await fetchApi(
        `/api/workers/search?q=${encodeURIComponent(debouncedWorkerSearch)}&limit=8`,
      )
      if (!res.ok) throw new Error('Failed to search workers')
      const payload = (await res.json()) as { workers: WorkerSearchHit[] }
      return payload.workers
    },
    enabled: !worker && debouncedWorkerSearch.length >= 2,
  })

  const { data: organisingUnits = [] } = useQuery({
    queryKey: [
      'email-inbox-worker-units',
      conversation.campaign_id,
      conversation.worker_id,
    ],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('campaign_worker_ou')
        .select(
          `is_primary,
           unit:campaign_organising_units!inner(ou_id, name, ou_type, campaign_id)`,
        )
        .eq('worker_id', conversation.worker_id as number)
        .eq('unit.campaign_id', conversation.campaign_id as number)
      if (error) throw error
      return (data ?? []) as unknown as Array<{
        is_primary: boolean | null
        unit: { ou_id: number; name: string; ou_type: string }
      }>
    },
    enabled:
      conversation.worker_id != null && conversation.campaign_id != null,
  })

  const runAction = (
    input: Parameters<typeof action.mutate>[0],
    success: string,
  ) => {
    action.mutate(input, {
      onSuccess: () => toast.success(success),
      onError: (error: Error) => toast.error(error.message),
    })
  }

  return (
    <aside className="flex h-full flex-col gap-4 overflow-y-auto p-3 text-sm">
      <section className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {worker
                ? [worker.preferred_name || worker.first_name, worker.last_name]
                    .filter(Boolean)
                    .join(' ')
                : conversation.email_address}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {worker?.email || conversation.email_address}
            </p>
          </div>
          {worker && (
            <Button asChild variant="outline" size="sm" className="h-7">
              <Link href={`/workers/${worker.worker_id}`}>
                Profile <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>
        {worker ? (
          <div className="space-y-0.5 text-xs text-muted-foreground">
            {worker.occupation && <p>{worker.occupation}</p>}
            {worker.employer && <p>{worker.employer.employer_name}</p>}
            {worker.worksite && <p>{worker.worksite.worksite_name}</p>}
            <p>Email status: {worker.email_status || 'unverified'}</p>
          </div>
        ) : (
          <div className="space-y-2 rounded-md border border-dashed p-2">
            <p className="text-xs text-muted-foreground">
              This address is not matched to a worker. Match it to resolve
              triage and unlock campaign context.
            </p>
            <div className="relative">
              <Input
                value={workerSearch}
                className="h-8 text-xs"
                placeholder="Search worker name or email…"
                aria-label="Search workers to match this conversation"
                onChange={(event) => setWorkerSearch(event.target.value)}
              />
              {searchingWorkers && (
                <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {workerMatches.length > 0 && (
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {workerMatches.map((match) => (
                  <button
                    key={match.worker_id}
                    type="button"
                    className="w-full rounded-md border p-2 text-left text-xs hover:bg-muted/50"
                    onClick={() =>
                      runAction(
                        { action: 'match_worker', worker_id: match.worker_id },
                        'Conversation matched to worker',
                      )
                    }
                  >
                    <span className="flex items-center gap-1 font-medium">
                      <UserRoundSearch className="h-3 w-3" />
                      {match.preferred_name || match.first_name} {match.last_name}
                    </span>
                    <span className="block truncate text-muted-foreground">
                      {[match.email, match.employer_name, match.worksite_name]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {worker && (
        <section className="space-y-2">
          {worker.email_opt_out ? (
            <>
              <Badge variant="destructive">
                <Ban className="mr-1 h-3 w-3" />
                Email opted out
              </Badge>
              <p className="text-xs text-muted-foreground">
                Source: {worker.email_opt_out_source || 'unknown'}
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full">
                    Lift opt-out
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Lift this worker&apos;s email opt-out?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Only continue if the worker has explicitly asked to receive
                      email again. This affects campaign sends as well as inbox replies.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        runAction(
                          { action: 'set_opt_out', opt_out: false },
                          'Email opt-out lifted',
                        )
                      }
                    >
                      Confirm consent
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <>
              <Badge variant="outline">
                <MailCheck className="mr-1 h-3 w-3" />
                Email permitted
              </Badge>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-destructive"
                  >
                    Do not contact by email
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Opt this worker out of all email?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This blocks campaign sends and one-to-one inbox replies.
                      Use it only for a clear unsubscribe request.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        runAction(
                          { action: 'set_opt_out', opt_out: true },
                          'Worker opted out of email',
                        )
                      }
                    >
                      Opt out
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </section>
      )}

      <Separator />

      <section className="space-y-2">
        {conversation.campaign && (
          <div className="rounded-md border bg-muted/20 p-2 text-xs">
            <p className="font-medium">{conversation.campaign.name}</p>
            <p className="text-muted-foreground">
              {[conversation.campaign.campaign_type, conversation.campaign.status]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {organisingUnits.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {organisingUnits.map(({ unit, is_primary }) => (
                  <Badge key={unit.ou_id} variant="outline" className="text-[10px]">
                    {unit.name}
                    {is_primary ? ' · primary' : ''}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor={assigneeId} className="text-xs">
            Assigned to
          </Label>
          <Select
            value={conversation.assignee_user_id ?? UNASSIGNED}
            onValueChange={(value) =>
              runAction(
                {
                  action: 'assign',
                  user_id: value === UNASSIGNED ? null : value,
                },
                'Assignment updated',
              )
            }
          >
            <SelectTrigger id={assigneeId} className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
              {staff.map((profile) => (
                <SelectItem key={profile.user_id} value={profile.user_id}>
                  {profile.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor={campaignSelectId} className="text-xs">
            Campaign
          </Label>
          <Select
            value={
              conversation.campaign_id != null
                ? String(conversation.campaign_id)
                : NO_CAMPAIGN
            }
            onValueChange={(value) =>
              runAction(
                {
                  action: 'attach',
                  campaign_id: value === NO_CAMPAIGN ? null : Number(value),
                },
                value === NO_CAMPAIGN
                  ? 'Campaign detached'
                  : 'Campaign updated',
              )
            }
          >
            <SelectTrigger id={campaignSelectId} className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CAMPAIGN}>Organisation-wide</SelectItem>
              {campaigns.map((campaign) => (
                <SelectItem
                  key={campaign.campaign_id}
                  value={String(campaign.campaign_id)}
                >
                  {campaign.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {conversation.state === 'closed' ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() =>
              runAction({ action: 'reopen' }, 'Conversation reopened')
            }
          >
            Reopen conversation
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => runAction({ action: 'close' }, 'Conversation closed')}
          >
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            Close conversation
          </Button>
        )}
      </section>

      <Separator />

      <section className="space-y-2">
        <Label className="text-xs">Saved replies</Label>
        {cannedReplies.length === 0 && (
          <p className="text-xs text-muted-foreground">No saved replies yet.</p>
        )}
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {cannedReplies.map((reply) => (
            <div key={reply.reply_id} className="flex items-stretch gap-1">
              <button
                type="button"
                className="min-w-0 flex-1 rounded-md border p-2 text-left text-xs hover:bg-muted/50"
                title={reply.body}
                onClick={() => onInsertSavedReply(reply.body)}
              >
                <span className="font-medium">{reply.title}</span>
                {reply.campaign_id == null && (
                  <span className="ml-1 text-muted-foreground">(org-wide)</span>
                )}
                <span className="block truncate text-muted-foreground">
                  {reply.body}
                </span>
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-auto w-8 shrink-0"
                    aria-label={`Archive saved reply ${reply.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Archive this saved reply?</AlertDialogTitle>
                    <AlertDialogDescription>
                      It will no longer appear in the inbox. Existing drafts are
                      not affected.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        archiveReply.mutate(reply.reply_id, {
                          onSuccess: () => toast.success('Saved reply archived'),
                          onError: (error: Error) => toast.error(error.message),
                        })
                      }
                    >
                      Archive
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          <Input
            value={savedTitle}
            className="h-8 text-xs"
            placeholder="Name this reply…"
            onChange={(event) => setSavedTitle(event.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            aria-label="Save current draft as a reusable reply"
            disabled={
              !savedTitle.trim() || !draft.body.trim() || createReply.isPending
            }
            onClick={() =>
              createReply.mutate(
                {
                  title: savedTitle.trim(),
                  body: draft.body.trim(),
                  campaign_id: conversation.campaign_id,
                },
                {
                  onSuccess: () => {
                    setSavedTitle('')
                    toast.success('Saved reply created')
                  },
                  onError: (error: Error) => toast.error(error.message),
                },
              )
            }
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </section>

      <Separator />

      <section className="space-y-2">
        <Label htmlFor={noteId} className="text-xs">
          Internal note
        </Label>
        <Textarea
          id={noteId}
          value={note}
          rows={2}
          className="resize-none text-xs"
          placeholder="Visible to staff only."
          onChange={(event) => setNote(event.target.value)}
        />
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={!note.trim() || addNote.isPending}
          onClick={() =>
            addNote.mutate(note.trim(), {
              onSuccess: () => {
                setNote('')
                toast.success('Internal note added')
              },
              onError: (error: Error) => toast.error(error.message),
            })
          }
        >
          {addNote.isPending ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <StickyNote className="mr-1 h-3 w-3" />
          )}
          Add note
        </Button>
      </section>

      {events.length > 0 && (
        <>
          <Separator />
          <section className="space-y-2">
            <Label className="text-xs">Workflow history</Label>
            <div className="space-y-1.5">
              {events
                .slice()
                .reverse()
                .slice(0, 12)
                .map((event) => (
                  <div key={event.event_id} className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {user_names[event.actor_user_id || ''] || 'System'}
                    </span>{' '}
                    {event.event_type.replaceAll('_', ' ')}
                  </div>
                ))}
            </div>
          </section>
        </>
      )}
    </aside>
  )
}
