'use client'

/**
 * AiBriefPanel — right-rail sheet for AI draft generation.
 *
 * Owns tone, audience, intensity, and the email-purpose / brief textarea.
 * Mirrors the original wizard's "Generate with AI" flow but lives as an
 * always-available side panel instead of being baked into step 2.
 */

import { useCallback } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Sparkles } from 'lucide-react'
import type { TemplateRow } from '@/lib/hooks/useTemplateLibrary'
import {
  fetchApi,
  API_FETCH_TIMEOUT_LLM_MS,
} from '@/lib/api/fetch-api'
import { toast } from 'sonner'

const TONE_OPTIONS = [
  { key: 'informative', label: 'Informative' },
  { key: 'urgency', label: 'Urgency' },
  { key: 'shared_responsibility', label: 'Shared Responsibility' },
  { key: 'success_story', label: 'Success Story' },
  { key: 'solidarity', label: 'Solidarity' },
  { key: 'fairness', label: 'Fairness' },
  { key: 'worker_voice', label: 'Worker Voice' },
  { key: 'job_security', label: 'Job Security' },
]

const AUDIENCE_OPTIONS = [
  { key: 'existing_members', label: 'Existing Members' },
  { key: 'lapsed_members', label: 'Lapsed Members' },
  { key: 'non_members_known', label: 'Non-Members (Known)' },
  { key: 'non_members_unknown', label: 'Non-Members (Unknown)' },
  { key: 'all_workers', label: 'All Workers' },
  { key: 'bargaining_reps', label: 'Bargaining Reps' },
  { key: 'hsrs', label: 'HSRs' },
  { key: 'delegates', label: 'Delegates' },
]

const INTENSITY_OPTIONS = [
  { key: 'low', label: 'Low — Informational' },
  { key: 'medium', label: 'Medium — Engaging' },
  { key: 'high', label: 'High — Mobilising' },
]

export interface AiBriefSelections {
  tone: string[]
  audience: string[]
  intensity: string
  purpose: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  selections: AiBriefSelections
  onSelectionsChange: (s: AiBriefSelections) => void
  isPending: boolean
  hasExistingDraft: boolean
  onGenerate: () => void
  // Template handling lives on a dedicated peer button on the composer
  // header — the props below are retained so existing call-sites keep
  // type-checking even though this panel no longer renders the picker.
  stageNumber?: number
  onUseTemplate?: (template: TemplateRow) => void
  onCustomiseTemplate?: (template: TemplateRow) => void
  isCustomisingTemplateId?: number | null
}

export function AiBriefPanel({
  open,
  onOpenChange,
  selections,
  onSelectionsChange,
  isPending,
  hasExistingDraft,
  onGenerate,
}: Props) {
  const toggle = useCallback(
    (
      key: keyof Pick<AiBriefSelections, 'tone' | 'audience'>,
      value: string,
    ) => {
      const list = selections[key]
      const next = list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value]
      onSelectionsChange({ ...selections, [key]: next })
    },
    [selections, onSelectionsChange],
  )

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:w-[480px] flex flex-col gap-0 p-0">
          <SheetHeader className="px-5 py-4 border-b">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-purple-500" />
              AI draft & templates
            </SheetTitle>
            <SheetDescription className="text-xs">
              Set tone, audience, and a one-line ask. Generate from scratch or
              customise an existing template.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-auto px-5 py-4 space-y-5">
            <section className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Narrative tone
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {TONE_OPTIONS.map((t) => {
                  const active = selections.tone.includes(t.key)
                  return (
                    <Badge
                      key={t.key}
                      variant={active ? 'default' : 'outline'}
                      className="cursor-pointer text-xs py-1 px-2.5"
                      onClick={() => toggle('tone', t.key)}
                    >
                      {t.label}
                    </Badge>
                  )
                })}
              </div>
            </section>

            <section className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Target audience
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {AUDIENCE_OPTIONS.map((a) => {
                  const active = selections.audience.includes(a.key)
                  return (
                    <Badge
                      key={a.key}
                      variant={active ? 'default' : 'outline'}
                      className="cursor-pointer text-xs py-1 px-2.5"
                      onClick={() => toggle('audience', a.key)}
                    >
                      {a.label}
                    </Badge>
                  )
                })}
              </div>
            </section>

            <section className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Engagement intensity
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {INTENSITY_OPTIONS.map((i) => (
                  <Badge
                    key={i.key}
                    variant={selections.intensity === i.key ? 'default' : 'outline'}
                    className="cursor-pointer text-xs py-1 px-2.5"
                    onClick={() =>
                      onSelectionsChange({ ...selections, intensity: i.key })
                    }
                  >
                    {i.label}
                  </Badge>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Purpose / specific ask{' '}
                <span className="text-muted-foreground/70 normal-case">
                  (optional, sharpens the AI draft)
                </span>
              </Label>
              <Textarea
                value={selections.purpose}
                onChange={(e) =>
                  onSelectionsChange({ ...selections, purpose: e.target.value })
                }
                placeholder="e.g. announce bargaining dates; drive RSVPs to a delegates meeting on 15 June; recruit signatories to the FPSO petition…"
                rows={4}
                className="text-sm"
              />
            </section>
          </div>

          <div className="border-t px-5 py-3 space-y-2 bg-muted/20">
            <Button
              type="button"
              className="w-full"
              onClick={onGenerate}
              disabled={
                isPending ||
                selections.tone.length === 0 ||
                selections.audience.length === 0
              }
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {hasExistingDraft ? 'Regenerate full draft' : 'Generate full draft with AI'}
            </Button>
            {(selections.tone.length === 0 || selections.audience.length === 0) && (
              <p className="text-[11px] text-muted-foreground text-center">
                Pick at least one tone and audience to enable generate.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

export async function generateSubjectVariants(
  body: string,
  hint?: string,
): Promise<string[]> {
  if (!body.trim()) {
    toast.error('Write or generate the body first — subject variants need context.')
    return []
  }
  try {
    const res = await fetchApi('/api/generate-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'subject_variants',
        body_text: body,
        hint: hint || undefined,
      }),
      timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Variant generation failed')
    }
    return Array.isArray(data.variants) ? data.variants.slice(0, 5) : []
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Variant generation failed')
    return []
  }
}

export interface TransformInput {
  text: string
  action:
    | 'rewrite'
    | 'shorten'
    | 'lengthen'
    | 'tone:militant'
    | 'tone:solidarity'
    | 'tone:plain'
  scope?: 'selection' | 'whole_body'
}

export async function applyTransform(input: TransformInput): Promise<string | null> {
  try {
    const res = await fetchApi('/api/generate-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'transform',
        text: input.text,
        action: input.action,
        scope: input.scope ?? 'selection',
      }),
      timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'AI transform failed')
    }
    return typeof data.transformed === 'string' ? data.transformed : null
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'AI transform failed')
    return null
  }
}
