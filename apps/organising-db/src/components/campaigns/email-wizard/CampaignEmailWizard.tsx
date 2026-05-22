'use client'

/**
 * CampaignEmailWizard — campaign-scoped email coordinator.
 *
 * Sibling to the standalone EmailWizardSteps. Reuses the same AI generation
 * (useGenerateDraft), Action Network push (/api/campaigns/[id]/push-list),
 * and template-variable resolution. Differences from the legacy wizard:
 *   • Campaign is locked from the URL `[id]` segment — no Step 1.
 *   • Draft + (optional) email_list are loaded from a required draft_id URL param.
 *   • Body step is pathway-aware: AI auto-fires generation when entering with
 *     an empty body; paste leaves the editor empty.
 *   • Recipient step prefers email_list_items when an email_list is attached.
 *   • "Edit setup" button surfaces EditEmailSetupDialog for switching pathway
 *     mid-session or replacing the recipient list.
 *
 * Entered from:
 *   /campaigns/[id]/email/setup/order      (setup-first)
 *   /campaigns/[id]/email/lists/new        (list-first / build_list, after list creation)
 *   /campaigns/[id]/email/setup            (build_list, after pathway pick)
 *   EmailResumeBanner                       (resume in-progress draft)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { useGenerateDraft } from '@/lib/hooks/useGenerateDraft'
import {
  fetchApi,
  API_FETCH_TIMEOUT_LLM_MS,
  API_FETCH_TIMEOUT_UPLOAD_MS,
} from '@/lib/api/fetch-api'
import {
  RECIPIENT_VARIABLES,
  CAMPAIGN_CONTEXT_VARIABLES,
  resolveTemplateVariables,
  translateToActionNetwork,
} from '@/lib/comms/template-variables'
import { STAGE_NAMES } from '@/types/planner-types'
import type { CommsDraftRequest } from '@/types/planner-types'
import { EditEmailSetupDialog } from '@/components/email/orchestrator/EditEmailSetupDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils/cn'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Mail,
  Send,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Loader2,
  Sparkles,
  PenLine,
  Settings,
  Target,
  Variable,
  Users,
} from 'lucide-react'
import {
  pathwayForEmail,
  type EmailEntryBranch,
  type EmailPathway,
} from '@/types/email-action'

const STEPS = [
  { id: 1, title: 'Tone & Audience', icon: Target },
  { id: 2, title: 'Create Email', icon: Mail },
  { id: 3, title: 'List & Send', icon: Send },
] as const

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

interface DraftRow {
  draft_id: number
  campaign_id: number
  subject: string | null
  body: string
  body_html: string | null
  tone: string | null
  audience_segment: string | null
  entry_branch: EmailEntryBranch | null
  email_list_id: number | null
  stage_number: number | null
  status: string
}

interface RecipientRow {
  worker_id: number
  first_name: string
  last_name: string
  email: string | null
  occupation: string | null
  employer_name: string | null
  worksite_name: string | null
  source_label: string
}

function isPathway(v: string | null): v is EmailPathway {
  return v === 'ai' || v === 'paste'
}

export function CampaignEmailWizard() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { user, profile } = useAuth()
  const generateDraft = useGenerateDraft()
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const campaignId = Number(params.id)
  const draftIdParam = searchParams.get('draft_id')
  const draftId = useMemo(() => {
    if (!draftIdParam) return null
    const n = Number(draftIdParam)
    return Number.isFinite(n) ? n : null
  }, [draftIdParam])

  const pathwayParam = searchParams.get('pathway')
  const urlPathway = isPathway(pathwayParam) ? pathwayParam : null
  const entryBranchParam = searchParams.get('entry_branch') as EmailEntryBranch | null
  const returnTo = searchParams.get('returnTo')

  const [step, setStep] = useState(1)
  const [tone, setTone] = useState<string[]>([])
  const [audience, setAudience] = useState<string[]>([])
  const [engagementIntensity, setEngagementIntensity] = useState<string>('')
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [bodyHtml, setBodyHtml] = useState<string | null>(null)
  const [draftGeneratedWithTone, setDraftGeneratedWithTone] = useState<string[]>([])
  const [draftGeneratedWithAudience, setDraftGeneratedWithAudience] = useState<string[]>([])
  const [autoGenAttempted, setAutoGenAttempted] = useState(false)
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<number>>(new Set())
  const [workersInitialized, setWorkersInitialized] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isPushingList, setIsPushingList] = useState(false)
  const [isPushingToAN, setIsPushingToAN] = useState(false)
  const [preparedTag, setPreparedTag] = useState<{
    tag_id: string
    tag_href: string
    tag_name: string
    contacts_tagged: number
    contacts_created: number
  } | null>(null)
  const [externalMessageId, setExternalMessageId] = useState<string | null>(null)
  const [editSetupOpen, setEditSetupOpen] = useState(false)

  // ----- Data loads -----------------------------------------------------

  const { data: draft, isLoading: draftLoading } = useQuery<DraftRow | null>({
    queryKey: ['campaign-email-wizard-draft', draftId],
    enabled: draftId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_comms_drafts')
        .select(
          'draft_id, campaign_id, subject, body, body_html, tone, audience_segment, entry_branch, email_list_id, stage_number, status',
        )
        .eq('draft_id', draftId!)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as DraftRow | null
    },
  })

  const entryBranch =
    (draft?.entry_branch as EmailEntryBranch | null) ?? entryBranchParam ?? null
  const pathway: EmailPathway = entryBranch
    ? pathwayForEmail(entryBranch)
    : urlPathway ?? 'ai'

  const { data: campaign } = useQuery({
    queryKey: ['campaign-email-wizard-campaign', campaignId],
    enabled: Number.isFinite(campaignId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('campaign_id, name, organiser_id')
        .eq('campaign_id', campaignId)
        .single()
      if (error) throw error
      return data
    },
  })

  // Campaign context (employer, agreement, organiser, worksites) for AI
  // generation + template variable resolution. Same fetches the legacy
  // EmailWizardSteps performs at step 1.
  const { data: campaignContext } = useQuery({
    queryKey: ['campaign-email-wizard-context', campaignId],
    enabled: Number.isFinite(campaignId) && !!campaign,
    queryFn: async () => {
      let agreementName = ''
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
      const worksiteNames = (wsLinks ?? [])
        .map(
          (r: Record<string, unknown>) =>
            (r.worksites as { worksite_name: string } | null)?.worksite_name,
        )
        .filter(Boolean) as string[]

      return {
        employerName,
        agreementName,
        organiserName,
        organiserPhone,
        worksiteNames,
        campaignName: campaign?.name ?? '',
      }
    },
  })

  // Email-list members (when an email_list is attached).
  const { data: listMembers = [], isLoading: listMembersLoading } = useQuery<
    RecipientRow[]
  >({
    queryKey: ['campaign-email-wizard-list-members', draft?.email_list_id],
    enabled: step === 3 && !!draft?.email_list_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_list_items')
        .select(
          'worker_id, email, sort_order, workers!inner(first_name, last_name, occupation, employers(employer_name), worksites(worksite_name))',
        )
        .eq('list_id', draft!.email_list_id!)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []).map((row: Record<string, unknown>) => {
        const w = row.workers as
          | {
              first_name: string
              last_name: string
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

  // Fallback: campaign membership recipients when no email_list is attached.
  const { data: campaignRecipients = [], isLoading: campaignRecipientsLoading } =
    useQuery<RecipientRow[]>({
      queryKey: ['campaign-email-wizard-membership-recipients', campaignId],
      enabled: step === 3 && !draft?.email_list_id,
      queryFn: async () => {
        const res = await fetchApi(`/api/campaigns/${campaignId}/list-builder?`)
        const json = await res.json()
        if (!json.success) throw new Error(json.error)
        const rows = json.data as Array<{
          worker_id: number
          first_name: string
          last_name: string
          email: string | null
          occupation: string | null
          employer_name: string | null
          worksite_name: string | null
          membership_status?: string | null
          organising_role?: string | null
        }>
        return rows.map((r) => ({
          worker_id: r.worker_id,
          first_name: r.first_name,
          last_name: r.last_name,
          email: r.email,
          occupation: r.occupation,
          employer_name: r.employer_name,
          worksite_name: r.worksite_name,
          source_label: 'Campaign membership',
        }))
      },
    })

  const recipients = draft?.email_list_id ? listMembers : campaignRecipients
  const recipientsLoading = draft?.email_list_id ? listMembersLoading : campaignRecipientsLoading

  // ----- Hydrate state from the loaded draft ---------------------------

  useEffect(() => {
    if (!draft) return
    setSubject(draft.subject || '')
    setBodyText(draft.body || '')
    setBodyHtml(draft.body_html || null)
    if (draft.tone && tone.length === 0) {
      setTone(draft.tone.split(',').map((t) => t.trim()).filter(Boolean))
    }
    if (draft.audience_segment && audience.length === 0) {
      setAudience(
        draft.audience_segment
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
      )
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.draft_id])

  // ----- Variable resolution context ----------------------------------

  const stageName = draft?.stage_number
    ? STAGE_NAMES[draft.stage_number as keyof typeof STAGE_NAMES] ||
      `Stage ${draft.stage_number}`
    : 'General'

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

  // ----- Initial recipient selection (workers with email) -------------

  useEffect(() => {
    if (step !== 3) return
    if (recipientsLoading) return
    if (workersInitialized) return
    const withEmail = recipients.filter((w) => w.email && w.email.trim() !== '')
    setSelectedWorkerIds(new Set(withEmail.map((w) => w.worker_id)))
    setWorkersInitialized(true)
  }, [step, recipients, recipientsLoading, workersInitialized])

  // ----- AI auto-fire on entering Body step ---------------------------

  const handleAIGenerate = useCallback(async () => {
    if (!campaignContext) {
      toast.error('Campaign context still loading — try again in a second.')
      return
    }
    const request: CommsDraftRequest = {
      campaign_id: campaignId,
      plan_id: 0,
      stage_number: draft?.stage_number || 1,
      stage_name: stageName,
      platform: 'email',
      campaign_context: {
        employer_name: campaignContext.employerName,
        agreement_name: campaignContext.agreementName,
        worksite_names: campaignContext.worksiteNames,
        sector: '',
        organiser_name: campaignContext.organiserName || undefined,
        organiser_phone: campaignContext.organiserPhone || undefined,
        staff_name: profile?.display_name || user?.email || undefined,
        staff_email: user?.email || undefined,
      },
      wtp_selections: {
        tone,
        audience,
        platforms: ['Email'],
        engagement_intensity: engagementIntensity || undefined,
      },
    }
    try {
      const result = await generateDraft.mutateAsync(request)
      setSubject(result.subject || '')
      setBodyText(result.body_text)
      setBodyHtml(result.body_html || null)
      setDraftGeneratedWithTone(tone)
      setDraftGeneratedWithAudience(audience)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI generation failed')
    }
  }, [
    campaignContext,
    campaignId,
    draft?.stage_number,
    stageName,
    profile,
    user,
    tone,
    audience,
    engagementIntensity,
    generateDraft,
  ])

  useEffect(() => {
    if (step !== 2) return
    if (autoGenAttempted) return
    if (pathway !== 'ai') return
    if (!campaignContext) return
    if (bodyText.trim().length > 0) return
    setAutoGenAttempted(true)
    void handleAIGenerate()
  }, [step, pathway, autoGenAttempted, campaignContext, bodyText, handleAIGenerate])

  function insertVariable(variable: string) {
    const textarea = bodyRef.current
    if (!textarea) {
      setBodyText((prev) => prev + variable)
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newValue = bodyText.substring(0, start) + variable + bodyText.substring(end)
    setBodyText(newValue)
    requestAnimationFrame(() => {
      const pos = start + variable.length
      textarea.setSelectionRange(pos, pos)
      textarea.focus()
    })
  }

  // ----- Save / push handlers ------------------------------------------

  async function handleSaveDraft() {
    if (!draftId) return
    setIsSavingDraft(true)
    try {
      const { error } = await supabase
        .from('campaign_comms_drafts')
        .update({
          subject: subject || null,
          body: bodyText,
          body_html: bodyHtml,
          tone: tone.join(', ') || null,
          audience_segment: audience.join(', ') || null,
        })
        .eq('draft_id', draftId)
      if (error) throw error
      toast.success('Draft saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save draft')
    } finally {
      setIsSavingDraft(false)
    }
  }

  async function handlePushList() {
    if (!draftId) return
    setIsPushingList(true)
    try {
      const ids = [...selectedWorkerIds]
      const res = await fetchApi(`/api/campaigns/${campaignId}/push-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft_id: draftId,
          filters: {},
          worker_ids: ids,
        }),
        timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Push failed')
      setPreparedTag({
        tag_id: data.tag_id,
        tag_href: data.tag_href,
        tag_name: data.tag_name,
        contacts_tagged: data.contacts_tagged,
        contacts_created: data.contacts_created,
      })
      toast.success(
        `${data.contacts_tagged + data.contacts_created} contacts pushed to AN`,
      )

      // Reflect the send on the email_list / items so the dashboard view
      // shows progress and reporting reflects sent counts.
      if (draft?.email_list_id) {
        const totalSent = (data.contacts_tagged ?? 0) + (data.contacts_created ?? 0)
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
    } finally {
      setIsPushingList(false)
    }
  }

  async function handlePushToAN() {
    if (!draftId) return
    if (!bodyText.trim()) {
      toast.error('Body is empty — write or generate the email first.')
      return
    }
    setIsPushingToAN(true)
    try {
      const resolvedSubject = translateToActionNetwork(
        resolveTemplateVariables(subject, varContext),
      )
      const resolvedBody = translateToActionNetwork(
        resolveTemplateVariables(bodyHtml || bodyText, varContext),
      )

      const messagePayload: Record<string, unknown> = {
        subject: resolvedSubject,
        body: resolvedBody,
        from: 'Offshore Alliance',
        reply_to: 'info@offshorealliance.org.au',
      }
      if (preparedTag?.tag_href) {
        messagePayload.targets = [{ href: preparedTag.tag_href }]
      }

      const createRes = await fetchApi('/api/action-network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_message', message: messagePayload }),
        timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
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
        .eq('draft_id', draftId)

      setExternalMessageId(messageId)
      toast.success('Email pushed to Action Network')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Push failed')
    } finally {
      setIsPushingToAN(false)
    }
  }

  // ----- Step nav ------------------------------------------------------

  const canProceed: Record<number, boolean> = {
    1: tone.length > 0 && audience.length > 0,
    2: bodyText.trim().length > 0,
    3: true,
  }

  function toneOrAudienceChangedSinceLastGen(): boolean {
    if (!bodyText.trim()) return false
    const sameTone =
      JSON.stringify([...draftGeneratedWithTone].sort()) ===
      JSON.stringify([...tone].sort())
    const sameAudience =
      JSON.stringify([...draftGeneratedWithAudience].sort()) ===
      JSON.stringify([...audience].sort())
    return !sameTone || !sameAudience
  }

  const backHref =
    returnTo && returnTo.startsWith('/')
      ? decodeURIComponent(returnTo)
      : `/campaigns/${campaignId}`

  // ----- Render --------------------------------------------------------

  if (draftId == null) {
    return (
      <div className="space-y-6 py-6">
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Missing draft context. Open the email wizard from{' '}
            <strong>Create Email</strong> on the campaign page or via Build List
            on the wall chart.
            <div className="pt-4">
              <Button variant="outline" onClick={() => router.push(`/campaigns/${campaignId}`)}>
                Back to campaign
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (draftLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">Campaign email</h1>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">
              {campaign?.name || `Campaign ${campaignId}`}
              {entryBranch ? (
                <>
                  {' · '}
                  <span className="inline-flex items-center gap-1 text-xs">
                    {pathway === 'ai' ? (
                      <Sparkles className="h-3 w-3" />
                    ) : (
                      <PenLine className="h-3 w-3" />
                    )}
                    {pathway === 'ai' ? 'AI' : 'Paste'}
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditSetupOpen(true)}
          >
            <Settings className="h-4 w-4 mr-1" />
            Edit setup
          </Button>
        </div>
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
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold',
                    done
                      ? 'bg-green-100 text-green-700'
                      : current
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-400',
                  )}
                >
                  {done ? <CheckCircle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span
                  className={cn(
                    'text-sm font-medium hidden sm:inline',
                    current
                      ? 'text-blue-600'
                      : done
                        ? 'text-green-700'
                        : 'text-slate-400',
                  )}
                >
                  {s.title}
                </span>
              </div>
            )
          })}
        </div>
        <Progress value={((step - 1) / (STEPS.length - 1)) * 100} className="h-1" />
      </div>

      {/* Step 1: Tone & Audience */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Tone & Audience</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Narrative tone (select all that apply)</Label>
              <div className="flex flex-wrap gap-2">
                {TONE_OPTIONS.map((t) => {
                  const selected = tone.includes(t.key)
                  return (
                    <Badge
                      key={t.key}
                      variant={selected ? 'default' : 'outline'}
                      className="cursor-pointer text-sm py-1 px-3"
                      onClick={() =>
                        setTone((prev) =>
                          selected ? prev.filter((x) => x !== t.key) : [...prev, t.key],
                        )
                      }
                    >
                      {t.label}
                    </Badge>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Target audience (select all that apply)</Label>
              <div className="flex flex-wrap gap-2">
                {AUDIENCE_OPTIONS.map((a) => {
                  const selected = audience.includes(a.key)
                  return (
                    <Badge
                      key={a.key}
                      variant={selected ? 'default' : 'outline'}
                      className="cursor-pointer text-sm py-1 px-3"
                      onClick={() =>
                        setAudience((prev) =>
                          selected
                            ? prev.filter((x) => x !== a.key)
                            : [...prev, a.key],
                        )
                      }
                    >
                      {a.label}
                    </Badge>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Engagement intensity</Label>
              <div className="flex flex-wrap gap-2">
                {INTENSITY_OPTIONS.map((i) => (
                  <Badge
                    key={i.key}
                    variant={engagementIntensity === i.key ? 'default' : 'outline'}
                    className="cursor-pointer text-sm py-1 px-3"
                    onClick={() => setEngagementIntensity(i.key)}
                  >
                    {i.label}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Body */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Create email body</span>
              {generateDraft.isPending && (
                <span className="text-xs font-normal text-muted-foreground inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Generating…
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleAIGenerate()}
                disabled={generateDraft.isPending}
              >
                {generateDraft.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1" />
                )}
                {bodyText.trim() ? 'Regenerate with AI' : 'Generate with AI'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSubject('')
                  setBodyText('')
                  setBodyHtml(null)
                  setDraftGeneratedWithTone([])
                  setDraftGeneratedWithAudience([])
                  setAutoGenAttempted(true)
                  setTimeout(() => bodyRef.current?.focus(), 50)
                }}
              >
                <PenLine className="h-4 w-4 mr-1" />
                Clear / paste
              </Button>
              {toneOrAudienceChangedSinceLastGen() && (
                <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
                  Tone or audience changed since last AI generation
                </Badge>
              )}
            </div>

            <div className="space-y-1">
              <Label>Subject line</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject line…"
              />
            </div>

            <div>
              <Label className="mb-1.5 block">Body</Label>
              <div className="space-y-1 mb-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Variable className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground font-medium">
                    Recipient:
                  </span>
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
                  <span className="text-[10px] text-muted-foreground font-medium ml-1">
                    Campaign:
                  </span>
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
                value={bodyText}
                onChange={(e) => {
                  setBodyText(e.target.value)
                  setBodyHtml(null)
                }}
                rows={14}
                className="font-mono text-sm"
                placeholder="Write or paste your email body here…"
              />
              <p className="text-xs text-muted-foreground text-right mt-1">
                {bodyText.trim().length} characters
              </p>
            </div>

            {bodyText.trim() && (
              <Card className="bg-muted/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground font-medium">
                    Preview (with resolved variables)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {subject && (
                    <p className="text-sm font-medium mb-2">
                      Subject: {resolveTemplateVariables(subject, varContext)}
                    </p>
                  )}
                  <div className="text-sm whitespace-pre-wrap text-muted-foreground max-h-64 overflow-auto">
                    {resolveTemplateVariables(bodyText, varContext)}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex items-center gap-2">
              <Button
                onClick={handleSaveDraft}
                disabled={isSavingDraft || !bodyText.trim()}
              >
                {isSavingDraft ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Save draft
              </Button>
              <Badge variant="outline" className="py-1.5 px-3 text-muted-foreground">
                Draft #{draftId}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: List & Send */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>List & Send</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {draft?.email_list_id ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                Recipients pulled from email_list #{draft.email_list_id}.
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                No persisted list attached — pulling all workers with email from
                campaign membership.
              </div>
            )}

            {recipientsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">
                    {selectedWorkerIds.size} of {recipients.length} selected
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => {
                      const withEmail = recipients.filter((w) => w.email)
                      setSelectedWorkerIds(new Set(withEmail.map((w) => w.worker_id)))
                    }}
                  >
                    Select all
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => setSelectedWorkerIds(new Set())}
                  >
                    Deselect all
                  </Button>
                </div>

                <div className="max-h-96 overflow-auto border rounded">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs">
                      <tr>
                        <th className="w-10 p-2"></th>
                        <th className="text-left p-2">Name</th>
                        <th className="text-left p-2">Email</th>
                        <th className="text-left p-2">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipients.map((w) => {
                        const selected = selectedWorkerIds.has(w.worker_id)
                        const hasEmail = !!w.email && w.email.trim() !== ''
                        return (
                          <tr
                            key={w.worker_id}
                            className={cn(
                              'border-t hover:bg-muted/30',
                              !hasEmail && 'opacity-50',
                            )}
                          >
                            <td className="p-2">
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={!hasEmail}
                                onChange={() => {
                                  setSelectedWorkerIds((prev) => {
                                    const n = new Set(prev)
                                    if (n.has(w.worker_id)) n.delete(w.worker_id)
                                    else if (hasEmail) n.add(w.worker_id)
                                    return n
                                  })
                                }}
                                className="h-3.5 w-3.5 accent-primary"
                              />
                            </td>
                            <td className="p-2 truncate max-w-[200px]">
                              {w.first_name} {w.last_name}
                            </td>
                            <td className="p-2 truncate max-w-[220px] text-xs text-muted-foreground">
                              {w.email ?? '—'}
                            </td>
                            <td className="p-2 truncate max-w-[200px] text-xs text-muted-foreground">
                              {w.source_label}
                            </td>
                          </tr>
                        )
                      })}
                      {recipients.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">
                            No recipients available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="flex flex-col gap-3 pt-2">
              {!preparedTag ? (
                <Button
                  onClick={handlePushList}
                  disabled={isPushingList || selectedWorkerIds.size === 0}
                >
                  {isPushingList ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Push list to Action Network ({selectedWorkerIds.size})
                </Button>
              ) : (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <p className="font-medium">
                    List pushed: {preparedTag.contacts_tagged + preparedTag.contacts_created}{' '}
                    contacts tagged as <code>{preparedTag.tag_name}</code>.
                  </p>
                </div>
              )}

              {preparedTag && !externalMessageId && (
                <Button onClick={handlePushToAN} disabled={isPushingToAN || !bodyText.trim()}>
                  {isPushingToAN ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Create message in Action Network
                </Button>
              )}

              {externalMessageId && (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <p className="font-medium">
                    Email message created in Action Network (id:{' '}
                    <code>{externalMessageId}</code>). Open Action Network to schedule and
                    send.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step nav */}
      <div className="flex justify-between pt-2">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <Button
          onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}
          disabled={step === STEPS.length || !canProceed[step]}
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      <EditEmailSetupDialog
        open={editSetupOpen}
        onOpenChange={setEditSetupOpen}
        campaignId={campaignId}
        draftId={draftId}
      />
    </div>
  )
}
