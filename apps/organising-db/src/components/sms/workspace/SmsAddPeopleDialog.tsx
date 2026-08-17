'use client'

/**
 * "Add people" mid-session, lifted out of SmsP2pBoard so the 3-pane
 * workspace keeps the capability when that board is retired (Phase 10).
 * Behaviour is unchanged: the same AudiencePicker, the same
 * standalone-mode overrides, the same POST …/p2p route.
 */
import { useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AudiencePicker,
  type AudienceValue,
} from '@/components/audience/AudiencePicker'
import { STANDALONE_AUDIENCE_PICKER } from '@/lib/sms/audience-helpers'

export interface SmsAddPeopleDialogProps {
  campaignId: string
  standaloneMode?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  onSubmit: (input: {
    worker_ids?: number[]
    audience?:
      | { type: 'worker_list'; worker_list_id: number }
      | { type: 'campaign' }
  }) => void
}

export function SmsAddPeopleDialog({
  campaignId,
  standaloneMode = false,
  open,
  onOpenChange,
  pending,
  onSubmit,
}: SmsAddPeopleDialogProps) {
  const [audience, setAudience] = useState<AudienceValue>({
    mode: 'composed',
    worker_ids: [],
  })

  const submit = () => {
    if (audience.mode === 'campaign') {
      onSubmit({ audience: { type: 'campaign' } })
    } else if (audience.mode === 'worker_list') {
      onSubmit({
        audience: {
          type: 'worker_list',
          worker_list_id: audience.worker_list_id,
        },
      })
    } else {
      onSubmit({ worker_ids: audience.worker_ids })
    }
  }

  const emptyComposed =
    audience.mode === 'composed' && audience.worker_ids.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add people to the board</DialogTitle>
          <DialogDescription>
            People already on the board are skipped; opted-out members and
            members without a mobile are added but not sendable.
          </DialogDescription>
        </DialogHeader>
        <AudiencePicker
          channel="sms"
          campaignId={campaignId}
          value={audience}
          onChange={setAudience}
          disabled={pending}
          {...(standaloneMode ? STANDALONE_AUDIENCE_PICKER : {})}
        />
        <DialogFooter>
          <Button disabled={pending || emptyComposed} onClick={submit}>
            {pending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-1.5 h-4 w-4" />
            )}
            Add to board
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
