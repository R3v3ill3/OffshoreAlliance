'use client'

import { useState } from 'react'
import { useGenerateDraft } from '@/lib/hooks/useGenerateDraft'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils/cn'
import {
  Mail,
  MessageSquare,
  Phone,
  Loader2,
  RefreshCw,
  Save,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { TemplatePicker } from './TemplatePicker'
import type { TemplateRow } from '@/lib/hooks/useTemplateLibrary'
import type { CommsPlatform, CommsDraftRequest, CommsDraftResponse } from '@/types/planner-types'

const PLATFORM_CONFIG: Record<CommsPlatform, { label: string; icon: React.ReactNode; color: string }> = {
  email: {
    label: 'Email Draft',
    icon: <Mail className="h-5 w-5" />,
    color: 'bg-blue-50 border-blue-200 text-blue-700',
  },
  sms: {
    label: 'SMS Draft',
    icon: <MessageSquare className="h-5 w-5" />,
    color: 'bg-green-50 border-green-200 text-green-700',
  },
  phone_script: {
    label: 'Phone Script',
    icon: <Phone className="h-5 w-5" />,
    color: 'bg-purple-50 border-purple-200 text-purple-700',
  },
}

interface DraftGeneratorCardProps {
  platform: CommsPlatform
  campaignId: number
  planId: number
  stageNumber: number
  stageName: string
  campaignContext: {
    agreement_name: string
    employer_name: string
    worksite_names: string[]
    sector: string
    campaign_type?: string
    agreement_expiry?: string
  }
  wtpSelections: {
    tone: string[]
    audience: string[]
    platforms: string[]
    engagement_intensity?: string
    contact_method_priority?: string[]
  }
}

function smsSegmentCount(length: number): number {
  if (length <= 160) return 1
  return Math.ceil(length / 153)
}

export function DraftGeneratorCard({
  platform,
  campaignId,
  planId,
  stageNumber,
  stageName,
  campaignContext,
  wtpSelections,
}: DraftGeneratorCardProps) {
  const [draft, setDraft] = useState<CommsDraftResponse | null>(null)
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [customInstructions, setCustomInstructions] = useState('')
  const [showInstructions, setShowInstructions] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [isCustomising, setIsCustomising] = useState(false)
  const [changeSummary, setChangeSummary] = useState<Array<{ location: string; original_snippet: string; adapted_snippet: string; reason: string }> | null>(null)
  const [sourceTemplateId, setSourceTemplateId] = useState<number | null>(null)

  const generateDraft = useGenerateDraft()
  const config = PLATFORM_CONFIG[platform]

  async function handleGenerate() {
    setSaved(false)
    const request: CommsDraftRequest = {
      campaign_id: campaignId,
      plan_id: planId,
      stage_number: stageNumber,
      stage_name: stageName,
      platform,
      campaign_context: campaignContext,
      wtp_selections: wtpSelections,
      custom_instructions: customInstructions || undefined,
    }

    const result = await generateDraft.mutateAsync(request)
    setDraft(result)
    setSubject(result.subject || '')
    setBodyText(result.body_text)
  }

  function handleSelectTemplate(template: TemplateRow) {
    setSubject(template.subject_line || '')
    setBodyText(template.body_text)
    setSourceTemplateId(template.template_id)
    setChangeSummary(null)
    setDraft({
      platform,
      subject: template.subject_line || undefined,
      body_text: template.body_text,
      body_html: template.body_html || undefined,
      variables_used: [],
      tone_applied: template.tone_tags?.join(', ') || '',
      audience_targeted: template.audience_segment || '',
      estimated_character_count: template.body_text.length,
    })
    setShowTemplatePicker(false)
    setSaved(false)
  }

  async function handleSelectAndCustomise(template: TemplateRow) {
    setIsCustomising(true)
    setSourceTemplateId(template.template_id)
    try {
      const response = await fetch('/api/templates/customise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: template.template_id,
          subject_line: template.subject_line,
          body_text: template.body_text,
          body_html: template.body_html,
          stage_number: stageNumber,
          stage_name: stageName,
          wtp_selections: wtpSelections,
          custom_instructions: customInstructions || undefined,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error || 'Customisation failed')
      }

      const result = await response.json()
      setSubject(result.adapted_subject || template.subject_line || '')
      setBodyText(result.adapted_body_text || template.body_text)
      setChangeSummary(result.changes_summary || null)
      setDraft({
        platform,
        subject: result.adapted_subject || template.subject_line || undefined,
        body_text: result.adapted_body_text || template.body_text,
        body_html: result.adapted_body_html || template.body_html || undefined,
        variables_used: [],
        tone_applied: result.tone_applied || '',
        audience_targeted: result.audience_targeted || '',
        estimated_character_count: (result.adapted_body_text || template.body_text).length,
      })
      setShowTemplatePicker(false)
      setSaved(false)
      toast.success('Template customised for your campaign context')
    } catch (err) {
      toast.error(`Customisation failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsCustomising(false)
    }
  }

  async function handleSave() {
    if (!draft) return
    setIsSaving(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.from('campaign_comms_drafts').insert({
        campaign_id: campaignId,
        plan_id: planId,
        stage_number: stageNumber,
        platform,
        title: `${config.label} – ${stageName}`,
        subject: subject || null,
        body: bodyText,
        body_html: draft.body_html || null,
        status: 'draft',
        tone: draft.tone_applied || null,
        audience_segment: draft.audience_targeted || null,
        ai_model_used: sourceTemplateId ? 'template-customised' : 'claude-sonnet',
        variables_used: draft.variables_used || [],
        custom_instructions: customInstructions || null,
        source_template_ids: sourceTemplateId ? [sourceTemplateId] : null,
      })

      if (error) throw error
      setSaved(true)
      toast.success('Draft saved successfully')
    } catch {
      toast.error('Failed to save draft')
    } finally {
      setIsSaving(false)
    }
  }

  const charCount = bodyText.length
  const isLoading = generateDraft.isPending

  return (
    <Card className={cn('overflow-hidden', draft ? '' : 'border-dashed')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn('p-1.5 rounded-md', config.color)}>{config.icon}</span>
            <CardTitle className="text-sm">{config.label}</CardTitle>
          </div>
          {draft && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={isLoading}
                className="h-7 text-xs"
              >
                <RefreshCw className={cn('h-3 w-3 mr-1', isLoading && 'animate-spin')} />
                Regenerate
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving || saved}
                className="h-7 text-xs"
              >
                {saved ? (
                  <>
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Saved
                  </>
                ) : isSaving ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <>
                    <Save className="h-3 w-3 mr-1" />
                    Save Draft
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* WTP context badges */}
        <div className="flex flex-wrap gap-1.5">
          {wtpSelections.tone.map((t) => (
            <Badge key={t} variant="secondary" className="text-xs bg-amber-50 text-amber-700">
              {t}
            </Badge>
          ))}
          {wtpSelections.audience.map((a) => (
            <Badge key={a} variant="secondary" className="text-xs bg-indigo-50 text-indigo-700">
              {a}
            </Badge>
          ))}
          {wtpSelections.engagement_intensity && (
            <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-700">
              {wtpSelections.engagement_intensity}
            </Badge>
          )}
        </div>

        {/* Before generation */}
        {!draft && (
          <div className="space-y-3">
            {/* Custom Instructions toggle */}
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {showInstructions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Custom Instructions
            </button>
            {showInstructions && (
              <div className="space-y-1">
                <Label className="text-xs">Additional guidance for the AI</Label>
                <Textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="e.g. Focus on safety concerns, use informal tone, mention upcoming site meeting..."
                  rows={2}
                  className="text-xs"
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => setShowTemplatePicker(true)}
                className="flex-1"
                variant="outline"
              >
                <FileText className="h-4 w-4 mr-2" />
                Use Template
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={isLoading}
                className="flex-1"
                variant="outline"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    {config.icon}
                    <span className="ml-2">Generate New</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* After generation – Email */}
        {draft && platform === 'email' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Subject Line</Label>
              <Input
                value={subject}
                onChange={(e) => { setSubject(e.target.value); setSaved(false) }}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Body</Label>
              <Textarea
                value={bodyText}
                onChange={(e) => { setBodyText(e.target.value); setSaved(false) }}
                rows={10}
                className="text-sm font-mono"
              />
              <p className="text-xs text-muted-foreground text-right">{charCount} characters</p>
            </div>
          </div>
        )}

        {/* After generation – SMS */}
        {draft && platform === 'sms' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Message</Label>
              <Textarea
                value={bodyText}
                onChange={(e) => { setBodyText(e.target.value); setSaved(false) }}
                rows={5}
                className="text-sm"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{charCount} characters</span>
                <span>
                  {smsSegmentCount(charCount)} segment{smsSegmentCount(charCount) !== 1 ? 's' : ''}
                  {' '}({charCount <= 160 ? 160 : smsSegmentCount(charCount) * 153} max)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* After generation – Phone Script */}
        {draft && platform === 'phone_script' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Phone Script</Label>
              <Textarea
                value={bodyText}
                onChange={(e) => { setBodyText(e.target.value); setSaved(false) }}
                rows={12}
                className="text-sm font-mono whitespace-pre-wrap"
              />
              <p className="text-xs text-muted-foreground text-right">{charCount} characters</p>
            </div>
          </div>
        )}

        {/* Custom Instructions (post-generation) */}
        {draft && (
          <>
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {showInstructions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Custom Instructions
            </button>
            {showInstructions && (
              <div className="space-y-1">
                <Label className="text-xs">Additional guidance for regeneration</Label>
                <Textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="e.g. Make it shorter, add a call to action..."
                  rows={2}
                  className="text-xs"
                />
              </div>
            )}
          </>
        )}

        {/* Change summary from template customisation */}
        {changeSummary && changeSummary.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground">AI Customisation Changes</p>
            {changeSummary.map((change, i) => (
              <div key={i} className="text-xs space-y-0.5 p-2 rounded bg-muted/30">
                <p className="font-medium">{change.location}</p>
                <p className="text-muted-foreground line-through">{change.original_snippet}</p>
                <p className="text-green-700">{change.adapted_snippet}</p>
                <p className="text-muted-foreground italic">{change.reason}</p>
              </div>
            ))}
          </div>
        )}

        {/* AI metadata */}
        {draft && (
          <div className="flex flex-wrap gap-1.5 pt-1 border-t">
            {sourceTemplateId && (
              <Badge variant="outline" className="text-xs">From template #{sourceTemplateId}</Badge>
            )}
            {draft.tone_applied && (
              <Badge variant="outline" className="text-xs">Tone: {draft.tone_applied}</Badge>
            )}
            {draft.audience_targeted && (
              <Badge variant="outline" className="text-xs">Audience: {draft.audience_targeted}</Badge>
            )}
            {draft.variables_used.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {draft.variables_used.length} variable{draft.variables_used.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        )}
      </CardContent>

      <TemplatePicker
        open={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        onSelect={handleSelectTemplate}
        onSelectAndCustomise={handleSelectAndCustomise}
        platform={platform}
        stageNumber={stageNumber}
        isCustomising={isCustomising}
      />
    </Card>
  )
}
