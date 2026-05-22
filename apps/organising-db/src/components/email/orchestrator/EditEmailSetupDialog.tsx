'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Sparkles, PenLine, Users } from 'lucide-react'
import {
  entryBranchForEmail,
  orderForEmail,
  pathwayForEmail,
  type EmailEntryBranch,
  type EmailPathway,
} from '@/types/email-action'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: number | string
  draftId: number
}

interface DraftRow {
  draft_id: number
  entry_branch: EmailEntryBranch | null
  email_list_id: number | null
}

/**
 * Mid-session setup editor for the campaign-scoped email orchestrator.
 *
 * Lets the user:
 *   • flip the pathway (AI ↔ paste). The body itself is preserved — the
 *     pathway flag just controls future auto-generation behaviour.
 *   • detach the email_list, sending them back to /email/lists/new to
 *     rebuild or pick a different list.
 *
 * Mirrors the role of EditCallSetupDialog in the phone orchestrator but is
 * intentionally lighter — email has no assessment-id / variation-count
 * concepts to surface here.
 */
export function EditEmailSetupDialog({ open, onOpenChange, campaignId, draftId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [pathway, setPathway] = useState<EmailPathway>('ai')
  const [isSaving, setIsSaving] = useState(false)

  const { data: draft } = useQuery<DraftRow | null>({
    queryKey: ['email-draft-setup', draftId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_comms_drafts')
        .select('draft_id, entry_branch, email_list_id')
        .eq('draft_id', draftId)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as DraftRow | null
    },
    enabled: open && draftId != null,
  })

  useEffect(() => {
    if (draft?.entry_branch) {
      setPathway(pathwayForEmail(draft.entry_branch))
    }
  }, [draft])

  async function handleSavePathway() {
    if (!draft?.entry_branch) return
    setIsSaving(true)
    try {
      const order = orderForEmail(draft.entry_branch)
      const newBranch = entryBranchForEmail(pathway, order)
      const { error } = await supabase
        .from('campaign_comms_drafts')
        .update({ entry_branch: newBranch })
        .eq('draft_id', draftId)
      if (error) throw error
      toast.success('Pathway updated')
      queryClient.invalidateQueries({ queryKey: ['email-draft-setup', draftId] })
      queryClient.invalidateQueries({ queryKey: ['email-draft', 'in-progress', String(campaignId)] })
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update pathway')
    } finally {
      setIsSaving(false)
    }
  }

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
            Switch the body pathway or replace the recipient list. Subject and
            body text are preserved when the pathway flag changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Body pathway</Label>
            <RadioGroup
              value={pathway}
              onValueChange={(v) => setPathway(v as EmailPathway)}
              className="grid gap-2"
            >
              <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="ai" className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-medium">AI-assisted</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    AI generates a draft. You can edit or regenerate.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="paste" className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <PenLine className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">Paste / write</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Empty editor; paste or type your own copy.
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>

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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSavePathway} disabled={isSaving || !draft?.entry_branch}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
