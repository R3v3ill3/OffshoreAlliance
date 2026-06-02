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
import { Trash2, Phone, Mail, Loader2 } from 'lucide-react'

interface OutreachCleanupPanelProps {
  campaignId: string | number
}

type CleanupScope = 'phone_actions' | 'email_drafts' | 'all'

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
      toast.success(parts.length > 0 ? `Deleted: ${parts.join(', ')}` : 'Nothing to delete')

      // Invalidate all related queries
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

  const scopeLabel: Record<CleanupScope, string> = {
    phone_actions: 'all phone call actions and call lists',
    email_drafts: 'all email drafts and email lists',
    all: 'all phone and email test data',
  }

  return (
    <>
      <Accordion type="single" collapsible>
        <AccordionItem value="cleanup" className="border rounded-lg px-3">
          <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline text-muted-foreground">
            <span className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              Outreach Cleanup
              {(phoneCount > 0 || emailCount > 0) && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {phoneCount + emailCount} items
                </Badge>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              Remove phone call actions and email drafts created during testing. This
              permanently deletes the records and clears the in-progress banners.
            </p>

            {/* Phone actions */}
            <Card className="border-dashed">
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Phone Call Actions</span>
                    <Badge variant="secondary" className="text-xs">{phoneCount}</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={phoneCount === 0 || cleanupMutation.isPending}
                    onClick={() => setPendingScope('phone_actions')}
                  >
                    {cleanupMutation.isPending && cleanupMutation.variables === 'phone_actions' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Delete All
                  </Button>
                </div>
                {phoneActions.length > 0 ? (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {phoneActions.map((a) => (
                      <div key={a.action_id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge
                          variant={a.status === 'in_progress' ? 'warning' : 'secondary'}
                          className="text-xs shrink-0"
                        >
                          {a.status}
                        </Badge>
                        <span className="truncate">{a.entry_branch}</span>
                        <span className="shrink-0">{a.list_ids?.length ?? 0} list{(a.list_ids?.length ?? 0) !== 1 ? 's' : ''}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No phone call actions found.</p>
                )}
              </CardContent>
            </Card>

            {/* Email drafts */}
            <Card className="border-dashed">
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Email / Comms Drafts</span>
                    <Badge variant="secondary" className="text-xs">{emailCount}</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={emailCount === 0 || cleanupMutation.isPending}
                    onClick={() => setPendingScope('email_drafts')}
                  >
                    {cleanupMutation.isPending && cleanupMutation.variables === 'email_drafts' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Delete All
                  </Button>
                </div>
                {emailDrafts.length > 0 ? (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {emailDrafts.map((d) => (
                      <div key={d.draft_id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-xs shrink-0">{d.status}</Badge>
                        <Badge variant="outline" className="text-xs shrink-0">{d.platform}</Badge>
                        <span className="truncate">{d.title ?? d.subject ?? 'Untitled'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No email drafts found.</p>
                )}
              </CardContent>
            </Card>

            {/* Delete all */}
            {(phoneCount > 0 || emailCount > 0) && (
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
                Delete All Phone & Email Data
              </Button>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <AlertDialog open={pendingScope != null} onOpenChange={(open) => { if (!open) setPendingScope(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete outreach data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              {pendingScope ? scopeLabel[pendingScope] : ''}{' '}
              for this campaign. Call attempts, outcomes, and recipient lists will also be
              removed. This cannot be undone.
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
