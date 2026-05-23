'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Users } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: number | string
  draftId: number
}

interface DraftRow {
  draft_id: number
  email_list_id: number | null
}

/**
 * Mid-session setup editor for the campaign-scoped email orchestrator.
 *
 * Currently surfaces a single action: detach the email_list and route the
 * user back to /email/lists/new so they can rebuild or pick a different
 * list. Body pathway (AI / paste / template) is no longer selected here —
 * the body step itself exposes all three options inline.
 */
export function EditEmailSetupDialog({ open, onOpenChange, campaignId, draftId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [isSaving, setIsSaving] = useState(false)

  const { data: draft } = useQuery<DraftRow | null>({
    queryKey: ['email-draft-setup', draftId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_comms_drafts')
        .select('draft_id, email_list_id')
        .eq('draft_id', draftId)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as DraftRow | null
    },
    enabled: open && draftId != null,
  })

  async function handleDetachList() {
    setIsSaving(true)
    try {
      const { error } = await supabase
        .from('campaign_comms_drafts')
        .update({ email_list_id: null })
        .eq('draft_id', draftId)
      if (error) throw error
      onOpenChange(false)
      router.push(`/campaigns/${campaignId}/email/lists/new?draft_id=${draftId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to detach list')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit email setup</DialogTitle>
          <DialogDescription>
            Replace the recipient list attached to this draft. Subject and
            body text are preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label className="text-sm font-semibold">Recipient list</Label>
          {draft?.email_list_id ? (
            <div className="flex items-center justify-between rounded-md border p-3 text-sm">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                email_list #{draft.email_list_id} is attached
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDetachList}
                disabled={isSaving}
              >
                Replace
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No persisted list attached. Recipients are pulled from the
              inline filter at the send step.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
