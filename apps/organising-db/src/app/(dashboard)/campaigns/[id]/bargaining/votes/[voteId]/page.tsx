'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useCampaign } from '@/lib/hooks/usePlannerCampaigns'
import { EndorsementResultsCard } from '@/components/campaigns/bargaining/EndorsementResultsCard'
import { EndorsementVoteEditor } from '@/components/campaigns/bargaining/EndorsementVoteEditor'
import { useEndorsementVotes } from '@/hooks/useEndorsementVotes'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ChevronRight, Vote, Pencil } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string; voteId: string }>
}

export default function BargainingVoteDetailPage({ params }: PageProps) {
  const { id, voteId } = use(params)
  const campaignId = parseInt(id)
  const voteIdNum = parseInt(voteId)

  const { data: campaign, isLoading: campaignLoading } = useCampaign(campaignId)
  const { data: endorsementVotes, isLoading: votesLoading } = useEndorsementVotes(campaignId)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  const vote = Array.isArray(endorsementVotes)
    ? (endorsementVotes as any[]).find((v: any) => v.id === voteIdNum)
    : null

  if (campaignLoading || votesLoading) {
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
        <Link href={`/campaigns/${campaignId}/bargaining/votes`} className="hover:text-foreground">
          Votes
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span>{vote?.title ?? `Vote #${voteId}`}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Vote className="h-5 w-5 text-slate-500" />
          <h1 className="text-2xl font-bold text-slate-900">
            {vote?.title ?? `Vote #${voteId}`}
          </h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setEditDialogOpen(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit vote
        </Button>
      </div>

      {!vote ? (
        <div className="border rounded-lg p-10 text-center bg-slate-50">
          <Vote className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">Vote not found</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href={`/campaigns/${campaignId}/bargaining/votes`}>
              Back to votes
            </Link>
          </Button>
        </div>
      ) : (
        <EndorsementResultsCard voteId={voteIdNum} campaignId={campaignId} />
      )}

      {/* Edit vote dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Vote</DialogTitle>
          </DialogHeader>
          <EndorsementVoteEditor
            campaignId={campaignId}
            voteId={voteIdNum}
            onSuccess={() => setEditDialogOpen(false)}
            onCancel={() => setEditDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
