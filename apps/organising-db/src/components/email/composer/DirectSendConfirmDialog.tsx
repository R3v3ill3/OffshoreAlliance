'use client'

/**
 * DirectSendConfirmDialog — final irreversible-action guard before we
 * call /api/.../send-via-outlook. Shows recipient count, first few
 * addresses, subject, and a sandboxed body preview. Cancel returns the
 * user to the composer; the primary CTA is destructive-coloured to
 * emphasise that send is irreversible.
 */

import { useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Send, Loader2 } from 'lucide-react'

export interface DirectSendConfirmProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'personalised' | 'bcc'
  mailboxEmail?: string | null
  recipientCount: number
  recipientPreview: string[]
  subject: string
  bodyHtml: string
  submitting: boolean
  onConfirm: () => void
}

export function DirectSendConfirmDialog({
  open,
  onOpenChange,
  mode,
  mailboxEmail,
  recipientCount,
  recipientPreview,
  subject,
  bodyHtml,
  submitting,
  onConfirm,
}: DirectSendConfirmProps) {
  const previewSrc = useMemo(() => {
    const styled = `<!doctype html><html><head><style>body{font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;color:#0f172a;padding:8px;margin:0}p{margin:0 0 8px 0}a{color:#2563eb}</style></head><body>${bodyHtml || '<em>(empty body)</em>'}</body></html>`
    return styled
  }, [bodyHtml])

  const headline =
    mode === 'personalised'
      ? `Send ${recipientCount} personalised emails`
      : `Send to ${recipientCount} recipients (BCC)`

  const subhead =
    mode === 'personalised'
      ? `Each recipient gets their own copy with merge variables resolved. This sends from ${mailboxEmail ?? 'your mailbox'} immediately and cannot be undone.`
      : `One email with all recipients in BCC. This sends from ${mailboxEmail ?? 'your mailbox'} immediately and cannot be undone.`

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            {headline}
          </DialogTitle>
          <DialogDescription className="text-xs">{subhead}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          <section className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              From
            </div>
            <div className="text-sm">{mailboxEmail ?? 'Your mailbox'}</div>
          </section>

          <section className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              {mode === 'personalised' ? 'To (per recipient)' : 'BCC'}
              <Badge variant="outline" className="text-[9px] py-0">
                {recipientCount}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground line-clamp-2">
              {recipientPreview.slice(0, 6).join(', ')}
              {recipientPreview.length > 6
                ? ` +${recipientPreview.length - 6} more`
                : ''}
            </div>
          </section>

          <section className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Subject
            </div>
            <div className="text-sm font-medium">{subject || '(no subject)'}</div>
          </section>

          <section className="space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Body preview
            </div>
            <iframe
              title="Body preview"
              srcDoc={previewSrc}
              className="w-full h-64 rounded border bg-background"
              sandbox=""
            />
          </section>
        </div>

        <DialogFooter className="border-t pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send to {recipientCount} now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
