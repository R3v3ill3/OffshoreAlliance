'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchApi, API_FETCH_TIMEOUT_LLM_MS } from '@/lib/api/fetch-api'
import { buildVariationInstructions } from '@/lib/prompts/draft-prompts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { GitBranch, Loader2, Sparkles, CheckCircle, Users } from 'lucide-react'
import { toast } from 'sonner'

const PRESET_SEGMENTS = [
  { key: 'members', label: 'Members' },
  { key: 'non_members', label: 'Non-members' },
  { key: 'lapsed', label: 'Lapsed members' },
  { key: 'delegates', label: 'Delegates / reps' },
] as const

interface VariationRow {
  segmentKey: string
  segmentLabel: string
  scriptText: string
  savedScriptId: number | null
  isGenerating: boolean
  error: string | null
}

interface BatchGenerateUi {
  label: string
  step: number
  total: number
  progress: number
}

export interface ScriptVariationsPanelProps {
  campaignId: string
  baseScriptId: number
  baseTitle: string
  /** Full script text from base (all sections concatenated) for AI reference */
  referenceScriptBody: string
  callObjective: string | null
  campaignContext: {
    employer_name: string
    agreement_name: string
    worksite_names: string[]
    sector?: string
  }
  wtpSelections?: {
    tone: string[]
    audience: string[]
    engagement_intensity?: string
  }
}

export function ScriptVariationsPanel({
  campaignId,
  baseScriptId,
  baseTitle,
  referenceScriptBody,
  callObjective,
  campaignContext,
  wtpSelections = { tone: [], audience: [], engagement_intensity: undefined },
}: ScriptVariationsPanelProps) {
  const router = useRouter()
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(
    () => new Set(PRESET_SEGMENTS.map((s) => s.key))
  )
  const [variations, setVariations] = useState<VariationRow[]>([])
  const [batchGenerateUi, setBatchGenerateUi] = useState<BatchGenerateUi | null>(null)
  const batchRunRef = useRef(false)

  useEffect(() => {
    setVariations((prev) => {
      const map = new Map(prev.map((v) => [v.segmentKey, v]))
      return [...enabledKeys].map((key) => {
        const meta = PRESET_SEGMENTS.find((s) => s.key === key)
        if (!meta) return null
        return (
          map.get(key) ?? {
            segmentKey: key,
            segmentLabel: meta.label,
            scriptText: '',
            savedScriptId: null,
            isGenerating: false,
            error: null,
          }
        )
      }).filter((x): x is VariationRow => x != null)
    })
  }, [enabledKeys])

  const toggleSegment = (key: string) => {
    setEnabledKeys((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  }

  const handleGenerateOne = useCallback(
    async (segmentKey: string, segmentLabel: string) => {
      setVariations((prev) => {
        const rest = prev.filter((v) => v.segmentKey !== segmentKey)
        return [
          ...rest,
          {
            segmentKey,
            segmentLabel,
            scriptText: '',
            savedScriptId: null,
            isGenerating: true,
            error: null,
          },
        ]
      })
      try {
        const body = {
          platform: 'phone_script' as const,
          campaign_id: parseInt(campaignId, 10),
          plan_id: 0,
          stage_number: 1,
          stage_name: 'Phone script variation',
          campaign_context: {
            employer_name: campaignContext.employer_name,
            agreement_name: campaignContext.agreement_name,
            worksite_names: campaignContext.worksite_names,
            sector: campaignContext.sector || '',
          },
          wtp_selections: {
            tone: wtpSelections.tone,
            audience: wtpSelections.audience,
            platforms: ['Phone'],
            engagement_intensity: wtpSelections.engagement_intensity,
          },
          template_examples: referenceScriptBody.trim()
            ? [{ title: baseTitle, body_text: referenceScriptBody }]
            : undefined,
          custom_instructions: buildVariationInstructions(segmentLabel, callObjective),
        }

        const res = await fetchApi('/api/generate-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Generation failed')

        setVariations((prev) =>
          prev.map((v) =>
            v.segmentKey === segmentKey
              ? { ...v, scriptText: data.body_text as string, isGenerating: false }
              : v
          )
        )
      } catch (err) {
        setVariations((prev) =>
          prev.map((v) =>
            v.segmentKey === segmentKey
              ? {
                  ...v,
                  isGenerating: false,
                  error: err instanceof Error ? err.message : 'Generation failed',
                }
              : v
          )
        )
      }
    },
    [
      campaignId,
      campaignContext,
      referenceScriptBody,
      baseTitle,
      callObjective,
      wtpSelections,
    ]
  )

  const anyGenerating = variations.some((v) => v.isGenerating)
  const generationLocked = batchGenerateUi != null || anyGenerating

  async function handleGenerateEnabled() {
    const enabled = PRESET_SEGMENTS.filter((seg) => enabledKeys.has(seg.key))
    if (enabled.length === 0 || batchRunRef.current) return
    if (variations.some((v) => v.isGenerating)) return
    batchRunRef.current = true
    try {
      for (let i = 0; i < enabled.length; i++) {
        const seg = enabled[i]
        setBatchGenerateUi({
          label: seg.label,
          step: i + 1,
          total: enabled.length,
          progress: (i / enabled.length) * 100,
        })
        await handleGenerateOne(seg.key, seg.label)
      }
      setBatchGenerateUi({
        label: '',
        step: enabled.length,
        total: enabled.length,
        progress: 100,
      })
      await new Promise((r) => setTimeout(r, 400))
    } finally {
      batchRunRef.current = false
      setBatchGenerateUi(null)
    }
  }

  async function handleSaveVariation(v: VariationRow) {
    if (!v.scriptText.trim()) {
      toast.error('Add script text before saving')
      return
    }
    try {
      const res = await fetchApi(`/api/campaigns/${campaignId}/call-scripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${baseTitle} — ${v.segmentLabel}`,
          call_objective: callObjective,
          sections: [],
          base_script_id: baseScriptId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save script')

      const supabase = createClient()
      await supabase.from('call_script_sections').insert({
        script_id: data.script_id,
        sort_order: 0,
        section_type: 'custom',
        title: 'Script',
        body_text: v.scriptText,
        talking_points: [],
        expected_outcomes: [],
        is_optional: false,
      })

      setVariations((prev) =>
        prev.map((row) =>
          row.segmentKey === v.segmentKey ? { ...row, savedScriptId: data.script_id as number } : row
        )
      )
      toast.success(`Saved variation: ${v.segmentLabel}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    }
  }

  function updateText(segmentKey: string, text: string) {
    setVariations((prev) =>
      prev.map((v) => (v.segmentKey === segmentKey ? { ...v, scriptText: text } : v))
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-blue-500" />
          Audience script variations
          <Badge variant="secondary" className="text-[10px] font-normal">
            Shares call outcomes with base script #{baseScriptId}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Generate tailored scripts for audience segments. Saved variations link to this base script so the same
          call outcomes apply on every variation list.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          {PRESET_SEGMENTS.map((seg) => (
            <label
              key={seg.key}
              className={`flex items-center gap-1.5 text-xs ${generationLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            >
              <Checkbox
                checked={enabledKeys.has(seg.key)}
                onCheckedChange={() => toggleSegment(seg.key)}
                disabled={generationLocked}
              />
              {seg.label}
            </label>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void handleGenerateEnabled()}
            disabled={enabledKeys.size === 0 || generationLocked}
          >
            {batchGenerateUi ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 mr-1" />
            )}
            {batchGenerateUi ? 'Generating…' : 'Generate selected'}
          </Button>
        </div>

        {batchGenerateUi && (
          <div
            className="rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-3 space-y-2.5 shadow-sm"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="flex items-start gap-2.5">
              <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0 mt-0.5" aria-hidden />
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-xs font-medium text-foreground">
                  Generating audience variation {batchGenerateUi.step} of {batchGenerateUi.total}
                </p>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {batchGenerateUi.progress >= 100 ? (
                    <span className="text-green-700 dark:text-green-400">All variations ready.</span>
                  ) : (
                    <>
                      Tailoring script for{' '}
                      <span className="font-medium text-foreground">{batchGenerateUi.label}</span>
                      <span className="inline-block ml-1 animate-pulse">…</span>
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="space-y-1.5 pl-0.5">
              <Progress value={batchGenerateUi.progress} className="h-1.5" />
              {batchGenerateUi.progress < 100 && (
                <div className="h-1 rounded-full bg-primary/15 overflow-hidden">
                  <div
                    className="h-full w-[38%] rounded-full bg-primary/60"
                    style={{
                      animation: 'variation-batch-shimmer 1.35s ease-in-out infinite',
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {variations.map((v) => (
              <div key={v.segmentKey} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-medium">{v.segmentLabel}</Label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => void handleGenerateOne(v.segmentKey, v.segmentLabel)}
                      disabled={v.isGenerating || batchGenerateUi != null}
                    >
                      {v.isGenerating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3 mr-1" />
                      )}
                      AI
                    </Button>
                  </div>
                </div>
                {v.error && <p className="text-[10px] text-destructive">{v.error}</p>}
                <Textarea
                  value={v.scriptText}
                  onChange={(e) => updateText(v.segmentKey, e.target.value)}
                  rows={8}
                  placeholder={`Variation for ${v.segmentLabel}…`}
                  className="text-xs font-mono"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => void handleSaveVariation(v)}
                    disabled={!v.scriptText.trim()}
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Save variation
                  </Button>
                  {v.savedScriptId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        router.push(
                          `/campaigns/${campaignId}/phone/lists/new?script_id=${v.savedScriptId}`
                        )
                      }
                    >
                      <Users className="h-3 w-3 mr-1" />
                      New list
                    </Button>
                  )}
                  {v.savedScriptId && (
                    <Badge variant="outline" className="text-[10px]">
                      Script #{v.savedScriptId}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  )
}
