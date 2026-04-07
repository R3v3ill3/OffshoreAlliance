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
} from 'lucide-react'
import { toast } from 'sonner'
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
        body_text: bodyText,
        body_html: draft.body_html || null,
        status: 'draft',
        tone: draft.tone_applied || null,
        audience_segment: draft.audience_targeted || null,
        ai_model_used: 'gpt-4o-mini',
        variables_used: draft.variables_used || [],
        custom_instructions: customInstructions || null,
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

            <Button
              onClick={handleGenerate}
              disabled={isLoading}
              className="w-full"
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
                  <span className="ml-2">Generate Draft</span>
                </>
              )}
            </Button>
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

        {/* AI metadata */}
        {draft && (
          <div className="flex flex-wrap gap-1.5 pt-1 border-t">
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
    </Card>
  )
}
