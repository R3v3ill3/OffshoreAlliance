'use client'

/**
 * Unified call-session component — Phase H.
 *
 * Extracted from the campaign call session page so both the canonical
 * campaign route and any future thin wrappers share a single implementation.
 *
 * Props mirror the URL params from
 *   /campaigns/[id]/phone/call/[listId]
 */

import { useReducer, useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallList } from '@/lib/hooks/useCallList'
import { usePhoneNext, useRecordCallAttempt } from '@/lib/hooks/useCallSession'
import { useRemoveWorkerFromCampaign } from '@/lib/hooks/useRemoveWorkerFromCampaign'
import { useCallOutcomeDefinitions } from '@/lib/hooks/useCallOutcomes'
import { useCampaignPhoneScriptContext } from '@/lib/hooks/useCampaignPhoneScriptContext'
import { mergePhoneScriptVariableContext } from '@/lib/comms/template-variables'
import { callFlowReducer, getInitialCallFlowState, canAdvanceSection, canGoBack, isCallActive } from '@/lib/phone/call-flow-state'
import { meetsCtaAmbition } from '@/lib/phone/cta-ambition-check'
import { createClient } from '@/lib/supabase/client'
import { ContactCard } from '@/components/phone/ContactCard'
import { DialOutcomeBar } from '@/components/phone/DialOutcomeBar'
import { ConversationStepper } from '@/components/phone/ConversationStepper'
import { ScriptSidePanel } from '@/components/phone/ScriptSidePanel'
import { CallbackScheduler } from '@/components/phone/CallbackScheduler'
import { WorkerEditDialog } from '@/components/phone/WorkerEditDialog'
import { InCallObjectionsPanel } from '@/components/phone/InCallObjectionsPanel'
import { InCallIssuesPanel } from '@/components/phone/InCallIssuesPanel'
import { CallActionReport } from '@/components/phone/CallActionReport'
import { CtaRatingsPanel, type CtaAmbitionWithAssessment, type CtaRatingValue } from '@/components/phone/CtaRatingsPanel'
import {
  SessionAssessmentRatingsPanel,
  serializeAssessmentRatings,
} from '@/components/phone/SessionAssessmentRatingsPanel'
import { EditCallSetupDialog } from '@/components/phone/orchestrator/EditCallSetupDialog'
import { CreateTaskListDialog } from '@/components/campaigns/task-lists/create-task-list-dialog'
import { IssueLinkDialog, type IssueLinkResult } from '@/components/share/issue-link-dialog'
import { IssuedLinkResultDialog } from '@/components/share/issued-link-result-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Phone, ArrowLeft, SkipForward, Clock, LogOut, PhoneForwarded,
  Loader2, FileText, CheckCircle, ListPlus, Building2, Map as MapIcon, Share2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  CALL_DISPOSITIONS,
  REMOVAL_CALL_DISPOSITIONS,
  SUPPORT_LEVELS,
} from '@/lib/phone/disposition-types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type {
  DialDisposition, CallDisposition, SupportLevel,
  CallScriptSection, RecordCallAttemptRequest, CallOutcomeDefinition,
  CapturedCtaRatingPayload,
} from '@/types/planner-types'
import { partitionCallOutcomeDefinitions } from '@/lib/phone/membership-outcomes'

// Suppress unused warning
void isCallActive

interface CallSessionPageProps {
  campaignId: string
  listId: string
}

export function CallSessionPage({ campaignId, listId }: CallSessionPageProps) {
  const router = useRouter()
  const callSessionSearchParams = useSearchParams()
  const actionId = useMemo(() => {
    const raw = callSessionSearchParams.get('action_id')
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }, [callSessionSearchParams])
  // Honour returnTo (set by upstream orchestrator components) so Back
  // retraces the breadcrumb instead of always dumping to /campaigns/[id]/phone.
  const dialerReturnTo = useMemo(() => {
    const raw = callSessionSearchParams.get('returnTo')
    if (!raw) return null
    try {
      return decodeURIComponent(raw)
    } catch {
      return null
    }
  }, [callSessionSearchParams])
  const dialerBackHref =
    dialerReturnTo ??
    (actionId != null
      ? `/campaigns/${campaignId}/phone/lists/${listId}?action_id=${actionId}`
      : `/campaigns/${campaignId}/phone`)
  const supabase = createClient()

  const [flowState, dispatch] = useReducer(callFlowReducer, getInitialCallFlowState())
  const [notes, setNotes] = useState('')
  const [ctaRatings, setCtaRatings] = useState<Map<number, CtaRatingValue>>(new Map())
  const [assessmentRatings, setAssessmentRatings] = useState<
    Map<number, { rating: number | null; notes: string | null }>
  >(new Map())
  const [supportLevel, setSupportLevel] = useState<SupportLevel | null>(null)
  const [showCallbackDialog, setShowCallbackDialog] = useState(false)
  const [stepNotes, setStepNotes] = useState<Record<number, string>>({})
  const [stepReached, setStepReached] = useState<Set<number>>(new Set())
  const [scriptPanelOpen, setScriptPanelOpen] = useState(false)
  const [shouldFetchNext, setShouldFetchNext] = useState(true)
  const [showWorkerEdit, setShowWorkerEdit] = useState(false)
  const [checkedOutcomes, setCheckedOutcomes] = useState<Map<number, string | null>>(new Map())
  const [sessionScriptId, setSessionScriptId] = useState<number | null>(null)
  const [sidePanelTab, setSidePanelTab] = useState<'script' | 'objections' | 'issues'>('script')
  const [showAmbitionGate, setShowAmbitionGate] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showTaskListDialog, setShowTaskListDialog] = useState(false)
  const [showEditSetup, setShowEditSetup] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareIssueResult, setShareIssueResult] = useState<IssueLinkResult | null>(null)
  const pendingSubmitArgs = useRef<Partial<RecordCallAttemptRequest> | undefined>(undefined)

  const callStartTime = useRef<Date | null>(null)
  const queryClient = useQueryClient()

  const { data: list } = useCallList(campaignId, listId)
  const { data: contact, isLoading: contactLoading, error: contactError, refetch: refetchNext } = usePhoneNext(
    campaignId, listId, shouldFetchNext
  )
  const recordAttempt = useRecordCallAttempt(campaignId)
  // Shared removal mutation — wired to the same code path as the
  // worker-detail sheet's "No longer in campaign universe" panel. The
  // hook accepts per-mutate workerId so we can target whichever contact
  // is currently active.
  const removeWorkerFromCampaign = useRemoveWorkerFromCampaign({
    campaignId,
  })

  type ListWithLinks = typeof list & {
    call_list_scripts?: Array<{
      script_id: number
      is_current: boolean
      wave_label: string | null
      linked_at: string
      call_scripts: {
        script_id: number
        title: string
        status: string
        call_objective?: string | null
        call_script_sections?: CallScriptSection[]
      } | null
    }>
    call_scripts?: {
      script_id: number
      title: string
      status: string
      call_script_sections?: CallScriptSection[]
    } | null
  }
  const listWithLinks = list as ListWithLinks | undefined

  const linkedScripts = useMemo(() => {
    const links = listWithLinks?.call_list_scripts ?? []
    return [...links]
      .filter((l) => l.call_scripts)
      .sort((a, b) => {
        if (a.is_current !== b.is_current) return a.is_current ? -1 : 1
        return (b.linked_at || '').localeCompare(a.linked_at || '')
      })
  }, [listWithLinks])

  useEffect(() => {
    if (sessionScriptId != null) return
    const defaultScriptId =
      linkedScripts.find((l) => l.is_current)?.script_id ??
      listWithLinks?.script_id ??
      linkedScripts[0]?.script_id ??
      null
    if (defaultScriptId != null) setSessionScriptId(defaultScriptId)
  }, [linkedScripts, listWithLinks?.script_id, sessionScriptId])

  const activeScript = useMemo(() => {
    if (!sessionScriptId) {
      return listWithLinks?.call_scripts ?? null
    }
    const linked = linkedScripts.find((l) => l.script_id === sessionScriptId)?.call_scripts
    if (linked) return linked
    return listWithLinks?.call_scripts ?? null
  }, [sessionScriptId, linkedScripts, listWithLinks])

  const outcomeScriptId = sessionScriptId ?? list?.script_id ?? null
  const { data: outcomeDefinitions = [] } = useCallOutcomeDefinitions(outcomeScriptId)

  const { data: ctaAmbitions = [] } = useQuery<CtaAmbitionWithAssessment[]>({
    queryKey: ['call-script-cta-ambitions', outcomeScriptId],
    queryFn: async () => {
      if (!outcomeScriptId) return []
      const { data, error } = await supabase
        .from('call_script_cta_ambitions')
        .select(
          `id, outcome_definition_id, activity_id, cta_label,
           target_response, target_min_rating, target_binary, target_support_level,
           min_call_threshold_pct, notes,
           activity:campaign_activities(activity_id, title, is_binary, rating_labels)`
        )
        .eq('script_id', outcomeScriptId)
      if (error) throw error
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
        const a = (row.activity ?? null) as
          | { activity_id: number; title: string; is_binary: boolean; rating_labels: Record<string, string> | null }
          | { activity_id: number; title: string; is_binary: boolean; rating_labels: Record<string, string> | null }[]
          | null
        const activity = Array.isArray(a) ? (a[0] ?? null) : a
        return { ...(row as object), activity } as CtaAmbitionWithAssessment
      })
    },
    enabled: !!outcomeScriptId,
  })

  const numericCampaignId = Number.parseInt(campaignId, 10)
  const { data: campaignScriptCtx } = useCampaignPhoneScriptContext(
    Number.isFinite(numericCampaignId) && numericCampaignId > 0 ? numericCampaignId : null
  )

  // H2: Fetch campaign name + section plan name for header context
  const { data: campaignContext } = useQuery({
    queryKey: ['campaign-header-context', numericCampaignId],
    queryFn: async () => {
      const { data } = await supabase
        .from('campaigns')
        .select('campaign_id, name')
        .eq('campaign_id', numericCampaignId)
        .single()
      return data
    },
    enabled: Number.isFinite(numericCampaignId) && numericCampaignId > 0,
  })

  // H2: Section plan name — derive via call_lists.section_plan_id
  const listSectionPlanId = (list as Record<string, unknown> | undefined)?.section_plan_id as number | null | undefined
  const { data: sectionPlanContext } = useQuery({
    queryKey: ['section-plan-name', listSectionPlanId],
    queryFn: async () => {
      const { data } = await supabase
        .from('section_plans')
        .select('section_plan_id, name')
        .eq('section_plan_id', listSectionPlanId!)
        .single()
      return data
    },
    enabled: !!listSectionPlanId,
  })

  const { membershipHeroOutcomes, otherOutcomes, showingRecruitPrompt } = useMemo(
    () =>
      partitionCallOutcomeDefinitions(outcomeDefinitions, {
        unionMembershipTypeName: contact?.worker?.union_membership_type_name,
      }),
    [outcomeDefinitions, contact?.worker?.union_membership_type_name]
  )

  function renderOutcomeRow(od: CallOutcomeDefinition) {
    const checked = checkedOutcomes.has(od.outcome_id)
    const responseType = od.response_type || 'checkbox'
    return (
      <div key={od.outcome_id} className="space-y-1">
        <label className="flex items-center gap-2 py-0.5 cursor-pointer text-xs">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => setCheckedOutcomes((prev) => {
              const n = new Map(prev)
              if (n.has(od.outcome_id)) n.delete(od.outcome_id)
              else n.set(od.outcome_id, null)
              return n
            })}
          />
          <span className={od.is_positive ? 'text-green-700' : ''}>{od.name}</span>
          {od.is_positive && <span className="text-[9px] text-green-500 font-medium">+</span>}
          {responseType !== 'checkbox' && (
            <span className="text-[9px] text-muted-foreground">({responseType})</span>
          )}
        </label>
        {checked && responseType === 'text' && (
          <input
            type="text"
            value={checkedOutcomes.get(od.outcome_id) || ''}
            onChange={(e) => setCheckedOutcomes((prev) => new Map(prev).set(od.outcome_id, e.target.value))}
            placeholder={od.description || 'Enter details…'}
            className="ml-6 h-6 text-xs border rounded px-2 w-full max-w-xs"
          />
        )}
        {checked && responseType === 'number' && (
          <input
            type="number"
            value={checkedOutcomes.get(od.outcome_id) || ''}
            onChange={(e) => setCheckedOutcomes((prev) => new Map(prev).set(od.outcome_id, e.target.value))}
            placeholder="0"
            className="ml-6 h-6 text-xs border rounded px-2 w-20"
          />
        )}
        {checked && responseType === 'select' && od.response_options && (
          <select
            value={checkedOutcomes.get(od.outcome_id) || ''}
            onChange={(e) => setCheckedOutcomes((prev) => new Map(prev).set(od.outcome_id, e.target.value))}
            className="ml-6 h-6 text-xs border rounded px-1"
          >
            <option value="">Select…</option>
            {od.response_options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
      </div>
    )
  }

  const sections: CallScriptSection[] = useMemo(() => {
    return (activeScript?.call_script_sections as CallScriptSection[] | undefined) ?? []
  }, [activeScript])

  const sortedSections = [...sections].sort((a, b) => a.sort_order - b.sort_order)
  const currentSection = sortedSections[flowState.currentSectionIndex] || null
  void currentSection

  // The side panel hides the Script tab when no script is attached so
  // assessment-only sessions (and legacy build-list fires with no script)
  // don't see an empty "No structured script attached" placeholder. The
  // gate is intentionally broad — show the tab whenever there's any
  // signal of a script (sections OR a sessionScriptId OR a linked
  // record), so race-conditions during initial load don't flicker the
  // tab away.
  const hasScript =
    sortedSections.length > 0 ||
    sessionScriptId != null ||
    linkedScripts.length > 0 ||
    !!listWithLinks?.script_id

  // Derive the effective side-panel tab: when no script is attached and
  // the underlying state is the default 'script', display 'objections'
  // instead. We keep the underlying state untouched so that hasScript
  // flipping back (e.g. user attaches a script mid-session) restores the
  // Script tab automatically. Done as a derived value rather than a
  // setState-in-effect to avoid cascading renders.
  const effectiveSidePanelTab: 'script' | 'objections' | 'issues' =
    !hasScript && sidePanelTab === 'script' ? 'objections' : sidePanelTab

  const scriptContext = useMemo(() => {
    const w = contact?.worker
    const workerFields = {
      first_name: w?.first_name || undefined,
      last_name: w?.last_name || undefined,
      occupation: w?.occupation || undefined,
      employer_name: w?.employer_name || undefined,
      worksite_name: w?.worksite_name || undefined,
      phone: w?.phone || undefined,
      email: w?.email || undefined,
    } as Record<string, string | undefined>
    return mergePhoneScriptVariableContext(campaignScriptCtx ?? {}, workerFields)
  }, [contact?.worker, campaignScriptCtx])

  useEffect(() => {
    if (contact && flowState.phase === 'idle') {
      dispatch({ type: 'CONTACT_LOADED' })
    }
  }, [contact, flowState.phase])

  const handleDialOutcome = useCallback((disposition: DialDisposition) => {
    dispatch({ type: 'DIAL_OUTCOME', disposition })
    callStartTime.current = new Date()

    if (disposition !== 'connected') {
      if (disposition === 'callback_requested') {
        setShowCallbackDialog(true)
      }
    } else {
      if (sortedSections.length > 0) {
        setStepReached(new Set([0]))
      }
    }
  }, [sortedSections.length])

  const handleCallComplete = useCallback((disposition: CallDisposition) => {
    dispatch({ type: 'COMPLETE_CALL', disposition })
  }, [])

  const handleAdvanceSection = useCallback(() => {
    if (canAdvanceSection(flowState, sortedSections.length)) {
      const nextIdx = flowState.currentSectionIndex + 1
      dispatch({ type: 'ADVANCE_SECTION' })
      setStepReached((prev) => new Set([...prev, nextIdx]))
    }
  }, [flowState, sortedSections.length])

  const handleGoToSection = useCallback((index: number) => {
    dispatch({ type: 'GO_TO_SECTION', sectionIndex: index })
    setStepReached((prev) => new Set([...prev, index]))
  }, [])

  const doSubmit = useCallback(async (overrides?: Partial<RecordCallAttemptRequest>) => {
    if (!contact) return

    const duration = callStartTime.current
      ? Math.round((Date.now() - callStartTime.current.getTime()) / 1000)
      : null

    const stepOutcomes = sortedSections.map((s, i) => ({
      section_id: s.section_id,
      reached: stepReached.has(i),
      outcome_value: null,
      notes: stepNotes[i] || null,
      sort_order: i,
    }))

    const ctaRatingsPayload: CapturedCtaRatingPayload[] = flowState.dialDisposition === 'connected'
      ? Array.from(ctaRatings.entries())
          .filter(([, v]) => v.rating != null || v.binary_value != null)
          .map(([id, v]) => ({
            cta_ambition_id: id,
            rating: v.rating,
            binary_value: v.binary_value,
            notes: v.notes,
          }))
      : []

    const assessmentRatingsPayload =
      flowState.dialDisposition === 'connected'
        ? serializeAssessmentRatings(assessmentRatings)
        : []

    const attempt: RecordCallAttemptRequest = {
      list_item_id: contact.item_id,
      script_id: sessionScriptId ?? list?.script_id ?? null,
      dial_disposition: flowState.dialDisposition || 'no_answer',
      call_disposition: flowState.callDisposition || null,
      overall_notes: notes || null,
      support_level_assessed: supportLevel,
      cta_response: null,
      duration_seconds: duration,
      step_outcomes: flowState.dialDisposition === 'connected' ? stepOutcomes : [],
      objections: flowState.capturedObjections,
      issues: flowState.capturedIssues,
      cta_ratings: ctaRatingsPayload,
      assessment_ratings: assessmentRatingsPayload,
      action_id: actionId,
      ...overrides,
    }

    try {
      await recordAttempt.mutateAsync(attempt)

      // If the driver picked one of the removal call_dispositions, run the
      // shared "no longer in campaign universe" mutation so the worker is
      // unlinked + audited identically to the worker-detail panel.
      const finalCallDisposition = attempt.call_disposition
      if (
        finalCallDisposition &&
        (REMOVAL_CALL_DISPOSITIONS as readonly string[]).includes(finalCallDisposition) &&
        contact.worker
      ) {
        const workerName =
          `${contact.worker.first_name ?? ''} ${contact.worker.last_name ?? ''}`.trim() ||
          `Worker #${contact.worker.worker_id}`
        await removeWorkerFromCampaign.mutateAsync({
          reasonCode: finalCallDisposition as 'removed_from_campaign' | 'no_longer_in_universe',
          workerId: contact.worker.worker_id,
          workerName,
          actionId: actionId,
          note: notes || null,
        })
      }

      setNotes('')
      setCtaRatings(new Map())
      setAssessmentRatings(new Map())
      setSupportLevel(null)
      setStepNotes({})
      setStepReached(new Set())
      setCheckedOutcomes(new Map())
      callStartTime.current = null
      dispatch({ type: 'RESET' })
      dispatch({ type: 'LOAD_CONTACT' })
      await refetchNext()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record attempt')
    }
  }, [contact, list, sessionScriptId, flowState, notes, supportLevel, ctaRatings, assessmentRatings, sortedSections, stepReached, stepNotes, checkedOutcomes, recordAttempt, refetchNext, actionId, removeWorkerFromCampaign])

  const submitAndLoadNext = useCallback(async (overrides?: Partial<RecordCallAttemptRequest>) => {
    if (!contact) return

    const isConnectedCall = flowState.dialDisposition === 'connected' && (flowState.callDisposition || overrides?.call_disposition)
    if (isConnectedCall && ctaAmbitions.length > 0) {
      const allMet = meetsCtaAmbition(ctaAmbitions, { ctaRatings, supportLevel })
      if (!allMet && flowState.capturedObjections.length === 0) {
        pendingSubmitArgs.current = overrides
        setShowAmbitionGate(true)
        return
      }
    }

    await doSubmit(overrides)
  }, [contact, flowState, ctaRatings, supportLevel, ctaAmbitions, doSubmit])

  const handleSkip = useCallback(async () => {
    if (!contact) return
    await submitAndLoadNext({
      dial_disposition: 'no_answer',
      call_disposition: null,
      overall_notes: 'Skipped',
    })
  }, [contact, submitAndLoadNext])

  const handleCallbackScheduled = useCallback(async (datetime: string) => {
    setShowCallbackDialog(false)
    await submitAndLoadNext({
      dial_disposition: flowState.dialDisposition || 'callback_requested',
      callback_datetime: datetime,
    })
  }, [flowState.dialDisposition, submitAndLoadNext])

  const isConnected = flowState.phase === 'connected' || flowState.phase === 'in_script'
  const showDispositionForm = flowState.phase === 'not_reached' || flowState.phase === 'call_complete' || flowState.phase === 'early_exit'

  void setShouldFetchNext

  if (!list) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b mb-4 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={() => router.push(dialerBackHref)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Phone className="h-4 w-4" />
            <span className="truncate">{list.name}</span>
          </h2>
          {/* H2: Campaign + section plan context */}
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
            <p className="text-xs text-muted-foreground">
              {list.completed_items}/{list.total_items} completed
            </p>
            {campaignContext?.name && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                <span className="truncate max-w-[200px]">{campaignContext.name}</span>
              </span>
            )}
            {sectionPlanContext?.name && (
              <span className="flex items-center gap-1">
                <MapIcon className="h-3 w-3" />
                <span className="truncate max-w-[180px]">{sectionPlanContext.name}</span>
              </span>
            )}
          </div>
        </div>

        {linkedScripts.length > 1 && (
          <div className="flex items-center gap-1.5 mr-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <Select
              value={sessionScriptId ? String(sessionScriptId) : ''}
              onValueChange={(v) => setSessionScriptId(Number(v))}
            >
              <SelectTrigger className="h-8 text-xs min-w-[180px]">
                <SelectValue placeholder="Select script…" />
              </SelectTrigger>
              <SelectContent>
                {linkedScripts.map((l) => (
                  <SelectItem key={l.script_id} value={String(l.script_id)}>
                    <span className="flex items-center gap-2">
                      <span className="truncate max-w-[220px]">{l.call_scripts?.title}</span>
                      {l.is_current && (
                        <span className="text-[9px] text-primary font-medium">CURRENT</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {actionId != null && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setShowEditSetup(true)}
            title="Edit session assessments and variation settings"
          >
            Edit setup
          </Button>
        )}

        {/* Late-script attach affordance. Sends the user to the list
            management page where CallListLinkedScripts exposes "Link
            another script". Per-call assessment ratings already recorded
            on this session remain untouched — script attachment writes to
            call_attempt_cta_ratings (separate table) and only starts on
            attempts that record after the link. */}
        {!hasScript && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            title="Attach a script to this call list"
            onClick={() => {
              const here = encodeURIComponent(
                window.location.pathname + window.location.search,
              )
              const target = actionId != null
                ? `/campaigns/${campaignId}/phone/lists/${listId}?action_id=${actionId}&returnTo=${here}`
                : `/campaigns/${campaignId}/phone/lists/${listId}?returnTo=${here}`
              router.push(target)
            }}
          >
            <FileText className="h-3.5 w-3.5 mr-1" />
            Attach script
          </Button>
        )}

        {list && (list.total_items ?? 0) - (list.completed_items ?? 0) > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            title="Create a shareable mobile-calling link for this list"
            onClick={() => setShareOpen(true)}
          >
            <Share2 className="h-3.5 w-3.5 mr-1" />
            Share for mobile
          </Button>
        )}

        <Badge variant="secondary">{flowState.phase.replace(/_/g, ' ')}</Badge>

        {/* Mobile script panel toggle */}
        <div className="lg:hidden">
          <Sheet open={scriptPanelOpen} onOpenChange={setScriptPanelOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:w-[400px] p-0">
              <div className="p-4 h-full overflow-y-auto">
                <ScriptSidePanel
                  sections={sortedSections}
                  currentIndex={flowState.currentSectionIndex}
                  onGoToSection={(i) => { handleGoToSection(i); setScriptPanelOpen(false) }}
                  reachedSections={stepReached}
                  workerContext={scriptContext}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Main split layout */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Left: Call Control Panel */}
        <div className="flex-1 lg:flex-[3] overflow-y-auto space-y-4 pr-1">
          {contactLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading next contact...</span>
            </div>
          ) : contactError ? (
            <div className="text-center py-20">
              <p className="text-lg font-semibold text-destructive">Failed to load contact</p>
              <p className="text-sm text-muted-foreground mt-1">
                There was a problem fetching the next contact. Please try again.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => refetchNext()}>
                Retry
              </Button>
            </div>
          ) : !contact ? (
            <div className="text-center py-20">
              <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
              {list.completed_items > 0 && list.completed_items >= list.total_items ? (
                <>
                  <p className="text-lg font-semibold">List Complete!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    All {list.total_items} contacts on this list have been reached.
                  </p>
                  <div className="flex items-center justify-center gap-3 mt-4">
                    <Button onClick={() => setShowReportModal(true)}>
                      View Call Report
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push(`/campaigns/${campaignId}/phone`)}
                    >
                      Back to Phone Operations
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold">All done!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    No more contacts to call on this list.
                  </p>
                  <Button
                    variant="outline" className="mt-4"
                    onClick={() => router.push(`/campaigns/${campaignId}/phone`)}
                  >
                    Back to Phone Operations
                  </Button>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Contact Card */}
              <ContactCard contact={contact} onEdit={() => setShowWorkerEdit(true)} />

              {/* Pre-call: Dial outcome buttons */}
              {flowState.phase === 'pre_call' && (
                <DialOutcomeBar onSelect={handleDialOutcome} />
              )}

              {/* Connected: Conversation stepper */}
              {isConnected && sortedSections.length > 0 && (
                <ConversationStepper
                  sections={sortedSections}
                  currentIndex={flowState.currentSectionIndex}
                  reachedSections={stepReached}
                  stepNotes={stepNotes}
                  onStepNotesChange={(idx, text) => setStepNotes((prev) => ({ ...prev, [idx]: text }))}
                  onAdvance={handleAdvanceSection}
                  onGoBack={() => canGoBack(flowState) && dispatch({ type: 'GO_TO_SECTION', sectionIndex: flowState.currentSectionIndex - 1 })}
                  canAdvance={canAdvanceSection(flowState, sortedSections.length)}
                  canGoBack={canGoBack(flowState)}
                  workerContext={scriptContext}
                />
              )}

              {/* Connected: Complete call form */}
              {isConnected && (
                <div className="space-y-3 p-4 rounded-lg border bg-muted/20">
                  <p className="text-sm font-medium">Complete Call</p>

                  {membershipHeroOutcomes.length > 0 && (
                    <div className="space-y-1.5 p-3 rounded border border-blue-200 bg-blue-50/40 dark:bg-blue-950/20">
                      <label className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                        {showingRecruitPrompt ? 'Membership / recruitment' : 'Membership result'}
                      </label>
                      <p className="text-[10px] text-muted-foreground">
                        {showingRecruitPrompt
                          ? 'This worker already has member-like status. Record whether they will ask others to join. (No automatic membership status change.)'
                          : 'When recorded, a positive answer sets this worker to member pending (campaign lists only) and may count toward linked ambitions. Financial members are excluded from the join prompt.'}
                      </p>
                      <div className="space-y-1.5">
                        {membershipHeroOutcomes.map((od) => renderOutcomeRow(od))}
                      </div>
                    </div>
                  )}

                  {otherOutcomes.length > 0 && (
                    <div className="space-y-1.5 p-3 rounded border bg-background">
                      <label className="text-xs font-medium">Other call outcomes</label>
                      <div className="space-y-1.5">
                        {otherOutcomes.map((od) => renderOutcomeRow(od))}
                      </div>
                    </div>
                  )}

                  <CtaRatingsPanel
                    ambitions={ctaAmbitions}
                    values={ctaRatings}
                    onChange={(id, next) => {
                      setCtaRatings((prev) => {
                        const m = new Map(prev)
                        if (next == null) m.delete(id)
                        else m.set(id, next)
                        return m
                      })
                    }}
                  />

                  <SessionAssessmentRatingsPanel
                    actionId={actionId}
                    values={assessmentRatings}
                    onChange={(activityId, next) => {
                      setAssessmentRatings((prev) => {
                        const m = new Map(prev)
                        if (next == null) m.delete(activityId)
                        else m.set(activityId, next)
                        return m
                      })
                    }}
                  />

                  <div className="space-y-1 max-w-xs">
                    <label className="text-xs font-medium">Overall Support Level</label>
                    <Select value={supportLevel || ''} onValueChange={(v) => setSupportLevel(v as SupportLevel)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Assess..." />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORT_LEVELS.map((l) => (
                          <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {CALL_DISPOSITIONS.map((d) => (
                      <Button
                        key={d.value}
                        variant="outline" size="sm"
                        className={`text-xs ${d.color}`}
                        onClick={() => handleCallComplete(d.value)}
                      >
                        {d.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Post-disposition: submit and move on */}
              {showDispositionForm && (
                <div className="space-y-3 p-4 rounded-lg border border-green-200 bg-green-50">
                  <p className="text-sm font-medium text-green-800">
                    Disposition: {flowState.dialDisposition}
                    {flowState.callDisposition && ` / ${flowState.callDisposition}`}
                  </p>
                  <Button
                    onClick={() => submitAndLoadNext()}
                    disabled={recordAttempt.isPending}
                    className="w-full"
                  >
                    {recordAttempt.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <PhoneForwarded className="h-4 w-4 mr-1" />
                    )}
                    Save & Phone Next
                  </Button>
                </div>
              )}

              {/* Notes - always visible */}
              <div className="space-y-1">
                <label className="text-xs font-medium">Call Notes</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes from this call..."
                  rows={3}
                  className="text-sm"
                />
              </div>

              {/* Action bar */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={handleSkip}>
                  <SkipForward className="h-4 w-4 mr-1" />
                  Skip
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowCallbackDialog(true)}>
                  <Clock className="h-4 w-4 mr-1" />
                  Defer
                </Button>
                {contact?.worker && (
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setShowTaskListDialog(true)}
                    title="Create a task list with this worker as the leader"
                  >
                    <ListPlus className="h-4 w-4 mr-1" />
                    New task list
                  </Button>
                )}
                <div className="flex-1" />
                <Button
                  variant="ghost" size="sm"
                  onClick={() => router.push(`/campaigns/${campaignId}/phone`)}
                >
                  <LogOut className="h-4 w-4 mr-1" />
                  End Session
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Right: Tabbed side panel (desktop only) */}
        <div className="hidden lg:flex flex-[2] border-l pl-4 min-h-0 flex-col">
          <Tabs
            value={effectiveSidePanelTab}
            onValueChange={(v) => setSidePanelTab(v as typeof sidePanelTab)}
            className="flex flex-col h-full"
          >
            <TabsList
              className={`grid w-full shrink-0 mb-3 ${
                hasScript ? 'grid-cols-3' : 'grid-cols-2'
              }`}
            >
              {hasScript && (
                <TabsTrigger value="script" className="text-xs">Script</TabsTrigger>
              )}
              <TabsTrigger value="objections" className="text-xs">
                Objections
                {flowState.capturedObjections.length > 0 && (
                  <span className="ml-1 text-[9px] bg-amber-100 text-amber-700 rounded-full px-1.5">
                    {flowState.capturedObjections.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="issues" className="text-xs">
                Issues
                {flowState.capturedIssues.length > 0 && (
                  <span className="ml-1 text-[9px] bg-orange-100 text-orange-700 rounded-full px-1.5">
                    {flowState.capturedIssues.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="script" className="flex-1 overflow-y-auto mt-0">
              {sortedSections.length > 0 ? (
                <ScriptSidePanel
                  sections={sortedSections}
                  currentIndex={flowState.currentSectionIndex}
                  onGoToSection={handleGoToSection}
                  reachedSections={stepReached}
                  workerContext={scriptContext}
                />
              ) : (
                <div className="text-center py-12">
                  <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No structured script attached to this list</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="objections" className="flex-1 overflow-y-auto mt-0">
              <InCallObjectionsPanel
                campaignId={numericCampaignId}
                captured={flowState.capturedObjections}
                onAdd={(obj) => dispatch({ type: 'ADD_OBJECTION', objection: obj })}
                onUpdate={(i, obj) => dispatch({ type: 'UPDATE_OBJECTION', index: i, objection: obj })}
                onRemove={(i) => dispatch({ type: 'REMOVE_OBJECTION', index: i })}
              />
            </TabsContent>

            <TabsContent value="issues" className="flex-1 overflow-y-auto mt-0">
              <InCallIssuesPanel
                campaignId={numericCampaignId}
                expectedIssues={null}
                captured={flowState.capturedIssues}
                onAdd={(issue) => dispatch({ type: 'ADD_ISSUE', issue })}
                onUpdate={(i, issue) => dispatch({ type: 'UPDATE_ISSUE', index: i, issue })}
                onRemove={(i) => dispatch({ type: 'REMOVE_ISSUE', index: i })}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Pre-finalise ambition gate dialog */}
      <AlertDialog open={showAmbitionGate} onOpenChange={setShowAmbitionGate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Did you encounter objections?</AlertDialogTitle>
            <AlertDialogDescription>
              This call&apos;s outcome is below the ambition target for this script. Capturing
              objections now will improve campaign learning and help the team prepare better
              responses. Would you like to add objections before finalising?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowAmbitionGate(false)
                setSidePanelTab('objections')
              }}
            >
              Add objections
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setShowAmbitionGate(false)
                await doSubmit(pendingSubmitArgs.current)
                pendingSubmitArgs.current = undefined
              }}
            >
              Finalise anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CallbackScheduler
        open={showCallbackDialog}
        onClose={() => setShowCallbackDialog(false)}
        onSchedule={handleCallbackScheduled}
      />

      {contact?.worker && (
        <CreateTaskListDialog
          campaignId={campaignId}
          open={showTaskListDialog}
          onOpenChange={setShowTaskListDialog}
          leaderWorkerLock={{
            workerId: contact.worker.worker_id,
            workerName:
              `${contact.worker.first_name ?? ''} ${contact.worker.last_name ?? ''}`.trim() ||
              `Worker #${contact.worker.worker_id}`,
          }}
        />
      )}

      {/* End-of-list call report modal */}
      <Dialog open={showReportModal} onOpenChange={setShowReportModal}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Call Report — {list.name}</DialogTitle>
          </DialogHeader>
          <CallActionReport
            campaignId={numericCampaignId}
            defaultListId={list.list_id}
            actionId={actionId}
          />
        </DialogContent>
      </Dialog>

      {contact?.worker && (
        <WorkerEditDialog
          open={showWorkerEdit}
          onClose={() => setShowWorkerEdit(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['phone-next', campaignId, listId] })
          }}
          onRemovedFromCampaign={() => {
            setShowWorkerEdit(false)
            dispatch({ type: 'RESET' })
            dispatch({ type: 'LOAD_CONTACT' })
            refetchNext()
          }}
          workerId={contact.worker.worker_id}
          campaignId={campaignId}
          initialData={{
            first_name: contact.worker.first_name || '',
            last_name: contact.worker.last_name || '',
            phone: contact.worker.phone,
            email: contact.worker.email,
            occupation: contact.worker.occupation,
            address: contact.worker.address,
            suburb: contact.worker.suburb,
            state: contact.worker.state,
            postcode: contact.worker.postcode,
            employer_id: contact.worker.employer_id,
            worksite_id: contact.worker.worksite_id,
            employer_name: contact.worker.employer_name,
            worksite_name: contact.worker.worksite_name,
          }}
          connectionId={contact.connection?.connection_id ?? null}
          connectionNotes={contact.connection?.notes ?? null}
          actionId={actionId}
        />
      )}

      {actionId != null && (
        <EditCallSetupDialog
          open={showEditSetup}
          onOpenChange={setShowEditSetup}
          campaignId={campaignId}
          actionId={actionId}
        />
      )}

      <IssueLinkDialog
        title="Share for mobile calling"
        target={
          shareOpen && list
            ? {
                title: list.name,
                contextLabel: 'For call list',
                endpoint: `/api/campaigns/${campaignId}/call-lists/${listId}/share-token`,
              }
            : null
        }
        workerSearchEndpoint={`/api/campaigns/${campaignId}/workers`}
        passwordHelp="You can share this one link with multiple callers — each person picks their name on sign-in and the system stops anyone from calling the same contact twice."
        onClose={() => setShareOpen(false)}
        onIssued={(result) => {
          setShareOpen(false)
          setShareIssueResult(result)
        }}
      />

      <IssuedLinkResultDialog
        title="Mobile-call link ready"
        result={shareIssueResult}
        onClose={() => setShareIssueResult(null)}
      />
    </div>
  )
}
