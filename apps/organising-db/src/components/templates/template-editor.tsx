'use client'

import { useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Variable } from 'lucide-react'

const COMMON_VARIABLES = [
  '{{first_name}}',
  '{{last_name}}',
  '{{agreement_name}}',
  '{{employer_name}}',
  '{{worksite_name}}',
  '{{organiser_name}}',
  '{{organiser_phone}}',
  '{{date}}',
  '{{campaign_name}}',
] as const

const SAMPLE_DATA: Record<string, string> = {
  first_name: 'Alex',
  last_name: 'Mitchell',
  agreement_name: 'Woodside FPSO EA 2026',
  employer_name: 'Woodside Energy',
  worksite_name: 'North West Shelf',
  organiser_name: 'Sarah Chen',
  organiser_phone: '0412 345 678',
  date: '15 April 2026',
  campaign_name: 'NWS Bargaining 2026',
}

function detectVariables(text: string): string[] {
  const matches = text.match(/\{\{(\w+)\}\}/g)
  if (!matches) return []
  return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, '')))]
}

function renderPreview(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return SAMPLE_DATA[key] ?? `[${key}]`
  })
}

function getSmsSegmentInfo(text: string): { chars: number; segments: number } {
  const chars = text.length
  if (chars <= 160) return { chars, segments: 1 }
  return { chars, segments: Math.ceil(chars / 153) }
}

interface TemplateEditorProps {
  value: string
  onChange: (value: string) => void
  platform: 'email' | 'sms' | 'phone_script'
}

export function TemplateEditor({ value, onChange, platform }: TemplateEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const detectedVars = useMemo(() => detectVariables(value), [value])
  const preview = useMemo(() => renderPreview(value), [value])
  const smsInfo = useMemo(
    () => (platform === 'sms' ? getSmsSegmentInfo(value) : null),
    [value, platform],
  )

  const insertVariable = (variable: string) => {
    const textarea = textareaRef.current
    if (!textarea) {
      onChange(value + variable)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newValue = value.substring(0, start) + variable + value.substring(end)
    onChange(newValue)

    requestAnimationFrame(() => {
      const pos = start + variable.length
      textarea.setSelectionRange(pos, pos)
      textarea.focus()
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Variable className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            Insert variable
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COMMON_VARIABLES.map((v) => (
            <Button
              key={v}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs font-mono"
              onClick={() => insertVariable(v)}
            >
              {v}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={platform === 'sms' ? 6 : 12}
          placeholder={
            platform === 'email'
              ? 'Paste or type your email template here...'
              : platform === 'sms'
                ? 'Type your SMS message...'
                : 'Type your phone script...'
          }
          className="font-mono text-sm"
        />
        {smsInfo && (
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            <span>
              {smsInfo.chars} character{smsInfo.chars !== 1 ? 's' : ''}
            </span>
            <span
              className={
                smsInfo.segments > 1 ? 'text-amber-600 font-medium' : ''
              }
            >
              {smsInfo.segments} SMS segment{smsInfo.segments !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {detectedVars.length > 0 && (
        <div>
          <span className="text-sm font-medium text-muted-foreground">
            Detected variables
          </span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {detectedVars.map((v) => (
              <Badge key={v} variant="secondary" className="font-mono text-xs">
                {`{{${v}}}`}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {value.trim() && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Preview (with sample data)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm whitespace-pre-wrap">{preview}</div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
