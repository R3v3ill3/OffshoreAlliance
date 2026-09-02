'use client'

/**
 * SMS chat workspace — the 3-pane roster / conversation / member view
 * (Phase 10, decision 8c). Sibling of the existing sms/setup segment
 * under the /campaigns/[id]/sms/** family (brief §A decision 2).
 *
 * Why its own route rather than the board sheet it replaces: the sheet
 * is capped at sm:max-w-4xl with a max-h-[55vh] table, which cannot
 * hold three panes. A workspace also wants a URL — deep-linkable and
 * resumable across sessions.
 *
 * Height: (dashboard)/layout.tsx is h-screen overflow-hidden with main
 * as flex-1 overflow-y-auto p-6, so main has a definite height and an
 * h-full child fills it. The negative margin cancels main's gutter so
 * the workspace runs edge to edge; at 1280px those 48px are the
 * difference between a comfortable and a cramped middle pane.
 */
import { useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/supabase/auth-context'
import { createClient } from '@/lib/supabase/client'
import { SmsChatWorkspace } from '@/components/sms/workspace/SmsChatWorkspace'

export default function SmsChatWorkspacePage() {
  const params = useParams<{ id: string; listId: string }>()
  const router = useRouter()
  const { canWrite } = useAuth()

  const campaignId = params?.id ?? ''
  const listId = useMemo(() => {
    const parsed = parseInt(params?.listId ?? '', 10)
    return Number.isFinite(parsed) ? parsed : null
  }, [params?.listId])

  // A standalone board's campaign is a hidden episode: the workspace
  // then offers the org-wide audience picker rather than campaign lists.
  const { data: isEpisode } = useQuery({
    queryKey: ['sms-chat-campaign-is-episode', campaignId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('campaigns')
        .select('is_sms_episode')
        .eq('campaign_id', Number(campaignId))
        .maybeSingle()
      if (error) throw error
      return !!data?.is_sms_episode
    },
    enabled: !!campaignId && Number.isFinite(Number(campaignId)),
    staleTime: 5 * 60_000,
  })

  if (!campaignId || listId == null) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          That chat board link is not valid.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => router.push('/campaigns')}
        >
          <ArrowLeft className="mr-1 h-3.5 w-3.5" />
          Back to campaigns
        </Button>
      </div>
    )
  }

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] min-h-0 flex-col">
      <SmsChatWorkspace
        campaignId={campaignId}
        listId={listId}
        canWrite={!!canWrite}
        standaloneMode={!!isEpisode}
      />
    </div>
  )
}
