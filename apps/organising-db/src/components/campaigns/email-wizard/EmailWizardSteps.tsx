'use client'

import { useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { useGenerateDraft } from '@/lib/hooks/useGenerateDraft'
import { useWtpCategories } from '@/lib/hooks/usePlannerOptions'
import { TemplatePicker } from '@/components/campaigns/planning/TemplatePicker'
import type { TemplateRow } from '@/lib/hooks/useTemplateLibrary'
import type { PreparedTag } from '@/components/campaigns/campaign-send-panel'
import {
  RECIPIENT_VARIABLES,
  CAMPAIGN_CONTEXT_VARIABLES,
  resolveTemplateVariables,
  translateToActionNetwork,
} from '@/lib/comms/template-variables'
import { STAGE_NAMES } from '@/types/planner-types'
import type { CommsDraftRequest } from '@/types/planner-types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils/cn'
import { toast } from 'sonner'
import {
  Building2,
  Target,
  Mail,
  Send,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Loader2,
  Sparkles,
  FileText,
  PenLine,
  Variable,
  Users,
} from 'lucide-react'

const STEPS = [
  { id: 1, title: 'Campaign Context', icon: Building2 },
  { id: 2, title: 'Tone & Audience', icon: Target },
  { id: 3, title: 'Create Email', icon: Mail },
  { id: 4, title: 'List & Send', icon: Send },
]

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

interface WizardState {
  campaignId: number | null
  stageNumber: number | null
  emailPurpose: string
  campaignName: string
  employerName: string
  agreementName: string
  worksiteNames: string[]
  organiserName: string
  organiserPhone: string
  tone: string[]
  audience: string[]
  engagementIntensity: string
  subject: string
  bodyText: string
  bodyHtml: string | null
  sourceTemplateId: number | null
  draftId: number | null
  preparedTag: PreparedTag | null
  externalMessageId: string | null
}

const INITIAL_STATE: WizardState = {
  campaignId: null,
  stageNumber: null,
  emailPurpose: '',
  campaignName: '',
  employerName: '',
  agreementName: '',
  worksiteNames: [],
  organiserName: '',
  organiserPhone: '',
  tone: [],
  audience: [],
  engagementIntensity: '',
  subject: '',
  bodyText: '',
  bodyHtml: null,
  sourceTemplateId: null,
  draftId: null,
  preparedTag: null,
  externalMessageId: null,
}

export function EmailWizardSteps() {
  const router = useRouter()
  const supabase = createClient()
  const { user, profile } = useAuth()
  const [step, setStep] = useState(1)
  const [state, setState] = useState<WizardState>(INITIAL_STATE)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [isCustomising, setIsCustomising] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isPushingList, setIsPushingList] = useState(false)
  const [isPushingToAN, setIsPushingToAN] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const generateDraft = useGenerateDraft()

  const { data: campaigns = [] } = useQuery({
    queryKey: ['wizard-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('campaign_id, name, organiser_id')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!user,
  })

  useQuery({
    queryKey: ['wizard-campaign-context', state.campaignId],
    queryFn: async () => {
      if (!state.campaignId) return null
      const campaign = campaigns.find((c) => c.campaign_id === state.campaignId)
      if (!campaign) return null

      let agreementName = ''
      let employerName = ''
      const { data: timeline } = await supabase
        .from('campaign_timelines')
        .select('agreement_id')
        .eq('campaign_id', state.campaignId)
        .maybeSingle()
      if (timeline?.agreement_id) {
        const { data: agreement } = await supabase
          .from('agreements')
          .select('agreement_name, employer_id')
          .eq('agreement_id', timeline.agreement_id)
          .single()
        agreementName = agreement?.agreement_name ?? ''
        if (agreement?.employer_id) {
          const { data: employer } = await supabase
            .from('employers')
            .select('employer_name')
            .eq('employer_id', agreement.employer_id)
            .single()
          employerName = employer?.employer_name ?? ''
        }
      }

      let organiserName = ''
      let organiserPhone = ''
      if (campaign.organiser_id) {
        const { data: org } = await supabase
          .from('organisers')
          .select('organiser_name, phone')
          .eq('organiser_id', campaign.organiser_id)
          .single()
        organiserName = org?.organiser_name ?? ''
        organiserPhone = org?.phone ?? ''
      }

      const { data: wsLinks } = await supabase
        .from('campaign_worksites')
        .select('worksites(worksite_name)')
        .eq('campaign_id', state.campaignId)
      const worksiteNames = (wsLinks ?? [])
        .map((r: Record<string, unknown>) => (r.worksites as { worksite_name: string } | null)?.worksite_name)
        .filter(Boolean) as string[]

      setState((prev) => ({
        ...prev,
        campaignName: campaign.name,
        employerName,
        agreementName,
        worksiteNames,
        organiserName,
        organiserPhone,
      }))
      return null
    },
    enabled: !!state.campaignId && campaigns.length > 0,
  })

  const campaignVarContext = useMemo<Record<string, string | undefined>>(() => ({
    employer_name: state.employerName || undefined,
    agreement_name: state.agreementName || undefined,
    worksite_name: state.worksiteNames[0] || undefined,
    campaign_name: state.campaignName || undefined,
    organiser_name: state.organiserName || undefined,
    organiser_phone: state.organiserPhone || undefined,
    staff_name: profile?.display_name || user?.email || undefined,
    staff_email: user?.email || undefined,
    date: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
  }), [state, profile, user])

  const wtpSelections = useMemo(() => ({
    tone: state.tone,
    audience: state.audience,
    platforms: ['Email'],
    engagement_intensity: state.engagementIntensity || undefined,
  }), [state.tone, state.audience, state.engagementIntensity])

  const stageName = state.stageNumber
    ? STAGE_NAMES[state.stageNumber as keyof typeof STAGE_NAMES] || `Stage ${state.stageNumber}`
    : 'General'

  function insertVariable(variable: string) {
    const textarea = bodyRef.current
    if (!textarea) {
      setState((prev) => ({ ...prev, bodyText: prev.bodyText + variable }))
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newValue = state.bodyText.substring(0, start) + variable + state.bodyText.substring(end)
    setState((prev) => ({ ...prev, bodyText: newValue }))
    requestAnimationFrame(() => {
      const pos = start + variable.length
      textarea.setSelectionRange(pos, pos)
      textarea.focus()
    })
  }

  function handleSelectTemplate(template: TemplateRow) {
    const resolved = resolveTemplateVariables(template.body_text, campaignVarContext)
    const resolvedSubject = resolveTemplateVariables(template.subject_line || '', campaignVarContext)
    setState((prev) => ({
      ...prev,
      subject: resolvedSubject,
      bodyText: resolved,
      bodyHtml: template.body_html || null,
      sourceTemplateId: template.template_id,
    }))
    setShowTemplatePicker(false)
  }

  async function handleCustomiseTemplate(template: TemplateRow) {
    setIsCustomising(true)
    try {
      const response = await fetch('/api/templates/customise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: template.template_id,
          subject_line: template.subject_line,
          body_text: template.body_text,
          stage_number: state.stageNumber || 1,
          stage_name: stageName,
          wtp_selections: wtpSelections,
        }),
      })
      if (!response.ok) throw new Error('Customisation failed')
      const result = await response.json()
      const resolved = resolveTemplateVariables(result.adapted_body_text || template.body_text, campaignVarContext)
      const resolvedSubject = resolveTemplateVariables(result.adapted_subject || template.subject_line || '', campaignVarContext)
      setState((prev) => ({
        ...prev,
        subject: resolvedSubject,
        bodyText: resolved,
        bodyHtml: template.body_html || null,
        sourceTemplateId: template.template_id,
      }))
      setShowTemplatePicker(false)
      toast.success('Template customised')
    } catch {
      toast.error('Customisation failed')
    } finally {
      setIsCustomising(false)
    }
  }

  async function handleAIGenerate() {
    const request: CommsDraftRequest = {
      campaign_id: state.campaignId || 0,
      plan_id: 0,
      stage_number: state.stageNumber || 1,
      stage_name: stageName,
      platform: 'email',
      campaign_context: {
        employer_name: state.employerName,
        agreement_name: state.agreementName,
        worksite_names: state.worksiteNames,
        sector: '',
      },
      wtp_selections: wtpSelections,
      custom_instructions: state.emailPurpose || undefined,
    }
    const result = await generateDraft.mutateAsync(request)
    setState((prev) => ({
      ...prev,
      subject: result.subject || '',
      bodyText: result.body_text,
      bodyHtml: result.body_html || null,
    }))
  }

  async function handleSaveDraft() {
    setIsSavingDraft(true)
    try {
      const { data, error } = await supabase
        .from('campaign_comms_drafts')
        .insert({
          campaign_id: state.campaignId,
          stage_number: state.stageNumber || 1,
          platform: 'email',
          title: `Email – ${stageName}`,
          subject: state.subject || null,
          body: state.bodyText,
          body_html: state.bodyHtml,
          status: 'draft',
          tone: state.tone.join(', ') || null,
          audience_segment: state.audience.join(', ') || null,
          source_template_ids: state.sourceTemplateId ? [state.sourceTemplateId] : null,
          created_by: user?.id,
        })
        .select('draft_id')
        .single()
      if (error) throw error
      setState((prev) => ({ ...prev, draftId: data.draft_id }))
      toast.success('Draft saved')
    } catch {
      toast.error('Failed to save draft')
    } finally {
      setIsSavingDraft(false)
    }
  }

  async function handlePushList() {
    if (!state.campaignId) return
    setIsPushingList(true)
    try {
      const res = await fetch(`/api/campaigns/${state.campaignId}/push-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft_id: state.draftId,
          filters: {},
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Push failed')
      setState((prev) => ({
        ...prev,
        preparedTag: {
          tag_id: data.tag_id,
          tag_href: data.tag_href,
          tag_name: data.tag_name,
          contacts_tagged: data.contacts_tagged,
          contacts_created: data.contacts_created,
        },
      }))
      toast.success(`${data.contacts_tagged + data.contacts_created} contacts pushed to AN`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Push failed')
    } finally {
      setIsPushingList(false)
    }
  }

  async function handlePushToAN() {
    if (!state.draftId) return
    setIsPushingToAN(true)
    try {
      const ctx = campaignVarContext
      const resolvedSubject = translateToActionNetwork(resolveTemplateVariables(state.subject, ctx))
      const resolvedBody = translateToActionNetwork(resolveTemplateVariables(state.bodyHtml || state.bodyText, ctx))

      const messagePayload: Record<string, unknown> = {
        subject: resolvedSubject,
        body: resolvedBody,
        from: 'Offshore Alliance',
        reply_to: 'info@offshorealliance.org.au',
      }
      if (state.preparedTag?.tag_href) {
        messagePayload.targets = [{ href: state.preparedTag.tag_href }]
      }

      const createRes = await fetch('/api/action-network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_message', message: messagePayload }),
      })
      const createData = await createRes.json()
      if (!createData.success) throw new Error(createData.error)

      const messageHref = createData.data?._links?.self?.href ?? ''
      const messageId = messageHref.split('/').pop() || ''

      await supabase
        .from('campaign_comms_drafts')
        .update({
          status: 'sent',
          sent_via: 'action_network',
          external_message_id: messageId,
        })
        .eq('draft_id', state.draftId)

      setState((prev) => ({ ...prev, externalMessageId: messageId }))
      toast.success('Email pushed to Action Network')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Push failed')
    } finally {
      setIsPushingToAN(false)
    }
  }

  const canProceed: Record<number, boolean> = {
    1: true,
    2: state.tone.length > 0 && state.audience.length > 0,
    3: state.bodyText.trim().length > 0,
    4: true,
  }

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email Wizard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and send a campaign email step by step
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push('/campaigns')}>
          Cancel
        </Button>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between">
          {STEPS.map((s) => {
            const Icon = s.icon
            const done = step > s.id
            const current = step === s.id
            return (
              <div key={s.id} className="flex items-center gap-2">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold',
                  done ? 'bg-green-100 text-green-700' :
                  current ? 'bg-blue-600 text-white' :
                  'bg-slate-100 text-slate-400'
                )}>
                  {done ? <CheckCircle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className={cn(
                  'text-sm font-medium hidden sm:inline',
                  current ? 'text-blue-600' : done ? 'text-green-700' : 'text-slate-400'
                )}>
                  {s.title}
                </span>
              </div>
            )
          })}
        </div>
        <Progress value={((step - 1) / (STEPS.length - 1)) * 100} className="h-1" />
      </div>

      {/* Step 1: Campaign Context */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Campaign Context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Campaign (optional)</Label>
              <Select
                value={state.campaignId?.toString() ?? '__none__'}
                onValueChange={(v) => setState((prev) => ({
                  ...prev,
                  campaignId: v === '__none__' ? null : Number(v),
                  ...(v === '__none__' ? { campaignName: '', employerName: '', agreementName: '', worksiteNames: [], organiserName: '', organiserPhone: '' } : {}),
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No campaign — standalone email" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No campaign — standalone email</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.campaign_id} value={c.campaign_id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Linking to a campaign enables variable auto-fill, list building, and draft saving.
              </p>
            </div>

            {state.campaignId && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                {state.employerName && (
                  <div>
                    <span className="text-muted-foreground">Employer:</span>{' '}
                    <span className="font-medium">{state.employerName}</span>
                  </div>
                )}
                {state.agreementName && (
                  <div>
                    <span className="text-muted-foreground">Agreement:</span>{' '}
                    <span className="font-medium">{state.agreementName}</span>
                  </div>
                )}
                {state.organiserName && (
                  <div>
                    <span className="text-muted-foreground">Organiser:</span>{' '}
                    <span className="font-medium">{state.organiserName}</span>
                  </div>
                )}
                {state.worksiteNames.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Worksites:</span>{' '}
                    <span className="font-medium">{state.worksiteNames.join(', ')}</span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <Label>Campaign Stage</Label>
              <Select
                value={state.stageNumber?.toString() ?? '0'}
                onValueChange={(v) => setState((prev) => ({ ...prev, stageNumber: v === '0' ? null : Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">General / not stage-specific</SelectItem>
                  {Object.entries(STAGE_NAMES).map(([n, name]) => (
                    <SelectItem key={n} value={n}>
                      Stage {n}: {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Email Purpose (optional)</Label>
              <Textarea
                value={state.emailPurpose}
                onChange={(e) => setState((prev) => ({ ...prev, emailPurpose: e.target.value }))}
                placeholder="What's the goal of this email? e.g., Announce bargaining dates, Rally support for protected action..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Tone & Audience */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Tone & Audience</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Narrative Tone (select all that apply)</Label>
              <div className="flex flex-wrap gap-2">
                {TONE_OPTIONS.map((t) => {
                  const selected = state.tone.includes(t.key)
                  return (
                    <Badge
                      key={t.key}
                      variant={selected ? 'default' : 'outline'}
                      className="cursor-pointer text-sm py-1 px-3"
                      onClick={() => setState((prev) => ({
                        ...prev,
                        tone: selected
                          ? prev.tone.filter((x) => x !== t.key)
                          : [...prev.tone, t.key],
                      }))}
                    >
                      {t.label}
                    </Badge>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Target Audience (select all that apply)</Label>
              <div className="flex flex-wrap gap-2">
                {AUDIENCE_OPTIONS.map((a) => {
                  const selected = state.audience.includes(a.key)
                  return (
                    <Badge
                      key={a.key}
                      variant={selected ? 'default' : 'outline'}
                      className="cursor-pointer text-sm py-1 px-3"
                      onClick={() => setState((prev) => ({
                        ...prev,
                        audience: selected
                          ? prev.audience.filter((x) => x !== a.key)
                          : [...prev.audience, a.key],
                      }))}
                    >
                      {a.label}
                    </Badge>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Engagement Intensity</Label>
              <div className="flex flex-wrap gap-2">
                {INTENSITY_OPTIONS.map((i) => (
                  <Badge
                    key={i.key}
                    variant={state.engagementIntensity === i.key ? 'default' : 'outline'}
                    className="cursor-pointer text-sm py-1 px-3"
                    onClick={() => setState((prev) => ({ ...prev, engagementIntensity: i.key }))}
                  >
                    {i.label}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Create Email */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Create Email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!state.bodyText && (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={() => setShowTemplatePicker(true)}
                >
                  <FileText className="h-6 w-6" />
                  <span>Use Template</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={() => {
                    setShowTemplatePicker(true)
                    setIsCustomising(true)
                  }}
                >
                  <Sparkles className="h-6 w-6" />
                  <span>AI Customise Template</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={() => void handleAIGenerate()}
                  disabled={generateDraft.isPending}
                >
                  {generateDraft.isPending ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <Sparkles className="h-6 w-6" />
                  )}
                  <span>{generateDraft.isPending ? 'Generating...' : 'AI Generate'}</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={() => setState((prev) => ({ ...prev, bodyText: ' ' }))}
                >
                  <PenLine className="h-6 w-6" />
                  <span>Write from Scratch</span>
                </Button>
              </div>
            )}

            {state.bodyText && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Subject Line</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setState((prev) => ({ ...prev, subject: '', bodyText: '', bodyHtml: null, sourceTemplateId: null }))}
                  >
                    Start Over
                  </Button>
                </div>
                <Input
                  value={state.subject}
                  onChange={(e) => setState((prev) => ({ ...prev, subject: e.target.value }))}
                  placeholder="Email subject line..."
                />

                <div>
                  <Label className="mb-1.5 block">Body</Label>
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
                          onClick={() => insertVariable(`{{${v.key}}}`)}
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
                          onClick={() => insertVariable(`{{${v.key}}}`)}
                        >
                          {v.key}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Textarea
                    ref={bodyRef}
                    value={state.bodyText.trim() === '' ? '' : state.bodyText}
                    onChange={(e) => setState((prev) => ({ ...prev, bodyText: e.target.value }))}
                    rows={12}
                    className="font-mono text-sm"
                    placeholder="Write your email body here..."
                  />
                  <p className="text-xs text-muted-foreground text-right mt-1">
                    {state.bodyText.trim().length} characters
                  </p>
                </div>

                {!state.draftId && state.campaignId && (
                  <Button onClick={handleSaveDraft} disabled={isSavingDraft || !state.bodyText.trim()}>
                    {isSavingDraft ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Save Draft
                  </Button>
                )}
                {!state.draftId && !state.campaignId && (
                  <p className="text-xs text-muted-foreground">
                    Link a campaign in Step 1 to save drafts and build recipient lists.
                  </p>
                )}
                {state.draftId && (
                  <Badge variant="default" className="py-1.5 px-3">
                    <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                    Draft saved (#{state.draftId})
                  </Badge>
                )}
              </div>
            )}

            <TemplatePicker
              open={showTemplatePicker}
              onClose={() => { setShowTemplatePicker(false); setIsCustomising(false) }}
              onSelect={handleSelectTemplate}
              onSelectAndCustomise={handleCustomiseTemplate}
              platform="email"
              stageNumber={state.stageNumber || 1}
              isCustomising={isCustomising}
            />
          </CardContent>
        </Card>
      )}

      {/* Step 4: List & Send */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Build List & Send</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Push all campaign workers to Action Network and create a targeted email.
              For advanced filtering, use the List Builder on the campaign page.
            </div>

            {!state.preparedTag && (
              <Button
                onClick={handlePushList}
                disabled={isPushingList || !state.campaignId}
              >
                {isPushingList ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Users className="h-4 w-4 mr-2" />
                )}
                {isPushingList ? 'Pushing contacts to AN...' : 'Push Campaign Workers to AN'}
              </Button>
            )}

            {state.preparedTag && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-green-800">
                      {state.preparedTag.contacts_tagged + state.preparedTag.contacts_created} contacts ready
                    </p>
                    <p className="text-green-700 text-xs">
                      Tag: {state.preparedTag.tag_name}
                      {state.preparedTag.contacts_created > 0 && ` (${state.preparedTag.contacts_created} new contacts created)`}
                    </p>
                  </div>
                </div>

                {!state.externalMessageId && (
                  <Button
                    onClick={handlePushToAN}
                    disabled={isPushingToAN || !state.draftId}
                  >
                    {isPushingToAN ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    {isPushingToAN ? 'Pushing email...' : 'Push Email to Action Network'}
                  </Button>
                )}

                {state.externalMessageId && (
                  <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                      <span className="font-medium text-blue-800">Email ready in Action Network</span>
                    </div>
                    <p className="text-sm text-blue-700">
                      The email has been created in Action Network targeting {state.preparedTag.contacts_tagged + state.preparedTag.contacts_created} contacts.
                      Go to Action Network to review and schedule the send.
                    </p>
                    <Button variant="outline" onClick={() => router.push('/campaigns')}>
                      Done — Back to Campaigns
                    </Button>
                  </div>
                )}
              </div>
            )}

            {!state.draftId && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                You need to save your draft in Step 3 before you can send.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        {step < 4 && (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed[step]}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  )
}
