'use client'

import { useReducer, useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { callFlowReducer, getInitialCallFlowState, canAdvanceSection, canGoBack, isCallActive } from '@/lib/phone/call-flow-state'
import { useCallOutcomeDefinitions } from '@/lib/hooks/useCallOutcomes'
import { useCampaignPhoneScriptContext } from '@/lib/hooks/useCampaignPhoneScriptContext'
import { mergePhoneScriptVariableContext } from '@/lib/comms/template-variables'
import { fetchApi } from '@/lib/api/fetch-api'
import { ContactCard } from '@/components/phone/ContactCard'
import { DialOutcomeBar } from '@/components/phone/DialOutcomeBar'
import { ConversationStepper } from '@/components/phone/ConversationStepper'
import { ScriptSidePanel } from '@/components/phone/ScriptSidePanel'
import { CallbackScheduler } from '@/components/phone/CallbackScheduler'
import { WorkerEditDialog } from '@/components/phone/WorkerEditDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import {
  Phone, ArrowLeft, SkipForward, Clock, LogOut,
  PhoneForwarded, Loader2, FileText, CheckCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { DIAL_DISPOSITIONS, CALL_DISPOSITIONS, CTA_RESPONSES, SUPPORT_LEVELS } from '@/lib/phone/disposition-types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type {
  DialDisposition, CallDisposition, CtaResponse, SupportLevel,
  CallScriptSection, RecordCallAttemptRequest, CallListWithStats,
  CallListItemWithWorker, CallOutcomeDefinition,
} from '@/types/planner-types'
import { partitionCallOutcomeDefinitions } from '@/lib/phone/membership-outcomes'

// Hooks that hit the standalone /api/phone-wizard/* routes

function useWizardCallList(listId: string) {
  return useQuery({
    queryKey: ['phone-wizard-call-list', listId],
    queryFn: async () => {
      const res = await fetchApi(`/api/phone-wizard/call-lists/${listId}`)
      if (!res.ok) throw new Error('Failed to fetch call list')
      return res.json() as Promise<CallListWithStats>
    },
    enabled: !!listId,
  })
}

function useWizardPhoneNext(listId: string, enabled = true) {
  return useQuery({
    queryKey: ['phone-wizard-next', listId],
    queryFn: async () => {
      const res = await fetchApi(`/api/phone-wizard/call-lists/${listId}/next`)
      if (!res.ok) throw new Error('Failed to get next contact')
      const data = await res.json()
      if (data.done) return null
      return data as CallListItemWithWorker
    },
    enabled: !!listId && enabled,
    refetchOnWindowFocus: false,
    staleTime: 0,
  })
}

function useWizardRecordAttempt(listId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (attempt: RecordCallAttemptRequest) => {
      const res = await fetchApi('/api/phone-wizard/call-attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attempt),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(err.error || 'Failed to record attempt')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone-wizard-next', listId] })
      queryClient.invalidateQueries({ queryKey: ['phone-wizard-call-list', listId] })
    },
  })
}

export default function PhoneWizardCallPage() {
  const params = useParams()
  const router = useRouter()
  const listId = params.listId as string

  const [flowState, dispatch] = useReducer(callFlowReducer, getInitialCallFlowState())
  const [notes, setNotes] = useState('')
  const [ctaResponse, setCtaResponse] = useState<CtaResponse | null>(null)
  const [supportLevel, setSupportLevel] = useState<SupportLevel | null>(null)
  const [showCallbackDialog, setShowCallbackDialog] = useState(false)
  const [stepNotes, setStepNotes] = useState<Record<number, string>>({})
  const [stepReached, setStepReached] = useState<Set<number>>(new Set())
  const [scriptPanelOpen, setScriptPanelOpen] = useState(false)
  const [shouldFetchNext, setShouldFetchNext] = useState(true)
  const [showWorkerEdit, setShowWorkerEdit] = useState(false)
  const [checkedOutcomes, setCheckedOutcomes] = useState<Map<number, string | null>>(new Map())

  const callStartTime = useRef<Date | null>(null)
  const queryClient = useQueryClient()

  const { data: list } = useWizardCallList(listId)
  const { data: contact, isLoading: contactLoading, refetch: refetchNext } = useWizardPhoneNext(listId, shouldFetchNext)
  const recordAttempt = useWizardRecordAttempt(listId)

  const { data: outcomeDefinitions = [] } = useCallOutcomeDefinitions(list?.script_id ?? null)

  const scriptCampaignIdForContext = useMemo(() => {
    if (!list) return null
    if (list.campaign_id != null && list.campaign_id > 0) return list.campaign_id
    const raw = list as unknown as Record<string, unknown>
    const cs = raw.call_scripts as { campaign_id?: number | null } | null | undefined
    const cid = cs?.campaign_id
    return cid != null && cid > 0 ? cid : null
  }, [list])

  const { data: campaignScriptCtx } = useCampaignPhoneScriptContext(scriptCampaignIdForContext)

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

  const sections: CallScriptSection[] = (() => {
    if (!list) return []
    const raw = list as unknown as Record<string, unknown>
    const scriptObj = raw.call_scripts as Record<string, unknown> | null | undefined
    return (scriptObj?.call_script_sections as CallScriptSection[] | undefined) ?? []
  })()

  const sortedSections = [...sections].sort((a, b) => a.sort_order - b.sort_order)
  const currentSection = sortedSections[flowState.currentSectionIndex] || null

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

  const submitAndLoadNext = useCallback(async (overrides?: Partial<RecordCallAttemptRequest>) => {
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

    const attempt: RecordCallAttemptRequest = {
      list_item_id: contact.item_id,
      script_id: list?.script_id || null,
      dial_disposition: flowState.dialDisposition || 'no_answer',
      call_disposition: flowState.callDisposition || null,
      overall_notes: notes || null,
      support_level_assessed: supportLevel,
      cta_response: ctaResponse,
      duration_seconds: duration,
      step_outcomes: flowState.dialDisposition === 'connected' ? stepOutcomes : [],
      outcome_entries: flowState.dialDisposition === 'connected'
        ? [...checkedOutcomes.entries()].map(([id, val]) => ({ outcome_id: id, response_value: val }))
        : [],
      ...overrides,
    }

    try {
      await recordAttempt.mutateAsync(attempt)
      setNotes('')
      setCtaResponse(null)
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
  }, [contact, list, flowState, notes, supportLevel, ctaResponse, sortedSections, stepReached, stepNotes, checkedOutcomes, recordAttempt, refetchNext])

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

  // Suppress unused variable warning — isCallActive kept for potential future use
  void isCallActive
  void currentSection
  void DIAL_DISPOSITIONS

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
        <Button variant="ghost" size="sm" onClick={() => router.push('/campaigns')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Campaigns
        </Button>
        <div className="flex-1">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Phone className="h-4 w-4" />
            {list.name}
          </h2>
          <p className="text-xs text-muted-foreground">
            {list.completed_items}/{list.total_items} completed · Phone Wizard
          </p>
        </div>
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
          ) : !contact ? (
            <div className="text-center py-20">
              <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <p className="text-lg font-semibold">All done!</p>
              <p className="text-sm text-muted-foreground mt-1">
                No more contacts to call on this list.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => router.push('/campaigns')}>
                Back to Campaigns
              </Button>
            </div>
          ) : (
            <>
              <ContactCard contact={contact} onEdit={() => setShowWorkerEdit(true)} />

              {flowState.phase === 'pre_call' && (
                <DialOutcomeBar onSelect={handleDialOutcome} />
              )}

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
                          ? 'This worker already has member-like status. Record recruitment intent. Standalone lists save outcomes only (no worker update).'
                          : 'Standalone lists record outcomes only; setting member pending on the worker requires a campaign call list.'}
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

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium">
                        CTA Response
                        {membershipHeroOutcomes.length > 0 && (
                          <span className="text-[10px] font-normal text-muted-foreground ml-1">(optional if membership above)</span>
                        )}
                      </label>
                      <Select value={ctaResponse || ''} onValueChange={(v) => setCtaResponse(v as CtaResponse)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {CTA_RESPONSES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Support Level</label>
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

              <div className="flex items-center gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={handleSkip}>
                  <SkipForward className="h-4 w-4 mr-1" />
                  Skip
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowCallbackDialog(true)}>
                  <Clock className="h-4 w-4 mr-1" />
                  Defer
                </Button>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={() => router.push('/campaigns')}>
                  <LogOut className="h-4 w-4 mr-1" />
                  End Session
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Right: Script Side Panel (desktop only) */}
        <div className="hidden lg:block flex-[2] border-l pl-4 overflow-y-auto">
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
              <p className="text-sm text-muted-foreground">No script attached to this list</p>
            </div>
          )}
        </div>
      </div>

      <CallbackScheduler
        open={showCallbackDialog}
        onClose={() => setShowCallbackDialog(false)}
        onSchedule={handleCallbackScheduled}
      />

      {contact?.worker && (
        <WorkerEditDialog
          open={showWorkerEdit}
          onClose={() => setShowWorkerEdit(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['phone-wizard-next', listId] })
          }}
          onRemovedFromCampaign={() => {
            setShowWorkerEdit(false)
            dispatch({ type: 'RESET' })
            dispatch({ type: 'LOAD_CONTACT' })
            refetchNext()
          }}
          workerId={contact.worker.worker_id}
          campaignId={null}
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
        />
      )}
    </div>
  )
}
