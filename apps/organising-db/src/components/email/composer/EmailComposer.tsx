'use client'

/**
 * EmailComposer — unified campaign-scoped email composer.
 *
 * Replaces the prior 3-step CampaignEmailWizard with a full-viewport
 * split-pane editor + preview, side-panel AI brief, collapsible recipient
 * drawer, and a 3-path send footer (Action Network / open in mail client /
 * test).
 *
 * Preserved unchanged from the legacy wizard:
 *   - Draft lifecycle: campaign_comms_drafts read/update via Supabase.
 *   - AI generation: /api/generate-draft (default 'draft' mode).
 *   - Template picker: /api/templates/customise.
 *   - AN push: /api/campaigns/[id]/push-list + /api/action-network
 *     (action: create_message), with the same status side-effects on
 *     email_lists and email_list_items.
 *   - Campaign context derivation (timeline → agreement → employer →
 *     worksites → members → active stage → ambitions).
 *
 * New surfaces:
 *   - Local-client send via mailto / .eml (BCC).
 *   - Test-send loop (via AN or via mail client).
 *   - Rich-text editor with merge-field chips + slash menu + selection
 *     toolbar AI transforms.
 *   - Subject variants on demand.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { useGenerateDraft } from '@/lib/hooks/useGenerateDraft'
import {
  fetchApi,
  API_FETCH_TIMEOUT_LLM_MS,
  API_FETCH_TIMEOUT_UPLOAD_MS,
} from '@/lib/api/fetch-api'
import {
  resolveTemplateVariables,
  translateToActionNetwork,
} from '@/lib/comms/template-variables'
import { STAGE_NAMES } from '@/types/planner-types'
import type { CommsDraftRequest } from '@/types/planner-types'
import type { TemplateRow } from '@/lib/hooks/useTemplateLibrary'
import { EditEmailSetupDialog } from '@/components/email/orchestrator/EditEmailSetupDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from 'react-resizable-panels'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  CheckCircle,
  Cloud,
  CloudOff,
  FileText,
} from 'lucide-react'
import { TemplatePicker } from '@/components/campaigns/planning/TemplatePicker'
import { SubjectLineField, PreheaderField } from './SubjectLineField'
import { EmailPreviewPane, type PreviewSampleContact } from './EmailPreviewPane'
import { RecipientPanel, type RecipientRow } from './RecipientPanel'
import { SendActions } from './SendActions'
import {
  AiBriefPanel,
  type AiBriefSelections,
  generateSubjectVariants,
  applyTransform,
} from './AiBriefPanel'
import type {
  EmailBodyEditorRef,
  SelectionAction,
} from './EmailBodyEditor'
import { Card, CardContent } from '@/components/ui/card'

// Heavy editor + extensions are client-only and code-split to keep the
// route initial bundle small.
const EmailBodyEditor = dynamic(
  () => import('./EmailBodyEditor').then((m) => m.EmailBodyEditor),
  { ssr: false, loading: () => <EditorSkeleton /> },
) as unknown as React.ForwardRefExoticComponent<
  React.ComponentProps<typeof import('./EmailBodyEditor').EmailBodyEditor> &
    React.RefAttributes<EmailBodyEditorRef>
>

interface DraftRow {
  draft_id: number
  campaign_id: number
  subject: string | null
  preheader: string | null
  body: string
  body_html: string | null
  body_json: unknown | null
  tone: string | null
  audience_segment: string | null
  email_list_id: number | null
  stage_number: number | null
  status: string
  source_template_ids: number[] | null
}

interface CampaignContext {
  employerName: string
  agreementName: string
  organiserName: string
  organiserPhone: string
  worksiteNames: string[]
  campaignName: string
  campaignDescription: string
  campaignType: string
  campaignStatus: string
  memberCount: number
  membershipBreakdown: Record<string, number>
  employersByCount: Array<[string, number]>
  worksitesByCount: Array<[string, number]>
  activeStageNumber: number | null
  activeStageName: string | null
  ambitions: string[]
}

const SAVE_DEBOUNCE_MS = 1000

export function EmailComposer() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { user, profile } = useAuth()
  const generateDraft = useGenerateDraft()
  const editorRef = useRef<EmailBodyEditorRef>(null)

  const campaignId = Number(params.id)
  const draftIdParam = searchParams.get('draft_id')
  const draftId = useMemo(() => {
    if (!draftIdParam) return null
    const n = Number(draftIdParam)
    return Number.isFinite(n) ? n : null
  }, [draftIdParam])

  const returnTo = searchParams.get('returnTo')
  const backHref =
    returnTo && returnTo.startsWith('/')
      ? decodeURIComponent(returnTo)
      : `/campaigns/${campaignId}`

  // ------- Local state -------------------------------------------------
  const [subject, setSubject] = useState('')
  const [preheader, setPreheader] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [bodyHtml, setBodyHtml] = useState<string>('')
  const [bodyJson, setBodyJson] = useState<unknown>(null)
  const [editorMode, setEditorMode] = useState<'rich' | 'plain'>('rich')
  const [sourceTemplateId, setSourceTemplateId] = useState<number | null>(null)
  const [briefOpen, setBriefOpen] = useState(false)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [briefSelections, setBriefSelections] = useState<AiBriefSelections>({
    tone: [],
    audience: [],
    intensity: '',
    purpose: '',
  })
  const [draftGenWith, setDraftGenWith] = useState<{
    tone: string[]
    audience: string[]
  }>({ tone: [], audience: [] })
  const [subjectVariants, setSubjectVariants] = useState<string[]>([])
  const [isSubjectAiPending, setIsSubjectAiPending] = useState(false)
  const [isCustomisingTemplate, setIsCustomisingTemplate] =
    useState<number | null>(null)
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<number>>(
    new Set(),
  )
  const [workersInitialized, setWorkersInitialized] = useState(false)
  const [isPushingList, setIsPushingList] = useState(false)
  const [isPushingToAN, setIsPushingToAN] = useState(false)
  const [preparedTag, setPreparedTag] = useState<{
    tag_id: string
    tag_href: string
    tag_name: string
    tag_browser_url?: string | null
    contacts_tagged: number
    contacts_created: number
    write_confirmed_count?: number | null
    verified_tag_count?: number | null
    verification_warning?: string | null
  } | null>(null)
  const [pushResults, setPushResults] = useState<Array<{
    worker_id: number
    name: string
    status: string
    detail?: string
  }> | null>(null)
  const [externalMessageId, setExternalMessageId] = useState<string | null>(null)
  const [administrativeUrl, setAdministrativeUrl] = useState<string | null>(null)
  const [editSetupOpen, setEditSetupOpen] = useState(false)
  const [transformBusy, setTransformBusy] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  )
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // ------- Live announcer for screen readers ---------------------------
  const [liveMessage, setLiveMessage] = useState('')
  const announce = useCallback((msg: string) => {
    setLiveMessage('')
    requestAnimationFrame(() => setLiveMessage(msg))
  }, [])

  // ------- Data loads --------------------------------------------------

  const { data: draft, isLoading: draftLoading } = useQuery<DraftRow | null>({
    queryKey: ['email-composer-draft', draftId],
    enabled: draftId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_comms_drafts')
        .select(
          'draft_id, campaign_id, subject, preheader, body, body_html, body_json, tone, audience_segment, email_list_id, stage_number, status, source_template_ids',
        )
        .eq('draft_id', draftId!)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as DraftRow | null
    },
  })

  const { data: campaign } = useQuery({
    queryKey: ['email-composer-campaign', campaignId],
    enabled: Number.isFinite(campaignId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select(
          'campaign_id, name, organiser_id, description, campaign_type, status, start_date, end_date',
        )
        .eq('campaign_id', campaignId)
        .single()
      if (error) throw error
      return data
    },
  })

  // Full campaign-context query — preserved verbatim from the legacy
  // wizard so AI prompts get identical signal.
  const { data: campaignContext } = useQuery<CampaignContext>({
    queryKey: ['email-composer-context', campaignId],
    enabled: Number.isFinite(campaignId) && !!campaign,
    queryFn: () => loadCampaignContext(supabase, campaignId, campaign),
  })

  // Recipients (preferring email_list_items if attached; else fall back to
  // campaign membership via list-builder).
  const { data: listMembers = [], isLoading: listMembersLoading } = useQuery<
    RecipientRow[]
  >({
    queryKey: ['email-composer-list-members', draft?.email_list_id],
    enabled: !!draft?.email_list_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_list_items')
        .select(
          'worker_id, email, sort_order, workers!inner(first_name, last_name, email_status, occupation, employers(employer_name), worksites(worksite_name))',
        )
        .eq('list_id', draft!.email_list_id!)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []).map((row: Record<string, unknown>) => {
        const w = row.workers as
          | {
              first_name: string
              last_name: string
              email_status: string | null
              occupation: string | null
              employers: { employer_name: string } | { employer_name: string }[] | null
              worksites: { worksite_name: string } | { worksite_name: string }[] | null
            }
          | null
        const emp = w?.employers
        const ws = w?.worksites
        return {
          worker_id: row.worker_id as number,
          first_name: w?.first_name ?? '',
          last_name: w?.last_name ?? '',
          email: (row.email as string | null) ?? null,
          email_status: w?.email_status ?? null,
          occupation: w?.occupation ?? null,
          employer_name: Array.isArray(emp)
            ? emp[0]?.employer_name ?? null
            : emp?.employer_name ?? null,
          worksite_name: Array.isArray(ws)
            ? ws[0]?.worksite_name ?? null
            : ws?.worksite_name ?? null,
          source_label: `email_list#${draft!.email_list_id}`,
        }
      })
    },
  })

  const { data: campaignRecipients = [], isLoading: campaignRecipientsLoading } =
    useQuery<RecipientRow[]>({
      queryKey: ['email-composer-membership-recipients', campaignId],
      enabled: !draft?.email_list_id && Number.isFinite(campaignId),
      queryFn: async () => {
        const res = await fetchApi(`/api/campaigns/${campaignId}/list-builder?`)
        const json = await res.json()
        if (!json.success) throw new Error(json.error)
        const rows = json.data as Array<{
          worker_id: number
          first_name: string
          last_name: string
          email: string | null
          email_status: string | null
          occupation: string | null
          employer_name: string | null
          worksite_name: string | null
        }>
        return rows.map((r) => ({
          ...r,
          source_label: 'Campaign membership',
        }))
      },
    })

  const recipients = draft?.email_list_id ? listMembers : campaignRecipients
  const recipientsLoading = draft?.email_list_id
    ? listMembersLoading
    : campaignRecipientsLoading

  // ------- Hydrate state from loaded draft -----------------------------
  useEffect(() => {
    if (!draft) return
    setSubject(draft.subject || '')
    setPreheader(draft.preheader || '')
    setBodyText(draft.body || '')
    setBodyHtml(draft.body_html || '')
    setBodyJson(draft.body_json ?? null)
    if (draft.source_template_ids && draft.source_template_ids.length > 0) {
      setSourceTemplateId(draft.source_template_ids[0])
    }
    setBriefSelections((s) => ({
      ...s,
      tone:
        draft.tone && s.tone.length === 0
          ? draft.tone.split(',').map((t) => t.trim()).filter(Boolean)
          : s.tone,
      audience:
        draft.audience_segment && s.audience.length === 0
          ? draft.audience_segment
              .split(',')
              .map((a) => a.trim())
              .filter(Boolean)
          : s.audience,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.draft_id])

  // Initial recipient selection — all with a valid (non-bounced) email.
  useEffect(() => {
    if (recipientsLoading) return
    if (workersInitialized) return
    if (recipients.length === 0) return
    const withEmail = recipients.filter(
      (r) => r.email && r.email.trim() && r.email_status !== 'invalid',
    )
    setSelectedWorkerIds(new Set(withEmail.map((r) => r.worker_id)))
    setWorkersInitialized(true)
  }, [recipients, recipientsLoading, workersInitialized])

  // ------- Variable resolution context (campaign vars only) ----------
  const stageName = useMemo(() => {
    if (!draft?.stage_number) return 'General'
    return (
      STAGE_NAMES[draft.stage_number as keyof typeof STAGE_NAMES] ||
      `Stage ${draft.stage_number}`
    )
  }, [draft?.stage_number])

  const varContext = useMemo<Record<string, string | undefined>>(
    () => ({
      employer_name: campaignContext?.employerName || undefined,
      agreement_name: campaignContext?.agreementName || undefined,
      worksite_name: campaignContext?.worksiteNames?.[0] || undefined,
      campaign_name: campaignContext?.campaignName || undefined,
      organiser_name: campaignContext?.organiserName || undefined,
      organiser_phone: campaignContext?.organiserPhone || undefined,
      staff_name: profile?.display_name || user?.email || undefined,
      staff_email: user?.email || undefined,
      date: new Date().toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    }),
    [campaignContext, profile, user],
  )

  const sampleContacts: PreviewSampleContact[] = useMemo(() => {
    return recipients
      .filter((r) => r.first_name)
      .slice(0, 5)
      .map((r) => ({
        id: `recipient-${r.worker_id}`,
        label: `${r.first_name} ${r.last_name} ${r.occupation ? `· ${r.occupation}` : ''}`.trim(),
        first_name: r.first_name,
        last_name: r.last_name,
        occupation: r.occupation,
        email: r.email,
      }))
  }, [recipients])

  // ------- Editor change handler --------------------------------------
  const handleEditorChange = useCallback(
    (out: {
      html: string
      text: string
      json: unknown
    }) => {
      setBodyHtml(out.html)
      setBodyText(out.text)
      setBodyJson(out.json)
      setHasUnsavedChanges(true)
    },
    [],
  )

  // ------- AI: generate full draft (replaces existing body) -----------
  const handleAIGenerate = useCallback(async () => {
    if (!campaignContext) {
      toast.error('Campaign context still loading — try again in a moment.')
      return
    }
    if (
      briefSelections.tone.length === 0 ||
      briefSelections.audience.length === 0
    ) {
      toast.error('Pick at least one tone and one audience first.')
      return
    }
    const richContext = buildRichContextBlock(campaignContext)
    const purposeBlock = briefSelections.purpose.trim()
      ? `EMAIL PURPOSE / SPECIFIC ASK (from organiser):\n${briefSelections.purpose.trim()}`
      : ''
    const combinedInstructions = [purposeBlock, richContext]
      .filter(Boolean)
      .join('\n\n')

    const request: CommsDraftRequest = {
      campaign_id: campaignId,
      plan_id: 0,
      stage_number: draft?.stage_number || 1,
      stage_name: stageName,
      platform: 'email',
      campaign_context: {
        employer_name:
          campaignContext.employerName || 'the campaign workforce',
        agreement_name:
          campaignContext.agreementName || 'Independent Organising',
        worksite_names: campaignContext.worksiteNames,
        sector: 'offshore oil & gas',
        campaign_type: campaignContext.campaignType || undefined,
        organiser_name: campaignContext.organiserName || undefined,
        organiser_phone: campaignContext.organiserPhone || undefined,
        staff_name: profile?.display_name || user?.email || undefined,
        staff_email: user?.email || undefined,
      },
      wtp_selections: {
        tone: briefSelections.tone,
        audience: briefSelections.audience,
        platforms: ['Email'],
        engagement_intensity: briefSelections.intensity || undefined,
      },
      custom_instructions: combinedInstructions || undefined,
    }
    announce('AI is drafting your email…')
    try {
      const result = await generateDraft.mutateAsync(request)
      setSubject(result.subject || '')
      // Prefer HTML if the model returned it (better fidelity), else fall
      // back to plain text. The editor's setContent / replaceAllWith API
      // re-emits onChange so html/text/json sync downstream.
      if (result.body_html) {
        editorRef.current?.setContent(result.body_html, result.body_text)
      } else {
        editorRef.current?.replaceAllWith(result.body_text)
      }
      setDraftGenWith({
        tone: briefSelections.tone,
        audience: briefSelections.audience,
      })
      setHasUnsavedChanges(true)
      setBriefOpen(false)
      announce('AI draft ready.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI generation failed')
      announce('AI generation failed.')
    }
  }, [
    campaignContext,
    campaignId,
    draft?.stage_number,
    stageName,
    profile,
    user,
    briefSelections,
    generateDraft,
    announce,
  ])

  // ------- Template handlers ------------------------------------------
  const handleUseTemplate = useCallback((template: TemplateRow) => {
    setSubject(template.subject_line || '')
    if (template.body_html) {
      editorRef.current?.setContent(template.body_html, template.body_text)
    } else {
      editorRef.current?.replaceAllWith(template.body_text || '')
    }
    setSourceTemplateId(template.template_id)
    setDraftGenWith({
      tone: briefSelections.tone,
      audience: briefSelections.audience,
    })
    setHasUnsavedChanges(true)
  }, [briefSelections])

  const handleCustomiseTemplate = useCallback(
    async (template: TemplateRow) => {
      setIsCustomisingTemplate(template.template_id)
      try {
        const response = await fetchApi('/api/templates/customise', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_id: template.template_id,
            subject_line: template.subject_line,
            body_text: template.body_text,
            stage_number: draft?.stage_number || 1,
            stage_name: stageName,
            wtp_selections: {
              tone: briefSelections.tone,
              audience: briefSelections.audience,
              platforms: ['Email'],
              engagement_intensity: briefSelections.intensity || undefined,
            },
            campaign_context: {
              employer_name: campaignContext?.employerName || undefined,
              agreement_name: campaignContext?.agreementName || undefined,
              worksite_names: campaignContext?.worksiteNames ?? [],
              organiser_name: campaignContext?.organiserName || undefined,
              organiser_phone: campaignContext?.organiserPhone || undefined,
              staff_name: profile?.display_name || user?.email || undefined,
              staff_email: user?.email || undefined,
            },
            custom_instructions: briefSelections.purpose.trim() || undefined,
          }),
          timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
        })
        if (!response.ok) throw new Error('Customisation failed')
        const result = await response.json()
        setSubject(result.adapted_subject || template.subject_line || '')
        editorRef.current?.replaceAllWith(
          result.adapted_body_text || template.body_text || '',
        )
        setSourceTemplateId(template.template_id)
        setDraftGenWith({
          tone: briefSelections.tone,
          audience: briefSelections.audience,
        })
        setHasUnsavedChanges(true)
        toast.success('Template customised')
      } catch {
        toast.error('Customisation failed')
      } finally {
        setIsCustomisingTemplate(null)
      }
    },
    [
      draft?.stage_number,
      stageName,
      briefSelections,
      campaignContext,
      profile,
      user,
    ],
  )

  // ------- Selection AI transform -------------------------------------
  const handleSelectionAction = useCallback(
    async (action: SelectionAction, selectedText: string) => {
      if (transformBusy) return
      setTransformBusy(true)
      announce(`AI ${action.startsWith('tone:') ? 'shifting tone' : action.replace(':', ' ')}…`)
      try {
        const transformed = await applyTransform({
          text: selectedText,
          action,
          scope: 'selection',
        })
        if (transformed) {
          editorRef.current?.replaceSelectionWith(transformed)
          announce('AI transform applied.')
        }
      } finally {
        setTransformBusy(false)
      }
    },
    [transformBusy, announce],
  )

  // ------- Subject AI variants ----------------------------------------
  const handleSubjectVariants = useCallback(async () => {
    if (isSubjectAiPending) return
    setIsSubjectAiPending(true)
    announce('Generating subject ideas…')
    try {
      const variants = await generateSubjectVariants(
        bodyText,
        briefSelections.purpose,
      )
      setSubjectVariants(variants)
      if (variants.length > 0) announce(`${variants.length} subject ideas ready.`)
    } finally {
      setIsSubjectAiPending(false)
    }
  }, [bodyText, briefSelections.purpose, isSubjectAiPending, announce])

  // ------- Push handlers (unchanged behaviour) -----------------------
  const recipientEmails = useMemo(
    () =>
      recipients
        .filter((r) => selectedWorkerIds.has(r.worker_id))
        .map((r) => r.email)
        .filter((e): e is string => !!e && e.trim() !== ''),
    [recipients, selectedWorkerIds],
  )

  // ------- Save-to-Outlook handler -----------------------------------
  // The actual Graph calls happen server-side; we hand off worker IDs +
  // mode and let /api/campaigns/[id]/emails/[draftId]/save-to-outlook
  // resolve per-recipient tokens before creating each draft.
  //
  // We thread `saveDraft` through a ref because it's declared further down
  // the component (TDZ if referenced here directly). Reading via ref also
  // means we always invoke the freshest closure — important so the server
  // reads the latest body / subject / preheader, not whatever state was
  // captured when this callback was first memoised.
  const saveDraftRef = useRef<(silent?: boolean) => Promise<void>>(
    async () => {},
  )
  const handleSaveToOutlook = useCallback(
    async (
      mode: 'personalised' | 'bcc',
      overrides?: { subjectOverride: string; bodyHtmlOverride: string },
    ) => {
      if (!draftId) return null
      if (!bodyText.trim()) {
        toast.error('Body is empty — write or generate the email first.')
        return null
      }
      // Force-flush the latest draft state via the ref, so the server
      // reads fresh body/subject — guards against React closure staleness
      // when the user clicks save-to-outlook moments after typing.
      await saveDraftRef.current(true)
      const ids = recipients
        .filter((r) => selectedWorkerIds.has(r.worker_id) && r.email)
        .map((r) => r.worker_id)
      if (ids.length === 0) {
        toast.error('No recipients with valid email addresses.')
        return null
      }
      announce(
        mode === 'personalised'
          ? `Creating ${ids.length} personalised Outlook drafts…`
          : 'Creating shared BCC draft in Outlook…',
      )
      try {
        const payload: Record<string, unknown> = { mode, worker_ids: ids }
        if (overrides?.subjectOverride !== undefined) {
          payload.subject_override = overrides.subjectOverride
        }
        if (overrides?.bodyHtmlOverride !== undefined) {
          payload.body_html_override = overrides.bodyHtmlOverride
        }
        const res = await fetchApi(
          `/api/campaigns/${campaignId}/emails/${draftId}/save-to-outlook`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
          },
        )
        const data = await res.json()
        if (!res.ok || !data.success) {
          if (data?.needs_connection) {
            toast.error(
              'Outlook is not connected — use the dropdown to connect first.',
            )
          } else {
            toast.error(data?.error || 'Save to Outlook failed.')
          }
          return null
        }
        announce(
          `${data.drafts_created} draft${data.drafts_created === 1 ? '' : 's'} saved to Outlook.`,
        )
        return {
          drafts_created: data.drafts_created as number,
          drafts_failed: data.drafts_failed as number,
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Save to Outlook failed.')
        return null
      }
    },
    // saveDraft is declared further down the component (TDZ at this line);
    // we read it through `saveDraftRef` set below so the latest closure
    // (with up-to-date body / subject / preheader) is invoked here.
    [
      draftId,
      campaignId,
      bodyText,
      recipients,
      selectedWorkerIds,
      announce,
    ],
  )

  const handlePushList = useCallback(async () => {
    if (!draftId) return
    setIsPushingList(true)
    announce('Pushing list to Action Network…')
    try {
      const res = await fetchApi(`/api/campaigns/${campaignId}/push-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft_id: draftId,
          filters: {},
          worker_ids: [...selectedWorkerIds],
        }),
        timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Push failed')
      const pushed = (data.contacts_tagged ?? 0) + (data.contacts_created ?? 0)
      setPreparedTag({
        tag_id: data.tag_id,
        tag_href: data.tag_href,
        tag_browser_url: data.tag_browser_url ?? null,
        tag_name: data.tag_name,
        contacts_tagged: data.contacts_tagged,
        contacts_created: data.contacts_created,
        write_confirmed_count: data.write_confirmed_count ?? null,
        verified_tag_count: data.verified_tag_count ?? null,
        verification_warning: data.verification_warning ?? null,
      })
      if (Array.isArray(data.worker_results)) {
        setPushResults(data.worker_results)
      }
      // Toast tone is driven by AN's authoritative write-confirmation:
      //   - write_confirmed < pushed → real failure, warn
      //   - write_confirmed == pushed but read lags → info (eventual consistency)
      //   - write_confirmed == pushed and read agrees → success
      const writeConfirmed = data.write_confirmed_count
      const isReadLag =
        typeof writeConfirmed === 'number' &&
        typeof data.verified_tag_count === 'number' &&
        writeConfirmed > 0 &&
        data.verified_tag_count < writeConfirmed
      const realFailure =
        typeof writeConfirmed === 'number' && writeConfirmed < pushed
      if (realFailure) {
        toast.warning(
          data.verification_warning ??
            `Only ${writeConfirmed} of ${pushed} taggings confirmed by Action Network.`,
        )
        announce('Push to Action Network completed with errors.')
      } else if (isReadLag) {
        toast.info(
          `${writeConfirmed} taggings confirmed on AN. Read API still shows ${data.verified_tag_count} — normal lag, will catch up within 1–2 minutes.`,
        )
        announce('List pushed; AN read API still propagating.')
      } else if (typeof writeConfirmed === 'number') {
        toast.success(
          `${writeConfirmed} ${
            writeConfirmed === 1 ? 'contact' : 'contacts'
          } confirmed on AN tag "${data.tag_name}"`,
        )
        announce('List pushed and confirmed on Action Network.')
      } else if (data.verification_warning) {
        toast.warning(data.verification_warning)
        announce('Push to Action Network completed with verification warning.')
      } else if (typeof data.verified_tag_count === 'number') {
        toast.success(
          `${data.verified_tag_count} ${
            data.verified_tag_count === 1 ? 'contact' : 'contacts'
          } verified on AN tag "${data.tag_name}"`,
        )
        announce('List pushed and verified on Action Network.')
      } else {
        toast.success(`${pushed} contacts pushed to AN`)
        announce('List pushed to Action Network.')
      }

      if (draft?.email_list_id) {
        const totalSent =
          (data.contacts_tagged ?? 0) + (data.contacts_created ?? 0)
        await supabase
          .from('email_lists')
          .update({ status: 'sent', sent_items: totalSent })
          .eq('list_id', draft.email_list_id)
        if (Array.isArray(data.worker_results)) {
          const sentWorkerIds = (
            data.worker_results as Array<{ worker_id: number; status: string }>
          )
            .filter((r) => r.status === 'tagged' || r.status === 'created')
            .map((r) => r.worker_id)
          if (sentWorkerIds.length > 0) {
            await supabase
              .from('email_list_items')
              .update({ status: 'sent', sent_at: new Date().toISOString() })
              .eq('list_id', draft.email_list_id)
              .in('worker_id', sentWorkerIds)
          }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Push failed')
      announce('Push to Action Network failed.')
    } finally {
      setIsPushingList(false)
    }
  }, [
    draftId,
    campaignId,
    selectedWorkerIds,
    draft?.email_list_id,
    supabase,
    announce,
  ])

  const handleCreateMessage = useCallback(async () => {
    if (!draftId) return
    if (!bodyText.trim()) {
      toast.error('Body is empty — write or generate the email first.')
      return
    }
    setIsPushingToAN(true)
    announce('Creating message in Action Network…')
    try {
      const resolvedSubject = translateToActionNetwork(
        resolveTemplateVariables(subject, varContext),
      )
      const resolvedBody = translateToActionNetwork(
        resolveTemplateVariables(bodyHtml || bodyText, varContext),
      )
      // Per https://actionnetwork.org/docs/v2/messages, `targets` expects
      // saved-query hrefs — not tag hrefs. Sending a tag href was silently
      // ignored. Surface the tag in the admin title so the organiser knows
      // which include filter to set in AN before sending.
      const adminTitle = preparedTag?.tag_name
        ? `${resolvedSubject || 'Untitled'} — push tag ${preparedTag.tag_name}`
        : resolvedSubject || 'Untitled'
      const messagePayload: Record<string, unknown> = {
        name: adminTitle,
        subject: resolvedSubject,
        body: resolvedBody,
        from: 'Offshore Alliance',
        reply_to: 'info@offshorealliance.org.au',
      }
      if (preheader.trim()) {
        messagePayload.preheader = translateToActionNetwork(
          resolveTemplateVariables(preheader, varContext),
        )
      }
      const createRes = await fetchApi('/api/action-network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_message',
          message: messagePayload,
        }),
        timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
      })
      const createData = await createRes.json()
      if (!createData.success) throw new Error(createData.error)
      const messageHref = createData.data?._links?.self?.href ?? ''
      const messageId = messageHref.split('/').pop() || ''
      const adminUrl = (createData.data?.administrative_url as string | undefined) ?? null
      await supabase
        .from('campaign_comms_drafts')
        .update({
          status: 'sent',
          sent_via: 'action_network',
          external_message_id: messageId,
          send_stats: adminUrl
            ? { administrative_url: adminUrl, an_tag_name: preparedTag?.tag_name ?? null }
            : { an_tag_name: preparedTag?.tag_name ?? null },
        })
        .eq('draft_id', draftId)
      setExternalMessageId(messageId)
      setAdministrativeUrl(adminUrl)
      toast.success(
        preparedTag?.tag_name
          ? `Draft created in AN. Open AN and target tag "${preparedTag.tag_name}" before sending.`
          : 'Draft created in Action Network — open AN to set targeting before sending.',
      )
      announce('Action Network message created.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Push failed')
      announce('Action Network push failed.')
    } finally {
      setIsPushingToAN(false)
    }
  }, [
    draftId,
    subject,
    preheader,
    bodyHtml,
    bodyText,
    varContext,
    preparedTag,
    supabase,
    announce,
  ])

  const handleSendTestViaAN = useCallback(
    async (testRecipient: string) => {
      if (!bodyText.trim()) {
        toast.error('Body is empty.')
        return
      }
      announce('Sending test via Action Network…')
      try {
        const resolvedSubject = `[TEST] ${translateToActionNetwork(
          resolveTemplateVariables(subject, varContext),
        )}`
        const resolvedBody = translateToActionNetwork(
          resolveTemplateVariables(bodyHtml || bodyText, varContext),
        )
        const createRes = await fetchApi('/api/action-network', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create_message',
            message: {
              subject: resolvedSubject,
              body: resolvedBody,
              from: 'Offshore Alliance',
              reply_to: 'info@offshorealliance.org.au',
              recipients: [{ email_address: testRecipient }],
            },
          }),
          timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
        })
        const data = await createRes.json()
        if (!data.success) throw new Error(data.error)
        toast.success('Test message queued in Action Network.')
        announce('Test queued in Action Network.')
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Test send failed',
        )
        announce('Test send failed.')
      }
    },
    [subject, bodyHtml, bodyText, varContext, announce],
  )

  // ------- Autosave (debounced) ---------------------------------------
  const saveDraft = useCallback(
    async (silent = true) => {
      if (!draftId) return
      setSaveState('saving')
      try {
        const { error } = await supabase
          .from('campaign_comms_drafts')
          .update({
            subject: subject || null,
            preheader: preheader || null,
            body: bodyText,
            body_html: bodyHtml || null,
            body_json: bodyJson || null,
            tone: briefSelections.tone.join(', ') || null,
            audience_segment: briefSelections.audience.join(', ') || null,
            source_template_ids: sourceTemplateId ? [sourceTemplateId] : null,
          })
          .eq('draft_id', draftId)
        if (error) throw error
        setSaveState('saved')
        setLastSavedAt(new Date())
        setHasUnsavedChanges(false)
        if (!silent) toast.success('Draft saved')
      } catch (err) {
        setSaveState('error')
        if (!silent) {
          toast.error(err instanceof Error ? err.message : 'Save failed')
        }
      }
    },
    [
      draftId,
      subject,
      preheader,
      bodyText,
      bodyHtml,
      bodyJson,
      briefSelections.tone,
      briefSelections.audience,
      sourceTemplateId,
      supabase,
    ],
  )

  // Keep the ref pointed at the latest saveDraft closure so the
  // save-to-outlook flow always force-flushes with current state.
  useEffect(() => {
    saveDraftRef.current = saveDraft
  }, [saveDraft])

  useEffect(() => {
    if (!hasUnsavedChanges) return
    if (!draftId) return
    const t = setTimeout(() => {
      void saveDraft(true)
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [
    hasUnsavedChanges,
    draftId,
    subject,
    preheader,
    bodyText,
    bodyHtml,
    bodyJson,
    briefSelections.tone,
    briefSelections.audience,
    sourceTemplateId,
    saveDraft,
  ])

  // ------- OAuth return toast -----------------------------------------
  // When the user returns from Microsoft's consent screen the callback
  // route appends ?oauth=connected|denied|error&oauth_detail=… to the
  // returnTo URL. Surface that as a toast and strip the query so a page
  // refresh doesn't repeat it.
  useEffect(() => {
    const status = searchParams.get('oauth')
    if (!status) return
    const detail = searchParams.get('oauth_detail') || ''
    if (status === 'connected') {
      toast.success(
        detail ? `Outlook connected as ${detail}` : 'Outlook connected.',
      )
    } else if (status === 'denied') {
      toast.error('Outlook connection denied. You can try again any time.')
    } else if (status === 'error') {
      toast.error(`Outlook connection error${detail ? `: ${detail}` : '.'}`)
    }
    // Strip query params without triggering a navigation.
    const url = new URL(window.location.href)
    url.searchParams.delete('oauth')
    url.searchParams.delete('oauth_detail')
    window.history.replaceState({}, '', url.toString())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ------- Keyboard shortcuts -----------------------------------------
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === 's') {
        e.preventDefault()
        void saveDraft(false)
        return
      }
      if (meta && e.key === 'k' && !e.shiftKey) {
        // Let editor handle Cmd+K for links when focused; otherwise no-op.
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [saveDraft])

  // ------- Render ------------------------------------------------------
  if (draftId == null) {
    return (
      <Card className="m-6">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Missing draft context. Open the email composer from{' '}
          <strong>Create Email</strong> on the campaign page or via Build List
          on the wall chart.
          <div className="pt-4">
            <Button
              variant="outline"
              onClick={() => router.push(`/campaigns/${campaignId}`)}
            >
              Back to campaign
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (draftLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const hasBody = bodyText.trim().length > 0
  const draftGenStale =
    hasBody &&
    (JSON.stringify([...draftGenWith.tone].sort()) !==
      JSON.stringify([...briefSelections.tone].sort()) ||
      JSON.stringify([...draftGenWith.audience].sort()) !==
        JSON.stringify([...briefSelections.audience].sort()))

  return (
    <div className="-m-6 flex flex-col h-[calc(100vh-4rem)] bg-muted/10">
      {/* Live region for AI/save announcements */}
      <div className="sr-only" role="status" aria-live="polite">
        {liveMessage}
      </div>

      {/* Top bar */}
      <header className="flex items-center justify-between gap-2 px-4 py-2 bg-background border-b flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold truncate">
              {campaign?.name || `Campaign ${campaignId}`}
            </h1>
            <p className="text-[11px] text-muted-foreground truncate">
              Draft #{draftId}
              {stageName !== 'General' ? ` · ${stageName}` : ''}
              {sourceTemplateId ? ` · template #${sourceTemplateId}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SaveIndicator
            state={saveState}
            lastSavedAt={lastSavedAt}
            onManualSave={() => void saveDraft(false)}
          />
          <div className="flex items-center gap-1.5">
            <Switch
              id="rich-mode"
              checked={editorMode === 'rich'}
              onCheckedChange={(checked) =>
                setEditorMode(checked ? 'rich' : 'plain')
              }
            />
            <Label htmlFor="rich-mode" className="text-xs cursor-pointer">
              Rich text
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTemplatePickerOpen(true)}
            className="gap-1.5"
          >
            <FileText className="h-3.5 w-3.5" />
            {hasBody ? 'Swap template' : 'Use template'}
            {sourceTemplateId && (
              <Badge variant="secondary" className="ml-1 text-[10px] py-0">
                #{sourceTemplateId}
              </Badge>
            )}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setBriefOpen(true)}
            className="gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {hasBody ? 'AI brief' : 'Create with AI'}
            {draftGenStale && (
              <Badge variant="outline" className="ml-1 text-[10px] py-0">
                Stale
              </Badge>
            )}
          </Button>
        </div>
      </header>

      {/* Subject + preheader */}
      <section className="px-5 pt-4 pb-3 bg-background border-b flex-shrink-0 space-y-3">
        <SubjectLineField
          value={subject}
          onChange={(v) => {
            setSubject(v)
            setHasUnsavedChanges(true)
          }}
          onRequestAiVariants={handleSubjectVariants}
          isAiPending={isSubjectAiPending}
          variants={subjectVariants}
          onPickVariant={(v) => {
            setSubject(v)
            setSubjectVariants([])
            setHasUnsavedChanges(true)
          }}
        />
        <PreheaderField
          value={preheader}
          onChange={(v) => {
            setPreheader(v)
            setHasUnsavedChanges(true)
          }}
        />
      </section>

      {/* Split-pane: editor / preview */}
      <div className="flex-1 min-h-0">
        <PanelGroup
          orientation="horizontal"
          className="h-full flex"
        >
          <Panel defaultSize={60} minSize={40} className="flex flex-col bg-background">
            <EmailBodyEditor
              ref={editorRef}
              mode={editorMode}
              initialHtml={bodyHtml || draft?.body_html || null}
              initialText={draft?.body || ''}
              onChange={handleEditorChange}
              onSelectionAction={handleSelectionAction}
              onOpenBriefPanel={() => setBriefOpen(true)}
              placeholder="Write the email body. Type / for AI commands, {{ for merge fields."
            />
            {transformBusy && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-popover border shadow px-3 py-1.5 text-xs flex items-center gap-2 z-50">
                <Loader2 className="h-3 w-3 animate-spin" />
                AI working…
              </div>
            )}
          </Panel>
          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/40 transition-colors" />
          <Panel defaultSize={40} minSize={25}>
            <EmailPreviewPane
              subject={subject}
              preheader={preheader}
              bodyHtml={bodyHtml}
              bodyText={bodyText}
              campaignContext={varContext}
              sampleContacts={sampleContacts}
            />
          </Panel>
        </PanelGroup>
      </div>

      {/* Recipient panel */}
      <section className="px-4 py-2 bg-background border-t flex-shrink-0">
        <RecipientPanel
          recipients={recipients}
          isLoading={recipientsLoading}
          selectedIds={selectedWorkerIds}
          onChangeSelected={setSelectedWorkerIds}
          emailListId={draft?.email_list_id ?? null}
          onEditSetup={() => setEditSetupOpen(true)}
        />
      </section>

      {/* Push result errors — only when at least one worker failed/skipped.
          The verification badge in SendActions covers the success path. */}
      {pushResults && pushResults.some((r) => r.status === 'error' || r.status === 'skipped') && (
        <section className="px-4 py-2 bg-amber-50 border-t border-amber-200 flex-shrink-0 text-xs text-amber-900">
          <p className="font-medium">
            {pushResults.filter((r) => r.status === 'error' || r.status === 'skipped').length} of{' '}
            {pushResults.length} workers were not tagged in Action Network
          </p>
          <details className="mt-1">
            <summary className="cursor-pointer underline opacity-80 hover:opacity-100">
              Show details
            </summary>
            <ul className="mt-1 list-disc pl-5 max-h-32 overflow-auto">
              {pushResults
                .filter((r) => r.status === 'error' || r.status === 'skipped')
                .map((r) => (
                  <li key={r.worker_id}>
                    <strong>{r.name}</strong> — {r.status}: {r.detail ?? '—'}
                  </li>
                ))}
            </ul>
          </details>
        </section>
      )}

      {/* Footer send actions */}
      <SendActions
        userEmail={user?.email ?? undefined}
        varContext={varContext}
        subject={subject}
        bodyHtml={bodyHtml}
        bodyText={bodyText}
        recipientEmails={recipientEmails}
        recipientCount={recipientEmails.length}
        hasBody={hasBody}
        preparedTag={preparedTag}
        externalMessageId={externalMessageId}
        administrativeUrl={administrativeUrl}
        isPushingList={isPushingList}
        isPushingToAN={isPushingToAN}
        onPushList={handlePushList}
        onCreateMessage={handleCreateMessage}
        onSendTestViaAN={handleSendTestViaAN}
        onSaveToOutlook={handleSaveToOutlook}
        campaignId={campaignId}
        draftId={draftId ?? null}
        selectedWorkerIds={[...selectedWorkerIds]}
        recipientWorkers={recipients
          .filter((r) => selectedWorkerIds.has(r.worker_id))
          .map((r) => ({
            worker_id: r.worker_id,
            first_name: r.first_name,
            last_name: r.last_name,
            occupation: r.occupation,
            employer_name: r.employer_name,
            worksite_name: r.worksite_name,
          }))}
      />

      <EditEmailSetupDialog
        open={editSetupOpen}
        onOpenChange={setEditSetupOpen}
        campaignId={campaignId}
        draftId={draftId}
      />

      <AiBriefPanel
        open={briefOpen}
        onOpenChange={setBriefOpen}
        selections={briefSelections}
        onSelectionsChange={setBriefSelections}
        isPending={generateDraft.isPending}
        hasExistingDraft={hasBody}
        onGenerate={handleAIGenerate}
        stageNumber={draft?.stage_number || 1}
        onUseTemplate={handleUseTemplate}
        onCustomiseTemplate={handleCustomiseTemplate}
        isCustomisingTemplateId={isCustomisingTemplate}
      />

      {/* Templates picker — surfaced as a peer of the AI brief so neither
          pathway is hidden behind the other. Reuses the same use-as-is
          and customise-with-AI handlers. */}
      <TemplatePicker
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        onSelect={(t) => {
          handleUseTemplate(t)
          setTemplatePickerOpen(false)
        }}
        onSelectAndCustomise={(t) => {
          handleCustomiseTemplate(t)
          setTemplatePickerOpen(false)
        }}
        platform="email"
        stageNumber={draft?.stage_number || 1}
        isCustomising={isCustomisingTemplate}
      />
    </div>
  )
}

function SaveIndicator({
  state,
  lastSavedAt,
  onManualSave,
}: {
  state: 'idle' | 'saving' | 'saved' | 'error'
  lastSavedAt: Date | null
  onManualSave: () => void
}) {
  const label =
    state === 'saving'
      ? 'Saving…'
      : state === 'saved'
      ? lastSavedAt
        ? `Saved · ${lastSavedAt.toLocaleTimeString('en-AU', {
            hour: '2-digit',
            minute: '2-digit',
          })}`
        : 'Saved'
      : state === 'error'
      ? 'Save failed — click to retry'
      : 'Unsaved'

  const Icon =
    state === 'saving'
      ? Loader2
      : state === 'saved'
      ? CheckCircle
      : state === 'error'
      ? CloudOff
      : Cloud

  return (
    <button
      type="button"
      onClick={onManualSave}
      className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1.5"
      title="Click to save now (Cmd/Ctrl+S)"
    >
      <Icon
        className={`h-3 w-3 ${state === 'saving' ? 'animate-spin' : ''} ${state === 'error' ? 'text-red-600' : ''}`}
      />
      {label}
    </button>
  )
}

function EditorSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-6">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  )
}

interface CampaignLike {
  campaign_id: number
  name?: string | null
  organiser_id?: number | null
  description?: string | null
  campaign_type?: string | null
  status?: string | null
}

/**
 * Preserved verbatim from the legacy CampaignEmailWizard so AI generation
 * receives the same narrative context. Kept as a separate function so the
 * orchestrator file stays readable.
 */
async function loadCampaignContext(
  supabase: ReturnType<typeof createClient>,
  campaignId: number,
  campaign: CampaignLike | undefined,
): Promise<CampaignContext> {
  let agreementName = ''
  let agreementEmployerId: number | null = null
  let employerName = ''

  const { data: timeline } = await supabase
    .from('campaign_timelines')
    .select('agreement_id')
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (timeline?.agreement_id) {
    const { data: agreement } = await supabase
      .from('agreements')
      .select('agreement_name, employer_id')
      .eq('agreement_id', timeline.agreement_id)
      .single()
    agreementName = agreement?.agreement_name ?? ''
    agreementEmployerId = agreement?.employer_id ?? null
    if (agreementEmployerId) {
      const { data: employer } = await supabase
        .from('employers')
        .select('employer_name')
        .eq('employer_id', agreementEmployerId)
        .single()
      employerName = employer?.employer_name ?? ''
    }
  }

  let organiserName = ''
  let organiserPhone = ''
  if (campaign?.organiser_id) {
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
    .eq('campaign_id', campaignId)
  let worksiteNames = (wsLinks ?? [])
    .map(
      (r: Record<string, unknown>) =>
        (r.worksites as { worksite_name: string } | null)?.worksite_name,
    )
    .filter(Boolean) as string[]

  const employerCounts = new Map<string, number>()
  const worksiteCounts = new Map<string, number>()
  let memberCount = 0
  const membershipBreakdown: Record<string, number> = {
    member: 0,
    member_pending: 0,
    non_member: 0,
    unknown: 0,
  }
  const { data: members } = await supabase
    .from('campaign_worker_membership')
    .select(
      `worker_id,
       workers!inner(
         employer_id,
         employers(employer_name),
         worksites(worksite_name),
         union_membership_type:union_membership_types(type_name)
       )`,
    )
    .eq('campaign_id', campaignId)
  for (const row of members ?? []) {
    memberCount += 1
    const w = row.workers as unknown as {
      employer_id: number | null
      employers: { employer_name: string } | { employer_name: string }[] | null
      worksites: { worksite_name: string } | { worksite_name: string }[] | null
      union_membership_type:
        | { type_name: string }
        | { type_name: string }[]
        | null
    } | null
    const empName = Array.isArray(w?.employers)
      ? w?.employers[0]?.employer_name
      : w?.employers?.employer_name
    if (empName) employerCounts.set(empName, (employerCounts.get(empName) ?? 0) + 1)
    const wsName = Array.isArray(w?.worksites)
      ? w?.worksites[0]?.worksite_name
      : w?.worksites?.worksite_name
    if (wsName) worksiteCounts.set(wsName, (worksiteCounts.get(wsName) ?? 0) + 1)
    const ump = Array.isArray(w?.union_membership_type)
      ? w?.union_membership_type[0]
      : w?.union_membership_type
    const typeName = ump?.type_name ?? 'unknown'
    if (typeName in membershipBreakdown) membershipBreakdown[typeName] += 1
    else membershipBreakdown.unknown += 1
  }

  const employersByCount = [...employerCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )
  const worksitesByCount = [...worksiteCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )

  if (!employerName && employersByCount.length > 0) {
    employerName = employersByCount[0][0]
  }
  if (worksiteNames.length === 0 && worksitesByCount.length > 0) {
    worksiteNames = worksitesByCount.slice(0, 5).map(([name]) => name)
  }

  let activeStageNumber: number | null = null
  let activeStageName: string | null = null
  const ambitions: string[] = []
  const { data: stagePlans } = await supabase
    .from('campaign_stage_plans')
    .select('plan_id, stage_number, status')
    .eq('campaign_id', campaignId)
  const active = stagePlans?.find((s) => s.status === 'active')
  if (active) {
    activeStageNumber = active.stage_number
    const stageMap: Record<number, string> = {
      1: 'Contact ID & Mapping',
      2: 'Intro Comms & Education',
      3: 'Member Mobilisation',
      4: 'Develop Claims / MSD',
      5: 'Endorsement & Commence Bargaining',
      6: 'Bargaining to Win',
    }
    activeStageName = stageMap[active.stage_number] ?? `Stage ${active.stage_number}`

    const { data: ambitionRows } = await supabase
      .from('plan_ambitions')
      .select(
        'custom_text, target_value, target_unit, target_date, ambition_options(option_text)',
      )
      .eq('plan_id', active.plan_id)
      .order('sort_order', { ascending: true })
      .limit(5)
    for (const a of ambitionRows ?? []) {
      const optText = Array.isArray((a as Record<string, unknown>).ambition_options)
        ? ((a as Record<string, unknown>).ambition_options as Array<{
            option_text: string
          }>)[0]?.option_text
        : ((a as Record<string, unknown>).ambition_options as {
            option_text: string
          } | null)?.option_text
      const text = ((a as { custom_text: string | null }).custom_text || optText || '').trim()
      if (!text) continue
      const target = (a as { target_value: string | null; target_unit: string | null })
        .target_value
        ? ` — target ${(a as { target_value: string }).target_value}${
            (a as { target_unit: string | null }).target_unit
              ? ` ${(a as { target_unit: string }).target_unit}`
              : ''
          }`
        : ''
      ambitions.push(`${text}${target}`)
    }
  }

  return {
    employerName,
    agreementName,
    organiserName,
    organiserPhone,
    worksiteNames,
    campaignName: campaign?.name ?? '',
    campaignDescription: campaign?.description ?? '',
    campaignType: campaign?.campaign_type ?? '',
    campaignStatus: campaign?.status ?? '',
    memberCount,
    membershipBreakdown,
    employersByCount: employersByCount.slice(0, 5),
    worksitesByCount: worksitesByCount.slice(0, 5),
    activeStageNumber,
    activeStageName,
    ambitions,
  }
}

function buildRichContextBlock(ctx: CampaignContext | null | undefined): string {
  if (!ctx) return ''
  const lines: string[] = ['CAMPAIGN SNAPSHOT — narrative context to ground the draft:']
  if (ctx.campaignName) {
    lines.push(
      `- Campaign: "${ctx.campaignName}"${ctx.campaignType ? ` (type: ${ctx.campaignType})` : ''}`,
    )
  }
  if (ctx.campaignDescription) lines.push(`- Description: ${ctx.campaignDescription}`)
  if (ctx.activeStageName) {
    lines.push(`- Active stage: Stage ${ctx.activeStageNumber} — ${ctx.activeStageName}`)
  }
  if (ctx.ambitions.length > 0) {
    lines.push('- Current stage ambitions:')
    for (const a of ctx.ambitions) lines.push(`    • ${a}`)
  }
  if (ctx.memberCount > 0) {
    const parts: string[] = []
    const mb = ctx.membershipBreakdown
    if (mb.member) parts.push(`${mb.member} members`)
    if (mb.member_pending) parts.push(`${mb.member_pending} pending`)
    if (mb.non_member) parts.push(`${mb.non_member} non-members`)
    lines.push(
      `- Workforce on campaign: ${ctx.memberCount} workers${parts.length ? ` (${parts.join(', ')})` : ''}`,
    )
  }
  if (
    ctx.employersByCount.length > 1 ||
    (ctx.employersByCount.length === 1 && !ctx.employerName)
  ) {
    const empSummary = ctx.employersByCount
      .map(([name, count]) => `${name} (${count})`)
      .join(', ')
    lines.push(`- Employers in scope: ${empSummary}`)
  }
  if (ctx.worksitesByCount.length > 0 && ctx.worksiteNames.length === 0) {
    lines.push(
      `- Worksites (derived from members): ${ctx.worksitesByCount
        .map(([n, c]) => `${n} (${c})`)
        .join(', ')}`,
    )
  }
  if (ctx.agreementName) lines.push(`- Enterprise agreement: ${ctx.agreementName}`)
  if (ctx.organiserName) {
    lines.push(
      `- Lead organiser: ${ctx.organiserName}${ctx.organiserPhone ? ` (${ctx.organiserPhone})` : ''}`,
    )
  }
  lines.push(
    '',
    'Use this snapshot to choose concrete agitation hooks and a believable ask. If a field is missing, write generically rather than inventing specifics.',
  )
  return lines.length <= 2 ? '' : lines.join('\n')
}

