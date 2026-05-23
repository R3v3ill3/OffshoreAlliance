'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button } from '@/components/ui/button'
import { Mail, X } from 'lucide-react'
import { toast } from 'sonner'
import type { EmailEntryBranch } from '@/types/email-action'

interface Props {
  campaignId: number | string
}

interface DraftRow {
  draft_id: number
  campaign_id: number
  entry_branch: EmailEntryBranch
  email_list_id: number | null
  subject: string | null
}

/**
 * Surfaces in-progress campaign-scoped email drafts so the user can resume.
 *
 * Only matches drafts where `entry_branch IS NOT NULL` — that is, drafts
 * created by the new pathway/order pickers or by the build-list fire path.
 * Legacy standalone drafts (entry_branch IS NULL) are intentionally ignored
 * so the campaign page is not cluttered with every dashboard-side draft.
 */
export function EmailResumeBanner({ campaignId }: Props) {
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [dismissed, setDismissed] = useState(false)

  const { data: inProgressDraft } = useQuery<DraftRow | null>({
    queryKey: ['email-draft', 'in-progress', String(campaignId)],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('campaign_comms_drafts')
        .select('draft_id, campaign_id, entry_branch, email_list_id, subject')
        .eq('campaign_id', Number(campaignId))
        .eq('created_by', user.id)
        .eq('platform', 'email')
        .eq('status', 'draft')
        .not('entry_branch', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) return null
      return data ? (data as DraftRow) : null
    },
    enabled: !!user,
    retry: false,
  })

  const abandonMutation = useMutation({
    mutationFn: async (draftId: number) => {
      // Re-use 'failed' status as a soft-cancel marker (the existing CHECK
      // constraint on campaign_comms_drafts.status doesn't include
      // 'cancelled' — see migration 20260409100000_comms_draft_system.sql).
      const { error } = await supabase
        .from('campaign_comms_drafts')
        .update({ status: 'failed' })
        .eq('draft_id', draftId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['email-draft', 'in-progress', String(campaignId)],
      })
    },
    onError: (err) => {
      toast.error('Could not dismiss draft', {
        description: err instanceof Error ? err.message : String(err),
      })
    },
  })

  if (dismissed || !inProgressDraft) return null

  function handleDismiss() {
    setDismissed(true)
    if (inProgressDraft) {
      abandonMutation.mutate(inProgressDraft.draft_id)
    }
  }

  function handleResume() {
    if (!inProgressDraft) return
    const { draft_id, entry_branch, email_list_id } = inProgressDraft

    switch (entry_branch) {
      case 'ai_first':
      case 'paste_first':
        // Setup-first: draft was created but body may still be empty.
        // Drop the user back into the wizard.
        router.push(
          `/campaigns/${campaignId}/email/wizard?draft_id=${draft_id}&entry_branch=${entry_branch}`,
        )
        return
      case 'ai_list_first':
      case 'paste_list_first':
        // List-first: if the list isn't built yet, send back to lists/new.
        if (email_list_id == null) {
          router.push(
            `/campaigns/${campaignId}/email/lists/new?draft_id=${draft_id}&entry_branch=${entry_branch}`,
          )
          return
        }
        router.push(
          `/campaigns/${campaignId}/email/wizard?draft_id=${draft_id}&entry_branch=${entry_branch}`,
        )
        return
      case 'build_list':
        // Build-list fire: the email_list is already attached. Drop the
        // user straight into the wizard — pathway picker was removed.
        router.push(
          `/campaigns/${campaignId}/email/wizard?draft_id=${draft_id}&entry_branch=build_list`,
        )
        return
      default:
        router.push(`/campaigns/${campaignId}`)
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
      <Mail className="h-4 w-4 text-amber-600 flex-shrink-0" />
      <p className="flex-1 text-amber-800">
        You have an in-progress email draft for this campaign
        {inProgressDraft.subject ? ` — "${inProgressDraft.subject}"` : ''}.
      </p>
      <Button
        size="sm"
        variant="outline"
        className="border-amber-300 text-amber-800 hover:bg-amber-100"
        onClick={handleResume}
      >
        Resume
      </Button>
      <button
        type="button"
        aria-label="Dismiss"
        className="text-amber-500 hover:text-amber-700 transition-colors"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
