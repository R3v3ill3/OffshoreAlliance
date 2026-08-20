'use client'

/**
 * SendActions — the composer's footer bar with four send paths:
 *   1. Push to Action Network (existing flow, identical behaviour).
 *   2. Save to Outlook drafts via OAuth (personalised per-recipient or
 *      shared BCC), plus optional direct send from the connected mailbox.
 *   3. Platform email (SendGrid) — queue an on-platform send drained by
 *      the dispatch cron, plus a platform test send (PlatformSendControls).
 *   4. Send test — single recipient via Outlook direct send (Mail.Send).
 */

import { useEffect, useMemo, useState } from 'react'
import { useOutlookConnection } from '@/lib/hooks/useOutlookConnection'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Send,
  Loader2,
  Mail,
  ChevronDown,
  AlertTriangle,
  TestTube2,
  ExternalLink,
  Inbox,
  Users as UsersIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { isValidEmail } from '@/lib/comms/mailto-builder'
import {
  resolveTemplateVariables,
  translateToActionNetwork,
} from '@/lib/comms/template-variables'
import { extractMergeFieldKeys } from '@/lib/comms/chip-html'
import type { AnalysedRecipient } from '@/lib/comms/bcc-token-analysis'
import { BccPreSendDialog } from './BccPreSendDialog'
import { DirectSendConfirmDialog } from './DirectSendConfirmDialog'
import { PlatformSendControls } from './PlatformSendControls'
import { fetchApi, API_FETCH_TIMEOUT_UPLOAD_MS } from '@/lib/api/fetch-api'

export interface SendActionsProps {
  /** Logged-in user's email (default for test send). */
  userEmail?: string | null
  /** Campaign variable resolution context. */
  varContext: Record<string, string | undefined>
  /** Subject as typed (may contain {{tokens}}). */
  subject: string
  /** Sanitised HTML body. */
  bodyHtml: string
  /** Plain-text body (fallback for mailto and .eml/text part). */
  bodyText: string
  /** Selected recipient emails (already filtered + deduped). */
  recipientEmails: string[]
  /** Total count of selected recipients (for live label). */
  recipientCount: number
  /** Has a body been authored? */
  hasBody: boolean
  /** Existing AN tag identity, if push-list has already run. */
  preparedTag: {
    tag_id: string
    tag_href: string
    tag_name: string
    contacts_tagged: number
    contacts_created: number
    /** AN-side verified count read back via GET /tags/{id}/taggings. */
    verified_tag_count?: number | null
    /**
     * Server-confirmed tagging writes (from each addTaggingByPersonId
     * response). Authoritative because it reflects what AN's write
     * primary acknowledged, not what its read replicas currently show.
     */
    write_confirmed_count?: number | null
    /** AN UI URL for the tag (browser_url from the tag resource). */
    tag_browser_url?: string | null
    /** Set when AN's read-back is lower than expected, or fetch failed. */
    verification_warning?: string | null
    /** AN person IDs returned by the push-list worker results. */
    worker_an_ids: string[]
  } | null
  externalMessageId: string | null
  /** AN message admin URL captured from the create-message response. */
  administrativeUrl?: string | null
  isPushingList: boolean
  isPushingToAN: boolean
  /** Handler for the push-list step. */
  onPushList: () => void
  /** Handler for the create-message step. */
  onCreateMessage: () => void
  /** Handler for saving drafts to the user's connected Outlook mailbox. */
  onSaveToOutlook?: (
    mode: 'personalised' | 'bcc',
    overrides?: { subjectOverride: string; bodyHtmlOverride: string },
  ) => Promise<{
    drafts_created: number
    drafts_failed: number
  } | null>
  /** Optional disable for save-state synchronization. */
  disabled?: boolean
  campaignId?: number
  draftId?: number | null
  selectedWorkerIds?: number[]
  /**
   * Full worker data for the selected recipients — used to pre-classify
   * merge tokens before BCC dispatch (`{{employer_name}}` resolvable
   * across the whole list vs. `{{first_name}}` varying per recipient).
   */
  recipientWorkers?: AnalysedRecipient[]
}

interface VerifyAnTagResult {
  success: true
  tag_total: number
  expected_total: number
  matched_in_tag: number
  matched_per_person: number
  consistent: boolean
  tag_browser_url: string | null
}

export function SendActions({
  userEmail,
  varContext,
  subject,
  bodyHtml,
  bodyText,
  recipientEmails,
  recipientCount,
  hasBody,
  preparedTag,
  externalMessageId,
  administrativeUrl,
  isPushingList,
  isPushingToAN,
  onPushList,
  onCreateMessage,
  onSaveToOutlook,
  disabled,
  campaignId,
  draftId,
  selectedWorkerIds,
  recipientWorkers,
}: SendActionsProps) {
  const [testOpen, setTestOpen] = useState(false)
  const [bccPreSendOpen, setBccPreSendOpen] = useState(false)
  const [outlookBusy, setOutlookBusy] = useState<'personalised' | 'bcc' | null>(null)
  const {
    connection: outlook,
    connect: connectOutlook,
    reconsent: reconsentOutlook,
    disconnect: disconnectOutlook,
  } = useOutlookConnection()
  const [directSendMode, setDirectSendMode] = useState<
    'personalised' | 'bcc' | null
  >(null)
  const [directSendBusy, setDirectSendBusy] = useState(false)
  const [verifyAnBusy, setVerifyAnBusy] = useState(false)
  const [verifyAnResult, setVerifyAnResult] = useState<VerifyAnTagResult | null>(null)

  useEffect(() => {
    setVerifyAnResult(null)
  }, [preparedTag?.tag_id])

  // Any known merge token present in the body? Drives whether we open
  // the pre-send analysis dialog for BCC dispatches.
  const anyMergeTokens = useMemo(
    () =>
      extractMergeFieldKeys(`${subject}\n\n${bodyHtml || bodyText}`).length > 0,
    [subject, bodyHtml, bodyText],
  )

  async function handleVerifyAnTag() {
    if (!campaignId || !preparedTag?.tag_id) {
      toast.error('Composer is missing the Action Network tag context.')
      return
    }
    if (preparedTag.worker_an_ids.length === 0) {
      toast.error('No Action Network worker IDs are available to verify.')
      return
    }

    setVerifyAnBusy(true)
    try {
      const params = new URLSearchParams({
        tagId: preparedTag.tag_id,
        sampleAnIds: preparedTag.worker_an_ids.join(','),
      })
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/verify-an-tag?${params.toString()}`,
        { timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS },
      )
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Action Network verification failed')
      }
      setVerifyAnResult(data as VerifyAnTagResult)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action Network verification failed')
    } finally {
      setVerifyAnBusy(false)
    }
  }

  async function handleSaveToOutlook(
    mode: 'personalised' | 'bcc',
    overrides?: { subjectOverride: string; bodyHtmlOverride: string },
  ) {
    if (!onSaveToOutlook) return
    if (!outlook?.connected) {
      connectOutlook()
      return
    }
    if (!hasBody) {
      toast.error('Write the email body first.')
      return
    }
    if (recipientEmails.length === 0) {
      toast.error('No recipients selected.')
      return
    }
    // BCC mode + tokens detected → open the pre-send analysis dialog so
    // the user can decide what to do with varying / missing tokens.
    if (
      mode === 'bcc' &&
      !overrides &&
      anyMergeTokens &&
      recipientWorkers &&
      recipientWorkers.length > 0
    ) {
      setBccPreSendOpen(true)
      return
    }
    setOutlookBusy(mode)
    try {
      const result = await onSaveToOutlook(mode, overrides)
      if (result) {
        if (mode === 'personalised') {
          toast.success(
            `${result.drafts_created} draft${result.drafts_created === 1 ? '' : 's'} saved to ${outlook.email}` +
              (result.drafts_failed
                ? ` (${result.drafts_failed} failed)`
                : '. Open Outlook to review and send.'),
          )
        } else {
          if (result.drafts_created > 0) {
            toast.success(
              `Draft saved to ${outlook.email}. Open Outlook to review and send.`,
            )
          } else {
            toast.error('Outlook draft could not be created.')
          }
        }
      }
    } finally {
      setOutlookBusy(null)
    }
  }

  function handleBccApply(overrides: {
    subjectOverride: string
    bodyHtmlOverride: string
    bodyTextOverride: string
  }) {
    setBccPreSendOpen(false)
    void handleSaveToOutlook('bcc', {
      subjectOverride: overrides.subjectOverride,
      bodyHtmlOverride: overrides.bodyHtmlOverride,
    })
  }

  /**
   * Confirm direct-send (the irreversible action). Fires the
   * /send-via-outlook route with no body/subject overrides — the user
   * is sending what they see in the preview iframe.
   */
  async function handleDirectSendConfirm() {
    if (!directSendMode) return
    if (!campaignId || !draftId) {
      toast.error('Composer not ready — try again.')
      return
    }
    setDirectSendBusy(true)
    try {
      const ids = (selectedWorkerIds ?? []).slice()
      if (ids.length === 0) {
        toast.error('No recipients selected.')
        return
      }
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/emails/${draftId}/send-via-outlook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: directSendMode, worker_ids: ids }),
          timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
        },
      )
      const data = await res.json()
      if (!res.ok || !data.success) {
        if (data?.needs_reconsent) {
          toast.error(
            'Outlook is missing Mail.Send permission. Reconnect to enable direct send.',
          )
          reconsentOutlook()
        } else if (data?.needs_connection) {
          toast.error('Outlook not connected — connect first.')
        } else {
          toast.error(data?.error || 'Direct send failed.')
        }
        return
      }
      const failed = data.failed_count ?? 0
      const sent = data.sent_count ?? 0
      if (failed > 0) {
        toast.warning(
          `Sent ${sent} of ${sent + failed} — ${failed} failed.`,
        )
      } else {
        toast.success(
          `Sent ${sent} email${sent === 1 ? '' : 's'} from ${outlook?.email ?? 'your mailbox'}.`,
        )
      }
      setDirectSendMode(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Direct send failed.')
    } finally {
      setDirectSendBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between border-t bg-background px-4 py-3">
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <Badge variant="secondary" className="text-xs">
          {recipientCount} recipient{recipientCount === 1 ? '' : 's'}
        </Badge>
        {externalMessageId && (
          <span className="text-xs text-green-700 flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            AN draft {externalMessageId.slice(0, 8)}…
            {administrativeUrl && (
              <a
                href={administrativeUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="underline ml-1"
                title="Open the draft in Action Network to set tag-based targeting before sending"
              >
                Open in AN
              </a>
            )}
            {preparedTag?.tag_name && (
              <span className="text-amber-700 ml-1">
                — target tag &quot;{preparedTag.tag_name}&quot; in AN before sending
              </span>
            )}
          </span>
        )}
        {preparedTag && !externalMessageId && (() => {
          // Prefer the server-confirmed write count over the read-back —
          // AN's read replicas can lag the primary by minutes, but if AN
          // returned tagging resources for our writes, we know the data is
          // there. Only fall back to the read count if write-confirmed
          // isn't available (older API responses).
          const writeConfirmed = preparedTag.write_confirmed_count
          const readCount = preparedTag.verified_tag_count
          const pushedTotal = preparedTag.contacts_tagged + preparedTag.contacts_created
          const isReadLag =
            typeof writeConfirmed === 'number' &&
            typeof readCount === 'number' &&
            writeConfirmed > 0 &&
            readCount < writeConfirmed
          const verifyLabel = verifyAnResult
            ? verifyAnResult.consistent &&
              verifyAnResult.tag_total >= verifyAnResult.expected_total
              ? `✓ Verified: ${verifyAnResult.tag_total} activists on tag`
              : verifyAnResult.consistent &&
                  verifyAnResult.tag_total < verifyAnResult.expected_total
                ? `Tagging confirmed (${verifyAnResult.matched_per_person}/${verifyAnResult.expected_total} from person view). AN's tag list still shows ${verifyAnResult.tag_total}, will catch up.`
                : `Only ${verifyAnResult.matched_per_person} of ${verifyAnResult.expected_total} confirmed on AN — investigate worker results`
            : null
          // "warning" tone: a real failure (write-confirmed < pushed)
          // "info" tone: read lag (writes confirmed but read API still catching up)
          // "success" tone: both confirmed and read agree
          const hasRealFailure = preparedTag.verification_warning && !isReadLag
          const tone = verifyAnResult
            ? verifyAnResult.consistent &&
              verifyAnResult.tag_total >= verifyAnResult.expected_total
              ? 'text-green-700'
              : verifyAnResult.consistent
                ? 'text-blue-700'
                : 'text-amber-700'
            : hasRealFailure
              ? 'text-amber-700'
              : isReadLag
                ? 'text-blue-700'
                : 'text-green-700'
          const displayCount =
            typeof writeConfirmed === 'number'
              ? writeConfirmed
              : typeof readCount === 'number'
                ? readCount
                : pushedTotal
          const label =
            verifyLabel ??
            (typeof writeConfirmed === 'number'
              ? `${displayCount} confirmed on AN${
                  isReadLag ? ` (${readCount ?? 0} visible — read lag, will catch up)` : ''
                }`
              : typeof readCount === 'number'
                ? `${readCount} verified on AN`
                : `${pushedTotal} pushed`)
          return (
            <span
              className={`text-xs flex items-center gap-1 flex-wrap ${tone}`}
              title={preparedTag.verification_warning ?? undefined}
            >
              {(hasRealFailure || (verifyAnResult && !verifyAnResult.consistent)) && (
                <AlertTriangle className="h-3 w-3" />
              )}
              Tag {preparedTag.tag_name} ({label})
              {preparedTag.tag_browser_url && (
                <a
                  href={preparedTag.tag_browser_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline ml-1 hover:no-underline"
                >
                  Open tag in AN
                </a>
              )}
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => void handleVerifyAnTag()}
                disabled={verifyAnBusy || preparedTag.worker_an_ids.length === 0}
                className="h-auto px-1 py-0 text-xs underline hover:no-underline"
              >
                {verifyAnBusy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Verify with AN
              </Button>
            </span>
          )
        })()}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setTestOpen(true)}
          disabled={!hasBody || disabled}
        >
          <TestTube2 className="h-3.5 w-3.5 mr-1.5" />
          Send test…
        </Button>

        <PlatformSendControls
          campaignId={campaignId}
          draftId={draftId}
          selectedWorkerIds={selectedWorkerIds}
          recipientCount={recipientCount}
          hasBody={hasBody}
          disabled={disabled}
          userEmail={userEmail}
        />

        {onSaveToOutlook && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  !hasBody || disabled || recipientEmails.length === 0 || !!outlookBusy
                }
              >
                {outlookBusy ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Inbox className="h-3.5 w-3.5 mr-1.5" />
                )}
                {outlook?.connected ? 'Save to Outlook' : 'Outlook…'}
                <ChevronDown className="h-3 w-3 ml-1.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">
                Save drafts to your Outlook mailbox
              </DropdownMenuLabel>
              {outlook?.connected ? (
                <>
                  <div className="px-2 py-1.5 text-[11px] text-muted-foreground border-b">
                    Connected as <strong>{outlook.email}</strong>
                  </div>
                  <DropdownMenuItem
                    onClick={() => void handleSaveToOutlook('personalised')}
                    className="flex-col items-start gap-0.5 py-2"
                    disabled={!!outlookBusy || !!directSendBusy}
                  >
                    <span className="text-sm flex items-center gap-1.5">
                      <UsersIcon className="h-3.5 w-3.5" />
                      Save personalised drafts ({recipientCount})
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      One draft per recipient with {`{{first_name}}`} resolved
                      per-worker. Queued in your Outlook Drafts for review.
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      outlook.has_send_scope
                        ? setDirectSendMode('personalised')
                        : reconsentOutlook()
                    }
                    className="flex-col items-start gap-0.5 py-2"
                    disabled={!!outlookBusy || !!directSendBusy}
                  >
                    <span className="text-sm flex items-center gap-1.5">
                      <Send className="h-3.5 w-3.5 text-red-600" />
                      Send personalised now from my mailbox
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {outlook.has_send_scope
                        ? `Sends ${recipientCount} personalised emails directly. Irreversible.`
                        : 'Requires Mail.Send permission — click to reconnect Outlook with extra scope.'}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => void handleSaveToOutlook('bcc')}
                    className="flex-col items-start gap-0.5 py-2"
                    disabled={!!outlookBusy || !!directSendBusy}
                  >
                    <span className="text-sm flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      Save shared BCC draft
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      One draft with all {recipientCount} recipients in BCC.
                      Variable-resolution dialog opens first if tokens are present.
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      outlook.has_send_scope
                        ? setDirectSendMode('bcc')
                        : reconsentOutlook()
                    }
                    className="flex-col items-start gap-0.5 py-2"
                    disabled={!!outlookBusy || !!directSendBusy}
                  >
                    <span className="text-sm flex items-center gap-1.5">
                      <Send className="h-3.5 w-3.5 text-red-600" />
                      Send shared BCC now from my mailbox
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {outlook.has_send_scope
                        ? 'Sends one BCC email to all recipients directly. Irreversible.'
                        : 'Requires Mail.Send permission — click to reconnect Outlook with extra scope.'}
                    </span>
                  </DropdownMenuItem>
                  {!outlook.has_send_scope && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => reconsentOutlook()}
                        className="py-1.5 text-[11px] text-amber-700"
                      >
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Reconnect to enable direct send
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => void disconnectOutlook()}
                    className="py-1.5 text-[11px] text-muted-foreground"
                  >
                    Disconnect Outlook
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem
                  onClick={() => connectOutlook()}
                  className="flex-col items-start gap-0.5 py-2"
                >
                  <span className="text-sm flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    Connect Outlook
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Authorise OA to save drafts to your Microsoft 365 mailbox.
                    You&apos;ll be redirected to Microsoft to sign in.
                  </span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {!preparedTag ? (
          <Button
            type="button"
            size="sm"
            onClick={onPushList}
            disabled={
              !hasBody || disabled || isPushingList || recipientEmails.length === 0
            }
          >
            {isPushingList ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1.5" />
            )}
            Push to Action Network ({recipientCount})
          </Button>
        ) : !externalMessageId ? (
          <Button
            type="button"
            size="sm"
            onClick={onCreateMessage}
            disabled={!hasBody || disabled || isPushingToAN}
          >
            {isPushingToAN ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Mail className="h-3.5 w-3.5 mr-1.5" />
            )}
            Create message in AN
          </Button>
        ) : (
          <Badge variant="secondary" className="px-3 py-1.5 text-xs">
            Sent via Action Network
          </Badge>
        )}
      </div>

      <SendTestDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        defaultRecipient={userEmail ?? ''}
        campaignId={campaignId}
        draftId={draftId}
        outlook={outlook}
        connectOutlook={connectOutlook}
        reconsentOutlook={reconsentOutlook}
      />

      <BccPreSendDialog
        open={bccPreSendOpen}
        onOpenChange={setBccPreSendOpen}
        subject={subject}
        bodyHtml={bodyHtml}
        bodyText={bodyText}
        recipients={recipientWorkers ?? []}
        campaignContext={varContext}
        onApply={handleBccApply}
        actionLabel="saving to Outlook"
      />

      <DirectSendConfirmDialog
        open={directSendMode !== null}
        onOpenChange={(o) => {
          if (!o) setDirectSendMode(null)
        }}
        mode={directSendMode ?? 'personalised'}
        mailboxEmail={outlook?.email ?? null}
        recipientCount={recipientEmails.length}
        recipientPreview={recipientEmails}
        subject={subject}
        bodyHtml={bodyHtml}
        submitting={directSendBusy}
        onConfirm={() => void handleDirectSendConfirm()}
      />

    </div>
  )
}

interface SendTestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultRecipient: string
  campaignId?: number
  draftId?: number | null
  outlook: ReturnType<typeof useOutlookConnection>['connection']
  connectOutlook: () => void
  reconsentOutlook: () => void
}

function SendTestDialog({
  open,
  onOpenChange,
  defaultRecipient,
  campaignId,
  draftId,
  outlook,
  connectOutlook,
  reconsentOutlook,
}: SendTestDialogProps) {
  const [recipient, setRecipient] = useState(defaultRecipient)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) setRecipient(defaultRecipient)
  }, [open, defaultRecipient])

  async function handleSendTest() {
    if (!campaignId || !draftId) {
      toast.error('Composer not ready — try again.')
      return
    }
    if (!outlook?.connected) {
      connectOutlook()
      return
    }
    if (!outlook.has_send_scope) {
      toast.error(
        'Outlook is missing Mail.Send permission. Reconnect to send test emails.',
      )
      reconsentOutlook()
      return
    }
    if (!isValidEmail(recipient)) {
      toast.error('Enter a valid test recipient email.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/emails/${draftId}/send-test-via-outlook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipient_email: recipient.trim() }),
          timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
        },
      )
      const data = await res.json()
      if (!res.ok || !data.success) {
        if (data?.needs_reconsent) {
          toast.error(
            'Outlook is missing Mail.Send permission. Reconnect to send test emails.',
          )
          reconsentOutlook()
        } else if (data?.needs_connection) {
          toast.error('Outlook not connected — connect first.')
          connectOutlook()
        } else {
          toast.error(data?.error || 'Test send failed.')
        }
        return
      }
      toast.success(
        `Test email sent from ${data.mailbox ?? outlook.email} to ${recipient.trim()}.`,
      )
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test send failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Send a test email</DialogTitle>
          <DialogDescription className="text-xs">
            Sends directly from your connected Outlook mailbox, prefixed with{' '}
            <code>[TEST]</code>. Recipient merge fields use sample data. Does
            not mark the draft as sent.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {outlook?.connected ? (
            <p className="text-[11px] text-muted-foreground">
              From <strong>{outlook.email}</strong>
              {!outlook.has_send_scope && (
                <span className="text-amber-700">
                  {' '}
                  — reconnect Outlook to enable sending.
                </span>
              )}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Connect Outlook to send a test from your mailbox.
            </p>
          )}
          <div className="space-y-1">
            <Label htmlFor="test-recipient" className="text-xs">
              Recipient
            </Label>
            <Input
              id="test-recipient"
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="you@example.org"
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleSendTest()} disabled={submitting}>
            {submitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {outlook?.connected ? 'Send test email' : 'Connect Outlook'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Helper for the parent composer: take a sanitised body containing
 * `{{key}}` tokens and turn it into the AN-ready HTML where recipient
 * tokens become `[contact.first_name]` markers. Used by the
 * Push-to-AN flow before sending the message payload.
 */
export function prepareForActionNetwork(
  body: string,
  varContext: Record<string, string | undefined>,
): string {
  return translateToActionNetwork(resolveTemplateVariables(body, varContext))
}
