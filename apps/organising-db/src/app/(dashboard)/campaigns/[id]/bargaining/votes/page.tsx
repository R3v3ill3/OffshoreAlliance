'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useCampaign } from '@/lib/hooks/usePlannerCampaigns'
import { EndorsementVoteList } from '@/components/campaigns/bargaining/EndorsementVoteList'
import { EndorsementVoteEditor } from '@/components/campaigns/bargaining/EndorsementVoteEditor'
import { useEndorsementVotes } from '@/hooks/useEndorsementVotes'
import { Button } from '@/components/ui/button'
import { ChevronRight, Vote, Plus } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function BargainingVotesPage({ params }: PageProps) {
  const { id } = use(params)
  const campaignId = parseInt(id)

  const { data: campaign, isLoading: campaignLoading } = useCampaign(campaignId)
  const { data: endorsementVotes, isLoading: votesLoading } = useEndorsementVotes(campaignId)
  const [newVoteDialogOpen, setNewVoteDialogOpen] = useState(false)

  const hasVotes = Array.isArray(endorsementVotes) && endorsementVotes.length > 0

  if (campaignLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-64" />
          <div className="h-48 bg-slate-200 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/campaigns" className="hover:text-foreground">Campaigns</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/campaigns/${campaignId}`} className="hover:text-foreground">
          {campaign?.name ?? 'Campaign'}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/campaigns/${campaignId}/bargaining`} className="hover:text-foreground">
          Bargaining
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span>Endorsement Votes</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Vote className="h-5 w-5 text-slate-500" />
          <h1 className="text-2xl font-bold text-slate-900">Endorsement Votes</h1>
        </div>
        <Button onClick={() => setNewVoteDialogOpen(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New vote
        </Button>
      </div>

      {votesLoading && (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-200 rounded" />
          ))}
        </div>
      )}

      {!votesLoading && !hasVotes && (
        /* Empty state */
        <div className="border rounded-lg p-10 text-center bg-slate-50">
          <Vote className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No endorsement votes recorded yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Record member votes on industrial action, agreement endorsement, or other key
            decisions here to track participation and outcomes.
          </p>
          <Button size="sm" onClick={() => setNewVoteDialogOpen(true)} className="mt-4 gap-1.5">
            <Plus className="h-4 w-4" />
            New vote
          </Button>
        </div>
      )}

      {!votesLoading && hasVotes && (
        <EndorsementVoteList campaignId={campaignId} />
      )}

      <EndorsementVoteEditor
        campaignId={campaignId}
        open={newVoteDialogOpen}
        onOpenChange={setNewVoteDialogOpen}
      />
    </div>
  )
}
