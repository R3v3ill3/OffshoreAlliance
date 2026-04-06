'use client'

import { useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDeleteCampaign } from '@/lib/hooks/useCampaigns'
import { toast } from 'sonner'

export type CampaignDeleteTarget = { campaign_id: number; name: string }

function deleteErrorMessage(err: unknown): string {
  const msg =
    err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
      ? (err as { message: string }).message
      : 'Could not delete campaign.'
  if (msg.includes('not_authorized')) {
    return 'You do not have permission to delete this campaign (lead organiser or admin only).'
  }
  if (msg.includes('campaign_not_found')) {
    return 'This campaign no longer exists.'
  }
  return msg
}

export function CampaignDeleteDialog({
  campaign,
  onClose,
}: {
  campaign: CampaignDeleteTarget | null
  onClose: () => void
}) {
  const [confirmName, setConfirmName] = useState('')
  const deleteMutation = useDeleteCampaign()
  const open = campaign != null
  const nameMatches =
    campaign != null && confirmName.trim().length > 0 && confirmName.trim() === campaign.name.trim()

  useEffect(() => {
    if (campaign) setConfirmName('')
  }, [campaign])

  async function handleDelete() {
    if (!campaign || !nameMatches) return
    try {
      await deleteMutation.mutateAsync(campaign.campaign_id)
      toast.success('Campaign deleted')
      onClose()
    } catch (e) {
      toast.error(deleteErrorMessage(e))
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left text-sm text-muted-foreground">
              <p>
                This permanently removes this campaign, including its plan, gates, timeline, organising data, and
                related records. This cannot be undone.
              </p>
              {campaign && (
                <p className="font-medium text-foreground">
                  Type <span className="whitespace-pre-wrap break-words">&quot;{campaign.name}&quot;</span> to
                  confirm.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="delete-campaign-name">Campaign name</Label>
          <Input
            id="delete-campaign-name"
            autoComplete="off"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder="Exact name"
            disabled={deleteMutation.isPending}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={!nameMatches || deleteMutation.isPending}
            onClick={() => void handleDelete()}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete campaign'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
