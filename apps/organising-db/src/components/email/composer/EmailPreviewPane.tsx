'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Monitor, Smartphone, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { resolveScriptVariables, SAMPLE_DATA } from '@/lib/comms/template-variables'
import DOMPurify from 'isomorphic-dompurify'

export interface PreviewSampleContact {
  id: string
  label: string
  first_name?: string
  last_name?: string
  occupation?: string | null
  email?: string | null
}

interface Props {
  subject: string
  preheader: string
  bodyHtml: string
  /** Plain text fallback if no HTML; preserves newlines. */
  bodyText: string
  /** Campaign-context variables (employer, organiser, etc) — resolved before render. */
  campaignContext: Record<string, string | undefined>
  fromName?: string
  fromEmail?: string
  sampleContacts?: PreviewSampleContact[]
}

export function EmailPreviewPane({
  subject,
  preheader,
  bodyHtml,
  bodyText,
  campaignContext,
  fromName = 'Offshore Alliance',
  fromEmail = 'info@offshorealliance.org.au',
  sampleContacts,
}: Props) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [dark, setDark] = useState(false)
  const [selectedContactId, setSelectedContactId] = useState<string>('sample')

  const contacts: PreviewSampleContact[] = useMemo(() => {
    const base: PreviewSampleContact = {
      id: 'sample',
      label: 'Sample contact (Alex Mitchell)',
      first_name: SAMPLE_DATA.first_name,
      last_name: SAMPLE_DATA.last_name,
      occupation: SAMPLE_DATA.occupation,
    }
    return [base, ...(sampleContacts ?? [])]
  }, [sampleContacts])

  const activeContact =
    contacts.find((c) => c.id === selectedContactId) ?? contacts[0]

  const previewContext = useMemo(
    () => ({
      ...campaignContext,
      first_name: activeContact?.first_name ?? SAMPLE_DATA.first_name,
      last_name: activeContact?.last_name ?? SAMPLE_DATA.last_name,
      occupation: activeContact?.occupation ?? SAMPLE_DATA.occupation,
    }),
    [campaignContext, activeContact],
  )

  const resolvedSubject = useMemo(
    () => resolveScriptVariables(subject || '(no subject)', previewContext),
    [subject, previewContext],
  )
  const resolvedPreheader = useMemo(
    () => resolveScriptVariables(preheader || '', previewContext),
    [preheader, previewContext],
  )
  const resolvedBodyHtml = useMemo(() => {
    const html =
      bodyHtml && bodyHtml.trim()
        ? bodyHtml
        : textToHtmlBlocks(bodyText)
    return DOMPurify.sanitize(resolveScriptVariables(html, previewContext), {
      ALLOWED_TAGS: [
        'p',
        'br',
        'strong',
        'em',
        'u',
        'a',
        'ul',
        'ol',
        'li',
        'h2',
        'h3',
        'blockquote',
      ],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
    }) as string
  }, [bodyHtml, bodyText, previewContext])

  return (
    <div className="h-full flex flex-col bg-muted/20">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-background flex-wrap">
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
          Preview
        </Badge>
        <DeviceToggle device={device} onChange={setDevice} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          aria-label={dark ? 'Switch to light preview' : 'Switch to dark preview'}
          onClick={() => setDark((d) => !d)}
          aria-pressed={dark}
        >
          {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </Button>
        <div className="ml-auto">
          <Select value={selectedContactId} onValueChange={setSelectedContactId}>
            <SelectTrigger className="h-7 text-xs min-w-[200px]">
              <SelectValue placeholder="Preview as…" />
            </SelectTrigger>
            <SelectContent>
              {contacts.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 flex justify-center">
        <PreviewFrame
          device={device}
          dark={dark}
          fromName={fromName}
          fromEmail={fromEmail}
          subject={resolvedSubject}
          preheader={resolvedPreheader}
          bodyHtml={resolvedBodyHtml}
        />
      </div>
    </div>
  )
}

function DeviceToggle({
  device,
  onChange,
}: {
  device: 'desktop' | 'mobile'
  onChange: (d: 'desktop' | 'mobile') => void
}) {
  return (
    <div role="group" aria-label="Preview device" className="flex items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={device === 'desktop'}
        className={cn('h-7 w-7 p-0', device === 'desktop' && 'bg-accent')}
        onClick={() => onChange('desktop')}
        aria-label="Desktop preview"
      >
        <Monitor className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={device === 'mobile'}
        className={cn('h-7 w-7 p-0', device === 'mobile' && 'bg-accent')}
        onClick={() => onChange('mobile')}
        aria-label="Mobile preview"
      >
        <Smartphone className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function PreviewFrame({
  device,
  dark,
  fromName,
  fromEmail,
  subject,
  preheader,
  bodyHtml,
}: {
  device: 'desktop' | 'mobile'
  dark: boolean
  fromName: string
  fromEmail: string
  subject: string
  preheader: string
  bodyHtml: string
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [debounced, setDebounced] = useState({ subject, preheader, bodyHtml })

  useEffect(() => {
    const t = setTimeout(() => setDebounced({ subject, preheader, bodyHtml }), 200)
    return () => clearTimeout(t)
  }, [subject, preheader, bodyHtml])

  const srcDoc = useMemo(
    () => buildSrcDoc({ ...debounced, dark }),
    [debounced, dark],
  )

  const width = device === 'mobile' ? 375 : 640
  const containerClass = cn(
    'rounded-md border shadow-sm overflow-hidden flex flex-col w-full transition-all',
    dark ? 'bg-zinc-900 border-zinc-700' : 'bg-white',
  )

  return (
    <div className={containerClass} style={{ maxWidth: width }}>
      <div
        className={cn(
          'px-3 py-2 border-b text-xs',
          dark
            ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
            : 'bg-muted/40 border-border',
        )}
      >
        <p className="font-semibold truncate">{fromName}</p>
        <p className="text-[10px] text-muted-foreground truncate">{fromEmail}</p>
        <p className="font-medium mt-1 truncate">{debounced.subject}</p>
        {debounced.preheader && (
          <p className="text-[11px] text-muted-foreground truncate">
            {debounced.preheader}
          </p>
        )}
      </div>
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        sandbox="allow-same-origin"
        className={cn(
          'w-full border-0',
          device === 'mobile' ? 'min-h-[480px]' : 'min-h-[420px]',
        )}
        title="Email preview"
      />
    </div>
  )
}

function buildSrcDoc({
  subject,
  preheader,
  bodyHtml,
  dark,
}: {
  subject: string
  preheader: string
  bodyHtml: string
  dark: boolean
}): string {
  const bg = dark ? '#18181b' : '#ffffff'
  const fg = dark ? '#e4e4e7' : '#0f172a'
  const muted = dark ? '#a1a1aa' : '#64748b'
  const linkColor = dark ? '#60a5fa' : '#2563eb'
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    subject,
  )}</title><style>
    body { margin: 0; padding: 16px 20px; background: ${bg}; color: ${fg}; font: 15px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .preheader { color: ${muted}; font-size: 11px; margin-bottom: 12px; }
    a { color: ${linkColor}; }
    p { margin: 0 0 12px; }
    h2 { font-size: 18px; margin: 16px 0 8px; }
    h3 { font-size: 16px; margin: 14px 0 6px; }
    ul, ol { margin: 0 0 12px 20px; padding: 0; }
    li { margin-bottom: 4px; }
    blockquote { border-left: 3px solid ${muted}; margin: 0 0 12px; padding-left: 12px; color: ${muted}; }
  </style></head><body>${preheader ? `<div class="preheader">${escapeHtml(preheader)}</div>` : ''}${bodyHtml}</body></html>`
}

function textToHtmlBlocks(text: string): string {
  if (!text) return ''
  return text
    .split(/\n{2,}/)
    .map(
      (para) =>
        `<p>${escapeHtml(para)
          .replace(/\n/g, '<br>')}</p>`,
    )
    .join('')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
