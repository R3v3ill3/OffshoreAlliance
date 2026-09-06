'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import {
  AlertCircle,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Download,
  ImageOff,
  Paperclip,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  getEmailAttachmentUrl,
  openEmailAttachment,
} from '@/lib/hooks/useEmailInbox'
import type { EmailMessage } from '@/types/email-inbox'
import { toast } from 'sonner'

const subscribeToBrowser = () => () => undefined
const getBrowserSnapshot = () => true
const getServerSnapshot = () => false

function prepareEmailHtml(
  html: string,
  loadRemoteImages: boolean,
  expandQuotedHistory: boolean,
  inlineAttachmentUrls: Record<string, string>,
): string {
  const sanitised = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      'script',
      'style',
      'link',
      'meta',
      'base',
      'object',
      'embed',
      'iframe',
      'video',
      'audio',
      'source',
      'track',
      'picture',
      'svg',
      'math',
      'form',
      'input',
      'button',
    ],
    FORBID_ATTR: ['srcset', 'background', 'poster'],
    ADD_ATTR: ['target', 'rel'],
  })
  const document = new DOMParser().parseFromString(sanitised, 'text/html')
  for (const link of document.querySelectorAll('a')) {
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  }
  for (const image of document.querySelectorAll('img')) {
    const src = image.getAttribute('src') ?? ''
    if (!src.toLowerCase().startsWith('cid:')) continue
    let contentId = src.slice(4)
    try {
      contentId = decodeURIComponent(contentId)
    } catch {
      image.removeAttribute('src')
      image.setAttribute('alt', image.getAttribute('alt') || '[Inline image unavailable]')
      continue
    }
    contentId = contentId.replace(/^<|>$/g, '')
    const signedUrl = inlineAttachmentUrls[contentId]
    if (signedUrl) {
      image.setAttribute('src', signedUrl)
      image.setAttribute('data-email-inline', 'true')
    } else {
      image.removeAttribute('src')
      image.setAttribute('alt', image.getAttribute('alt') || '[Inline image unavailable]')
    }
  }
  if (!loadRemoteImages) {
    for (const image of document.querySelectorAll('img')) {
      if (image.getAttribute('data-email-inline') === 'true') continue
      const src = image.getAttribute('src') ?? ''
      if (/^(?:https?:)?\/\//i.test(src)) {
        image.removeAttribute('src')
        image.setAttribute('alt', image.getAttribute('alt') || '[Remote image blocked]')
      }
    }
    for (const element of document.querySelectorAll<HTMLElement>('[style]')) {
      const style = element.getAttribute('style') ?? ''
      if (/url\(\s*(['"]?)(?:https?:)?\/\//i.test(style)) {
        element.removeAttribute('style')
      }
    }
  }
  const baseStyles = `
    <style>
      :root { color-scheme: light; }
      body { margin: 0; padding: 12px; font: 14px/1.5 system-ui, sans-serif; color: #18181b; overflow-wrap: anywhere; }
      img { max-width: 100%; height: auto; }
      table { max-width: 100%; }
      blockquote { margin-left: 12px; padding-left: 10px; border-left: 2px solid #d4d4d8; color: #52525b; }
      ${
        expandQuotedHistory
          ? ''
          : 'blockquote, .gmail_quote, #divRplyFwdMsg { max-height: 5rem; overflow: hidden; opacity: .72; }'
      }
      a { color: #1d4ed8; }
    </style>
  `
  return `<!doctype html><html><head><base target="_blank">${baseStyles}</head><body>${document.body.innerHTML}</body></html>`
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function EmailMessageContent({
  message,
  showSubject,
}: {
  message: EmailMessage
  showSubject: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [loadRemoteImages, setLoadRemoteImages] = useState(false)
  const [inlineAttachmentUrls, setInlineAttachmentUrls] = useState<
    Record<string, string>
  >({})
  const isBrowser = useSyncExternalStore(
    subscribeToBrowser,
    getBrowserSnapshot,
    getServerSnapshot,
  )
  const hasRemoteImages =
    message.body_html != null &&
    /(?:<(?:img|source)\b[^>]*(?:src|srcset)\s*=\s*["']?(?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\/)/i.test(
      message.body_html,
    )
  const inlineAttachments = useMemo(
    () =>
      message.attachments.filter(
        (attachment) => attachment.is_inline && attachment.content_id,
      ),
    [message.attachments],
  )

  useEffect(() => {
    let cancelled = false
    void Promise.all(
      inlineAttachments.map(async (attachment) => {
        const contentId = attachment.content_id?.replace(/^<|>$/g, '')
        if (!contentId) return null
        try {
          const url = await getEmailAttachmentUrl(attachment.attachment_id)
          return [contentId, url] as const
        } catch {
          return null
        }
      }),
    ).then((entries) => {
      if (cancelled) return
      setInlineAttachmentUrls(
        Object.fromEntries(
          entries.filter((entry): entry is readonly [string, string] => entry != null),
        ),
      )
    })
    return () => {
      cancelled = true
    }
  }, [inlineAttachments])

  const html = useMemo(
    () =>
      isBrowser && message.body_html
        ? prepareEmailHtml(
            message.body_html,
            loadRemoteImages,
            expanded,
            inlineAttachmentUrls,
          )
        : null,
    [
      expanded,
      inlineAttachmentUrls,
      isBrowser,
      loadRemoteImages,
      message.body_html,
    ],
  )

  return (
    <div className="space-y-2">
      {showSubject && message.subject && (
        <div className="rounded-md bg-muted/60 px-2 py-1 text-xs">
          <span className="font-medium">Subject changed:</span> {message.subject}
        </div>
      )}

      {html ? (
        <div className="space-y-1.5">
          {message.body_text && (
            <div className="sr-only">
              Plain-text alternative: {message.body_text}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1">
            {hasRemoteImages && !loadRemoteImages && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => setLoadRemoteImages(true)}
              >
                <ImageOff className="mr-1 h-3 w-3" />
                Load remote images
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? (
                <ChevronUp className="mr-1 h-3 w-3" />
              ) : (
                <ChevronDown className="mr-1 h-3 w-3" />
              )}
              {expanded ? 'Collapse message' : 'Expand message'}
            </Button>
          </div>
          <iframe
            title={`${message.direction} email: ${message.subject || 'no subject'}`}
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            srcDoc={html}
            className={`w-full rounded-md border bg-white ${
              expanded ? 'h-[70vh]' : 'h-72'
            }`}
          />
        </div>
      ) : (
        <div className="whitespace-pre-wrap break-words text-sm">
          {message.body_text || <span className="italic text-muted-foreground">(empty message)</span>}
        </div>
      )}

      {message.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Attachments">
          {message.attachments.map((attachment) => (
            <Button
              key={attachment.attachment_id}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 max-w-full px-2 text-[11px]"
              onClick={() =>
                openEmailAttachment(attachment.attachment_id).catch((error: Error) =>
                  toast.error(error.message),
                )
              }
            >
              <Paperclip className="mr-1 h-3 w-3 shrink-0" />
              <span className="truncate">{attachment.filename}</span>
              {attachment.byte_size != null && (
                <span className="ml-1 text-muted-foreground">
                  {formatBytes(attachment.byte_size)}
                </span>
              )}
              <Download className="ml-1 h-3 w-3 shrink-0" />
            </Button>
          ))}
        </div>
      )}

      {message.direction === 'outbound' && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {message.status === 'delivered' ? (
            <>
              <CheckCheck className="h-3 w-3" /> Delivered
            </>
          ) : message.status === 'failed' ? (
            <>
              <AlertCircle className="h-3 w-3 text-destructive" />
              <span className="text-destructive">
                Failed{message.error ? `: ${message.error}` : ''}
              </span>
            </>
          ) : (
            <Badge variant="outline" className="h-5 text-[10px]">
              {message.status}
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}
