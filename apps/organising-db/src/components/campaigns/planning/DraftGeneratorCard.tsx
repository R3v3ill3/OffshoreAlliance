'use client'

import { useState, useRef, useMemo } from 'react'
import { useGenerateDraft } from '@/lib/hooks/useGenerateDraft'
import { useCreateTemplate } from '@/lib/hooks/useTemplateLibrary'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils/cn'
import {
  fetchApi,
  API_FETCH_TIMEOUT_LLM_MS,
} from '@/lib/api/fetch-api'
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
  Variable,
  BookMarked,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { TemplatePicker } from './TemplatePicker'
import {
  RECIPIENT_VARIABLES,
  CAMPAIGN_CONTEXT_VARIABLES,
  resolveTemplateVariables,
} from '@/lib/comms/template-variables'
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

const TONE_OPTIONS = [
  { value: 'informative', label: 'Informative' },
  { value: 'urgency', label: 'Urgency' },
  { value: 'shared_responsibility', label: 'Shared Responsibility' },
  { value: 'success_story', label: 'Success Story' },
  { value: 'solidarity', label: 'Solidarity' },
  { value: 'fairness', label: 'Fairness' },
  { value: 'worker_voice', label: 'Worker Voice' },
  { value: 'job_security', label: 'Job Security' },
]

const AUDIENCE_OPTIONS = [
  { value: 'all_workers', label: 'All Workers' },
  { value: 'members', label: 'Members' },
  { value: 'non_members', label: 'Non-Members' },
  { value: 'leaders', label: 'Leaders / WOC' },
  { value: 'bargaining_reps', label: 'Bargaining Reps' },
]

export interface InitialDraft {
  draft_id: number
  platform: CommsPlatform
  subject: string | null
  body: string | null
  tone: string | null
  audience_segment: string | null
  title: string | null
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
  initialDraft?: InitialDraft | null
  onSaved?: () => void
  onCancelEdit?: () => void
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
  initialDraft,
  onSaved,
  onCancelEdit,
}: DraftGeneratorCardProps) {
  const isEditMode = !!initialDraft

  const [draft, setDraft] = useState<CommsDraftResponse | null>(() => {
    if (!initialDraft) return null
    return {
      platform,
      subject: initialDraft.subject || undefined,
      body_text: initialDraft.body || '',
      variables_used: [],
      tone_applied: initialDraft.tone || '',
      audience_targeted: initialDraft.audience_segment || '',
      estimated_character_count: (initialDraft.body || '').length,
    }
  })
  const [subject, setSubject] = useState(initialDraft?.subject || '')
  const [bodyText, setBodyText] = useState(initialDraft?.body || '')
  const [customInstructions, setCustomInstructions] = useState('')
  const [showInstructions, setShowInstructions] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [isCustomising, setIsCustomising] = useState<number | null>(null)
  const [changeSummary, setChangeSummary] = useState<Array<{ location: string; original_snippet: string; adapted_snippet: string; reason: string }> | null>(null)
  const [sourceTemplateId, setSourceTemplateId] = useState<number | null>(null)

  // Save as Template state
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false)
  const [templateTitle, setTemplateTitle] = useState('')
  const [templateTones, setTemplateTones] = useState<string[]>([])
  const [templateAudience, setTemplateAudience] = useState('')

  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const generateDraft = useGenerateDraft()
  const createTemplate = useCreateTemplate()
  const config = PLATFORM_CONFIG[platform]

  const campaignVarContext: Record<string, string | undefined> = useMemo(() => ({
    employer_name: campaignContext.employer_name || undefined,
    agreement_name: campaignContext.agreement_name || undefined,
    worksite_name: campaignContext.worksite_names?.[0] || undefined,
    campaign_name: undefined,
    organiser_name: undefined,
    organiser_phone: undefined,
    staff_name: undefined,
    staff_email: undefined,
    staff_phone: undefined,
    staff_role: undefined,
    date: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
  }), [campaignContext])

  function insertVariableAtCursor(variable: string) {
    const textarea = bodyRef.current
    if (!textarea) {
      setBodyText(bodyText + variable)
      setSaved(false)
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newValue = bodyText.substring(0, start) + variable + bodyText.substring(end)
    setBodyText(newValue)
    setSaved(false)
    requestAnimationFrame(() => {
      const pos = start + variable.length
      textarea.setSelectionRange(pos, pos)
      textarea.focus()
    })
  }

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
    const resolvedBody = resolveTemplateVariables(template.body_text, campaignVarContext)
    const resolvedSubject = resolveTemplateVariables(template.subject_line || '', campaignVarContext)
    setSubject(resolvedSubject)
    setBodyText(resolvedBody)
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
    setIsCustomising(template.template_id)
    setSourceTemplateId(template.template_id)
    try {
      const response = await fetchApi('/api/templates/customise', {
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
          campaign_context: campaignContext,
        }),
        timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error || 'Customisation failed')
      }

      const result = await response.json()
      const resolvedSubject = resolveTemplateVariables(result.adapted_subject || template.subject_line || '', campaignVarContext)
      const resolvedBody = resolveTemplateVariables(result.adapted_body_text || template.body_text, campaignVarContext)
      setSubject(resolvedSubject)
      setBodyText(resolvedBody)
      setChangeSummary(result.changes_summary || null)
      setDraft({
        platform,
        subject: result.adapted_subject || template.subject_line || undefined,
        body_text: result.adapted_body_text || template.body_text,
        body_html: template.body_html || undefined,
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
      setIsCustomising(null)
    }
  }

  async function handleSave() {
    if (!draft) return
    setIsSaving(true)

    try {
      const supabase = createClient()

      if (isEditMode && initialDraft?.draft_id) {
        // UPDATE existing draft
        const { error } = await supabase
          .from('campaign_comms_drafts')
          .update({
            subject: subject || null,
            body: bodyText,
            body_html: draft.body_html || null,
            tone: draft.tone_applied || null,
            audience_segment: draft.audience_targeted || null,
            custom_instructions: customInstructions || null,
          })
          .eq('draft_id', initialDraft.draft_id)

        if (error) throw error
        setSaved(true)
        toast.success('Draft updated successfully')
        onSaved?.()
      } else {
        // INSERT new draft
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
        onSaved?.()
      }
    } catch {
      toast.error('Failed to save draft')
    } finally {
      setIsSaving(false)
    }
  }

  function handleOpenSaveAsTemplate() {
    setTemplateTitle(initialDraft?.title || `${config.label} – ${stageName}`)
    setTemplateTones(draft?.tone_applied ? draft.tone_applied.split(', ').filter(Boolean) : [])
    setTemplateAudience(draft?.audience_targeted || '')
    setShowSaveAsTemplate(true)
  }

  async function handleSaveAsTemplate() {
    try {
      await createTemplate.mutateAsync({
        title: templateTitle,
        platform,
        body_text: bodyText,
        subject_line: subject || undefined,
        stage_number: stageNumber || undefined,
        tone_tags: templateTones.length > 0 ? templateTones : undefined,
        audience_segment: templateAudience || undefined,
      })
      setShowSaveAsTemplate(false)
      toast.success('Template saved — available in the Template Library')
    } catch {
      // toast already shown by hook
    }
  }

  function toggleTone(tone: string) {
    setTemplateTones((prev) =>
      prev.includes(tone) ? prev.filter((t) => t !== tone) : [...prev, tone]
    )
  }

  const charCount = bodyText.length
  const isLoading = generateDraft.isPending

  return (
    <Card className={cn('overflow-hidden', draft ? '' : 'border-dashed')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn('p-1.5 rounded-md', config.color)}>{config.icon}</span>
            <CardTitle className="text-sm">
              {isEditMode ? `Edit ${config.label}` : config.label}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            {draft && !showSaveAsTemplate && (
              <>
                {!isEditMode && (
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
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenSaveAsTemplate}
                  className="h-7 text-xs"
                  title="Save as reusable template"
                >
                  <BookMarked className="h-3 w-3 mr-1" />
                  Template
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
                      {isEditMode ? 'Update Draft' : 'Save Draft'}
                    </>
                  )}
                </Button>
              </>
            )}
            {isEditMode && onCancelEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancelEdit}
                className="h-7 text-xs text-muted-foreground"
              >
                <X className="h-3 w-3 mr-1" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* WTP context badges */}
        {!isEditMode && (
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
        )}

        {/* Before generation (new mode only) */}
        {!draft && !isEditMode && (
          <div className="space-y-3">
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

        {/* Save as Template inline form */}
        {showSaveAsTemplate && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                <BookMarked className="h-3.5 w-3.5" />
                Save as Reusable Template
              </p>
              <Button
                variant="ghost" size="sm" className="h-5 w-5 p-0 text-amber-700 hover:bg-amber-100"
                onClick={() => setShowSaveAsTemplate(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-amber-800">Template Title</Label>
              <Input
                value={templateTitle}
                onChange={(e) => setTemplateTitle(e.target.value)}
                placeholder="e.g. Stage 2 Member Email — Solidarity"
                className="h-7 text-xs bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-amber-800">Tone Tags</Label>
              <div className="flex flex-wrap gap-1.5">
                {TONE_OPTIONS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => toggleTone(t.value)}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                      templateTones.includes(t.value)
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-100'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-amber-800">Audience</Label>
              <Select value={templateAudience} onValueChange={setTemplateAudience}>
                <SelectTrigger className="h-7 text-xs bg-white">
                  <SelectValue placeholder="Select audience..." />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCE_OPTIONS.map((a) => (
                    <SelectItem key={a.value} value={a.value} className="text-xs">
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline" size="sm" className="h-7 text-xs"
                onClick={() => setShowSaveAsTemplate(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700"
                onClick={handleSaveAsTemplate}
                disabled={!templateTitle.trim() || createTemplate.isPending}
              >
                {createTemplate.isPending ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <BookMarked className="h-3 w-3 mr-1" />
                )}
                Save Template
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
              <div className="space-y-1 mb-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Variable className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground font-medium">Recipient:</span>
                  {RECIPIENT_VARIABLES.map((v) => (
                    <Button
                      key={v.key}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-5 text-[10px] font-mono px-1"
                      title={v.description}
                      onClick={() => insertVariableAtCursor(`{{${v.key}}}`)}
                    >
                      {v.key}
                    </Button>
                  ))}
                  <span className="text-[10px] text-muted-foreground font-medium ml-1">Campaign:</span>
                  {CAMPAIGN_CONTEXT_VARIABLES.map((v) => (
                    <Button
                      key={v.key}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-5 text-[10px] font-mono px-1"
                      title={v.description}
                      onClick={() => insertVariableAtCursor(`{{${v.key}}}`)}
                    >
                      {v.key}
                    </Button>
                  ))}
                </div>
              </div>
              <Textarea
                ref={bodyRef}
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

        {/* Custom Instructions (post-generation, new mode only) */}
        {draft && !isEditMode && (
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
        {draft && !showSaveAsTemplate && (
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
