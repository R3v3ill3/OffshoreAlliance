'use client'

/**
 * The SMS testing roster, managed inline from the survey editor.
 *
 * Test mode sends here and nowhere else, so this list is the whole
 * answer to "who will actually receive this test?" — a question the
 * default-on Test switch never used to answer.
 *
 * Two scopes: the org-wide roster every campaign inherits, and testers
 * added for this campaign only.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Search, Trash2, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { fetchApi } from '@/lib/api/fetch-api'
import { toDisplay } from '@/lib/phone/normalise-phone'
import { TEST_AUDIENCE_CAP } from '@/lib/sms/survey-test-audience'

interface TestRecipient {
  test_recipient_id: number
  worker_id: number
  campaign_id: number | null
  scope: 'org' | 'campaign'
  label: string | null
  name: string
  phone_e164: string | null
  sms_opt_out: boolean
}

interface WorkerHit {
  worker_id: number
  first_name: string
  last_name: string
  phone_e164: string | null
  sms_opt_out: boolean
  employer_name: string | null
}

export function SmsTestRecipients({ campaignId }: { campaignId: string }) {
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['sms-test-recipients', campaignId],
    queryFn: async () => {
      const res = await fetchApi(
        `/api/sms/test-recipients?campaign_id=${campaignId}`,
      )
      if (!res.ok) throw new Error('Failed to load test recipients')
      return res.json() as Promise<{ recipients: TestRecipient[] }>
    },
  })

  const recipients = data?.recipients ?? []
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['sms-test-recipients', campaignId] })

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetchApi(`/api/sms/test-recipients?test_recipient_id=${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Failed to remove')
      }
    },
    onSuccess: () => {
      invalidate()
      toast.success('Removed from the test roster')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const overCap = recipients.length > TEST_AUDIENCE_CAP

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label>Test recipients</Label>
          <p className="text-xs text-muted-foreground">
            While Test mode is on, this survey sends only to these people —
            never to the campaign audience.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <UserPlus className="mr-1 h-3.5 w-3.5" />
          Add tester
        </Button>
      </div>

      {isLoading ? (
        <p className="py-2 text-xs text-muted-foreground">Loading…</p>
      ) : recipients.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          No test recipients yet. Add at least one before opening the test —
          a test send with an empty roster is refused rather than falling
          back to the campaign.
        </p>
      ) : (
        <div className="divide-y rounded-md border">
          {recipients.map((r) => (
            <div
              key={r.test_recipient_id}
              className="flex items-center gap-2 px-2 py-1.5 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">
                {r.name || `Worker #${r.worker_id}`}
                <span className="ml-2 text-xs text-muted-foreground">
                  {r.phone_e164 ? toDisplay(r.phone_e164) : 'no mobile'}
                </span>
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {r.scope === 'org' ? 'All campaigns' : 'This campaign'}
              </Badge>
              {r.sms_opt_out && (
                <Badge
                  variant="secondary"
                  className="bg-amber-100 text-[10px] text-amber-800"
                >
                  opted out
                </Badge>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate(r.test_recipient_id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {overCap && (
        <p className="text-xs text-amber-700">
          {recipients.length} testers — test sends are capped at{' '}
          {TEST_AUDIENCE_CAP}. Trim the roster before opening a test.
        </p>
      )}

      <AddTesterDialog
        campaignId={campaignId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={invalidate}
      />
    </div>
  )
}

/**
 * Adds an existing worker to the roster. Testers must be workers —
 * sms_survey_sessions.worker_id is NOT NULL, so a session cannot exist
 * for a bare phone number.
 */
function AddTesterDialog({
  campaignId,
  open,
  onOpenChange,
  onAdded,
}: {
  campaignId: string
  open: boolean
  onOpenChange: (v: boolean) => void
  onAdded: () => void
}) {
  const [term, setTerm] = useState('')
  const [scope, setScope] = useState<'org' | 'campaign'>('org')

  const { data, isFetching } = useQuery({
    queryKey: ['sms-test-recipient-search', campaignId, term],
    queryFn: async () => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-audience/search?q=${encodeURIComponent(
          term.trim(),
        )}&scope=org`,
      )
      if (!res.ok) throw new Error('Search failed')
      return res.json() as Promise<{ workers: WorkerHit[] }>
    },
    enabled: open && term.trim().length >= 2,
  })

  const add = useMutation({
    mutationFn: async (worker: WorkerHit) => {
      const res = await fetchApi('/api/sms/test-recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: worker.worker_id,
          campaign_id: scope === 'campaign' ? Number(campaignId) : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Failed to add')
      }
    },
    onSuccess: () => {
      onAdded()
      toast.success('Added to the test roster')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setTerm('')
        onOpenChange(v)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a test recipient</DialogTitle>
          <DialogDescription>
            Search by first or last name. Testers need a worker record with a
            mobile — use &ldquo;Add person&rdquo; in an audience picker first
            if a colleague is not in the database.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={scope === 'org' ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => setScope('org')}
            >
              All campaigns
            </Button>
            <Button
              size="sm"
              variant={scope === 'campaign' ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => setScope('campaign')}
            >
              This campaign only
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              className="pl-8"
              placeholder="Search everyone by name…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>

          <div className="max-h-64 divide-y overflow-y-auto rounded-md border">
            {term.trim().length < 2 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Type at least two characters.
              </p>
            ) : isFetching ? (
              <p className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching…
              </p>
            ) : (data?.workers ?? []).length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                No matches.
              </p>
            ) : (
              (data?.workers ?? []).map((w) => (
                <div
                  key={w.worker_id}
                  className="flex items-center gap-2 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {w.first_name} {w.last_name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {w.phone_e164 ? toDisplay(w.phone_e164) : 'No mobile on file'}
                      {w.employer_name ? ` · ${w.employer_name}` : ''}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={add.isPending || !w.phone_e164}
                    title={
                      w.phone_e164
                        ? 'Add to the test roster'
                        : 'No mobile on file — a test send could not reach them'
                    }
                    onClick={() => add.mutate(w)}
                  >
                    Add
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
