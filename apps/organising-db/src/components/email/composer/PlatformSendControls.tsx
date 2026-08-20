'use client'

/**
 * PlatformSendControls — the composer's on-platform (SendGrid) send
 * path, rendered alongside the existing Action Network / Outlook
 * actions in SendActions.
 *
 * Flow:
 *   1. "Platform email" dropdown → queue send (confirmation dialog with
 *      wrapper picker + recipient/skip counts) or test-send-to-self.
 *   2. Queueing creates an email_list in 'queued' status; the
 *      dispatch-email-queue cron drains it within ~5 minutes inside the
 *      send window.
 *   3. Once queued, the control shows live progress + engagement from
 *      /platform-stats (poll while the list is active).
 */

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ChevronDown,
  Loader2,
  Rocket,
  Send,
  TestTube2,
} from 'lucide-react'
import { toast } from 'sonner'
import { isValidEmail } from '@/lib/comms/mailto-builder'
import { fetchApi, API_FETCH_TIMEOUT_UPLOAD_MS } from '@/lib/api/fetch-api'

interface WrapperRow {
  wrapper_id: number
  name: string
  is_default: boolean
  is_active: boolean
}

interface PlatformStats {
  draft_status: string | null
  sent_via: string | null
  list: {
    list_id: number
    list_status: string
    item_count: number
    pending_count: number
    queued_count: number
    sending_count: number
    sent_count: number
    delivered_count: number
    failed_count: number
    skipped_count: number
    bounced_count: number
    unsubscribed_count: number
    opted_out_count: number
  } | null
  engagement: {
    total: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    unsubscribed: number
    replied: number
  }
}

export interface PlatformSendControlsProps {
  campaignId?: number
  draftId?: number | null
  selectedWorkerIds?: number[]
  recipientCount: number
  hasBody: boolean
  disabled?: boolean
  userEmail?: string | null
}

export function PlatformSendControls({
  campaignId,
  draftId,
  selectedWorkerIds,
  recipientCount,
  hasBody,
  disabled,
  userEmail,
}: PlatformSendControlsProps) {
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [wrapperId, setWrapperId] = useState<string>('')
  const [testRecipient, setTestRecipient] = useState('')

  const ready = !!campaignId && !!draftId

  const { data: wrappers } = useQuery({
    queryKey: ['email-wrappers'],
    queryFn: async () => {
      const res = await fetchApi('/api/email/wrappers')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load wrappers')
      return (json.wrappers as WrapperRow[]).filter((w) => w.is_active)
    },
    enabled: ready,
    staleTime: 60_000,
  })
  const defaultWrapper = useMemo(
    () => (wrappers ?? []).find((w) => w.is_default) ?? (wrappers ?? [])[0],
    [wrappers],
  )
  const effectiveWrapperId = wrapperId || (defaultWrapper ? String(defaultWrapper.wrapper_id) : '')

  const { data: stats } = useQuery({
    queryKey: ['email-platform-stats', campaignId, draftId],
    queryFn: async () => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/emails/${draftId}/platform-stats`,
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load stats')
      return json as PlatformStats
    },
    enabled: ready,
    refetchInterval: (query) => {
      const s = query.state.data?.list?.list_status
      return s === 'queued' || s === 'sending' ? 10_000 : false
    },
  })

  const queueMutation = useMutation({
    mutationFn: async () => {
      const ids = (selectedWorkerIds ?? []).slice()
      if (ids.length === 0) throw new Error('No recipients selected.')
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/emails/${draftId}/queue-platform-send`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worker_ids: ids,
            wrapper_id: effectiveWrapperId ? Number(effectiveWrapperId) : null,
          }),
          timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
        },
      )
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Queue failed')
      return json as { queued: number; skipped: number; opted_out: number }
    },
    onSuccess: (data) => {
      setConfirmOpen(false)
      const extras = [
        data.skipped > 0 ? `${data.skipped} skipped` : null,
        data.opted_out > 0 ? `${data.opted_out} unsubscribed` : null,
      ]
        .filter(Boolean)
        .join(', ')
      toast.success(
        `Queued ${data.queued} email${data.queued === 1 ? '' : 's'} for platform send` +
          (extras ? ` (${extras})` : '') +
          '. The dispatcher sends within ~5 minutes inside the send window.',
      )
      void queryClient.invalidateQueries({
        queryKey: ['email-platform-stats', campaignId, draftId],
      })
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Queue failed'),
  })

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/emails/${draftId}/send-test-via-platform`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient_email: testRecipient.trim(),
            wrapper_id: effectiveWrapperId ? Number(effectiveWrapperId) : null,
          }),
          timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
        },
      )
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Test send failed')
      return json as { from: string; wrapper: string }
    },
    onSuccess: (data) => {
      setTestOpen(false)
      toast.success(
        `Test email sent from ${data.from} (wrapper "${data.wrapper}") to ${testRecipient.trim()}.`,
      )
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Test send failed'),
  })

  const list = stats?.list
  const inFlight = list?.list_status === 'queued' || list?.list_status === 'sending'
  const doneCount = list
    ? list.sent_count + list.delivered_count + list.failed_count + list.bounced_count
    : 0

  return (
    <>
      {list && (
        <Badge
          variant="secondary"
          className="text-xs"
          title={
            `Platform send — ${list.list_status}. ` +
            `${list.sent_count} sent, ${list.delivered_count} delivered, ` +
            `${list.failed_count} failed, ${list.skipped_count} skipped, ` +
            `${list.opted_out_count} unsubscribed. ` +
            `Opens ${stats?.engagement.opened ?? 0}, clicks ${stats?.engagement.clicked ?? 0}.`
          }
        >
          {inFlight ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Rocket className="h-3 w-3 mr-1" />
          )}
          Platform: {doneCount}/{list.item_count} {list.list_status}
          {(stats?.engagement.opened ?? 0) > 0 &&
            ` · ${stats?.engagement.opened} opened`}
        </Badge>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!ready || disabled}
          >
            <Rocket className="h-3.5 w-3.5 mr-1.5" />
            Platform email
            <ChevronDown className="h-3 w-3 ml-1.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">
            Send from the platform (SendGrid — reveille.net.au)
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => {
              setTestRecipient(userEmail ?? '')
              setTestOpen(true)
            }}
            className="flex-col items-start gap-0.5 py-2"
            disabled={!hasBody}
          >
            <span className="text-sm flex items-center gap-1.5">
              <TestTube2 className="h-3.5 w-3.5" />
              Send test to me
            </span>
            <span className="text-[11px] text-muted-foreground">
              One [TEST] email through the real pipeline — wrapper, merge
              fields and unsubscribe link included.
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setConfirmOpen(true)}
            className="flex-col items-start gap-0.5 py-2"
            disabled={!hasBody || recipientCount === 0 || inFlight}
          >
            <span className="text-sm flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5 text-red-600" />
              Queue send to {recipientCount} recipient{recipientCount === 1 ? '' : 's'}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {inFlight
                ? 'A platform send is already in flight for this draft.'
                : 'Queues the list; the dispatcher sends within ~5 minutes inside the 09:00–20:00 window. Irreversible once dispatched.'}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Queue confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              Queue platform send
            </DialogTitle>
            <DialogDescription className="text-xs">
              {recipientCount} selected recipient
              {recipientCount === 1 ? '' : 's'}. Workers with no email, a
              bounced address or an email unsubscribe are skipped and
              recorded. Merge fields resolve per recipient at send time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Wrapper</Label>
              <Select
                value={effectiveWrapperId}
                onValueChange={setWrapperId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select wrapper" />
                </SelectTrigger>
                <SelectContent>
                  {(wrappers ?? []).map((w) => (
                    <SelectItem key={w.wrapper_id} value={String(w.wrapper_id)}>
                      {w.name}
                      {w.is_default ? ' (default)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(wrappers ?? []).length === 0 && (
                <p className="text-[11px] text-amber-700">
                  No active wrappers — create one at /email/wrappers first.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={queueMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => queueMutation.mutate()}
              disabled={queueMutation.isPending || !effectiveWrapperId}
            >
              {queueMutation.isPending && (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              )}
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Queue {recipientCount} email{recipientCount === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test send */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              Send a platform test email
            </DialogTitle>
            <DialogDescription className="text-xs">
              Sends one [TEST] email via SendGrid with the wrapper applied
              and sample recipient data. Does not mark the draft as sent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="platform-test-recipient" className="text-xs">
              Recipient
            </Label>
            <Input
              id="platform-test-recipient"
              type="email"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              placeholder="you@example.org"
              className="text-sm"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setTestOpen(false)}
              disabled={testMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!isValidEmail(testRecipient.trim())) {
                  toast.error('Enter a valid test recipient email.')
                  return
                }
                testMutation.mutate()
              }}
              disabled={testMutation.isPending}
            >
              {testMutation.isPending && (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              )}
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Send test email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
